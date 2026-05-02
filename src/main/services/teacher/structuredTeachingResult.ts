import type { GroundedTeachingClaim } from './claimVerifier'

export const GOMENTOR_GROUNDING_JSON_MARKER = 'GOMENTOR_GROUNDING_JSON'

export type GroundedTeachingSection = 'judgement' | 'reason' | 'variation' | 'training' | 'profile' | 'evidence-note'

export interface GroundedTeachingOutput {
  schemaVersion: 1
  headline: string
  summary: string
  confidence: 'high' | 'medium' | 'low'
  claims: GroundedTeachingClaim[]
  sections: Array<{
    id: string
    section: GroundedTeachingSection
    markdown: string
    claimIds: string[]
  }>
  drills: string[]
  followupQuestions: string[]
  finalMarkdown: string
}

export interface StructuredTeachingValidation {
  ok: boolean
  warnings: string[]
  violations: string[]
  result?: GroundedTeachingOutput
}

export const GROUNDED_TEACHING_JSON_SCHEMA = {
  name: 'gomentor_grounded_teaching_output',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'headline', 'summary', 'confidence', 'claims', 'sections', 'drills', 'followupQuestions', 'finalMarkdown'],
    properties: {
      schemaVersion: { type: 'integer', enum: [1] },
      headline: { type: 'string' },
      summary: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      claims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'type', 'text', 'evidenceRefs', 'confidence'],
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: ['coordinate', 'numeric', 'pv', 'motif', 'joseki', 'life_death', 'sente_gote', 'ownership', 'student_profile']
            },
            text: { type: 'string' },
            evidenceRefs: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'section', 'markdown', 'claimIds'],
          properties: {
            id: { type: 'string' },
            section: { type: 'string', enum: ['judgement', 'reason', 'variation', 'training', 'profile', 'evidence-note'] },
            markdown: { type: 'string' },
            claimIds: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      drills: { type: 'array', items: { type: 'string' } },
      followupQuestions: { type: 'array', items: { type: 'string' } },
      finalMarkdown: { type: 'string' }
    }
  }
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
}

function normalizeJsonCandidate(text: string): string | null {
  const markerPattern = new RegExp(`${GOMENTOR_GROUNDING_JSON_MARKER}\\s*:?\\s*(\\{[\\s\\S]*?\\})\\s*(?:$|\\n)`, 'i')
  const marker = text.match(markerPattern)?.[1]
  if (marker) return marker.trim()

  const fenced = text.match(/```(?:json|gomentor-grounding-json)\s*([\s\S]*?)```/i)?.[1]
  if (fenced?.includes('"claims"')) return fenced.trim()

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1)
    return candidate.includes('"claims"') ? candidate : null
  }
  return null
}

export function extractGroundedTeachingResult(text: string): GroundedTeachingOutput | null {
  const candidate = normalizeJsonCandidate(text)
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate)
    const validation = validateGroundedTeachingResult(parsed)
    return validation.ok ? validation.result ?? null : null
  } catch {
    return null
  }
}

export function validateGroundedTeachingResult(value: unknown): StructuredTeachingValidation {
  const warnings: string[] = []
  const violations: string[] = []
  if (!isRecord(value)) {
    return { ok: false, warnings, violations: ['Structured teaching result must be an object.'] }
  }
  if (value.schemaVersion !== 1) violations.push('schemaVersion must be 1.')
  for (const key of ['headline', 'summary', 'finalMarkdown'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim()) violations.push(`${key} must be a non-empty string.`)
  }
  if (!['high', 'medium', 'low'].includes(String(value.confidence))) violations.push('confidence must be high, medium, or low.')
  if (!Array.isArray(value.claims)) violations.push('claims must be an array.')
  if (!Array.isArray(value.sections)) violations.push('sections must be an array.')
  const drills = stringArray(value.drills)
  const followupQuestions = stringArray(value.followupQuestions)
  if (!drills) violations.push('drills must be an array of strings.')
  if (!followupQuestions) violations.push('followupQuestions must be an array of strings.')

  const claims: GroundedTeachingClaim[] = []
  const claimIds = new Set<string>()
  for (const [index, rawClaim] of (Array.isArray(value.claims) ? value.claims : []).entries()) {
    if (!isRecord(rawClaim)) {
      violations.push(`claims[${index}] must be an object.`)
      continue
    }
    const id = typeof rawClaim.id === 'string' ? rawClaim.id.trim() : ''
    const type = typeof rawClaim.type === 'string' ? rawClaim.type.trim() : ''
    const text = typeof rawClaim.text === 'string' ? rawClaim.text.trim() : ''
    const evidenceRefs = stringArray(rawClaim.evidenceRefs)
    const confidence = typeof rawClaim.confidence === 'string' ? rawClaim.confidence.trim() : ''
    if (!id) violations.push(`claims[${index}].id is required.`)
    if (id && claimIds.has(id)) violations.push(`Duplicate claim id ${id}.`)
    if (id) claimIds.add(id)
    if (!['coordinate', 'numeric', 'pv', 'motif', 'joseki', 'life_death', 'sente_gote', 'ownership', 'student_profile'].includes(type)) {
      violations.push(`claims[${index}].type is invalid.`)
    }
    if (!text) violations.push(`claims[${index}].text is required.`)
    if (!evidenceRefs || evidenceRefs.length === 0) violations.push(`claims[${index}].evidenceRefs must be non-empty.`)
    if (!['high', 'medium', 'low'].includes(confidence)) violations.push(`claims[${index}].confidence is invalid.`)
    if (id && type && text && evidenceRefs && ['high', 'medium', 'low'].includes(confidence)) {
      claims.push({ id, type: type as GroundedTeachingClaim['type'], text, evidenceRefs, confidence: confidence as GroundedTeachingClaim['confidence'] })
    }
  }

  const sections: GroundedTeachingOutput['sections'] = []
  for (const [index, rawSection] of (Array.isArray(value.sections) ? value.sections : []).entries()) {
    if (!isRecord(rawSection)) {
      violations.push(`sections[${index}] must be an object.`)
      continue
    }
    const id = typeof rawSection.id === 'string' ? rawSection.id.trim() : ''
    const section = typeof rawSection.section === 'string' ? rawSection.section.trim() : ''
    const markdown = typeof rawSection.markdown === 'string' ? rawSection.markdown.trim() : ''
    const sectionClaimIds = stringArray(rawSection.claimIds)
    if (!id) violations.push(`sections[${index}].id is required.`)
    if (!['judgement', 'reason', 'variation', 'training', 'profile', 'evidence-note'].includes(section)) violations.push(`sections[${index}].section is invalid.`)
    if (!markdown) warnings.push(`sections[${index}] has empty markdown.`)
    if (!sectionClaimIds) violations.push(`sections[${index}].claimIds must be an array of strings.`)
    for (const claimId of sectionClaimIds ?? []) {
      if (!claimIds.has(claimId)) violations.push(`sections[${index}] references unknown claim ${claimId}.`)
    }
    if (id && ['judgement', 'reason', 'variation', 'training', 'profile', 'evidence-note'].includes(section) && sectionClaimIds) {
      sections.push({ id, section: section as GroundedTeachingSection, markdown, claimIds: sectionClaimIds })
    }
  }

  if (claims.length === 0) warnings.push('Structured result has no validated claims; quality gate will fall back to markdown scanning.')
  const result: GroundedTeachingOutput | undefined = violations.length
    ? undefined
    : {
        schemaVersion: 1,
        headline: String(value.headline),
        summary: String(value.summary),
        confidence: value.confidence as GroundedTeachingOutput['confidence'],
        claims,
        sections,
        drills: drills ?? [],
        followupQuestions: followupQuestions ?? [],
        finalMarkdown: String(value.finalMarkdown)
      }
  return { ok: violations.length === 0, warnings, violations, result }
}

export function buildStructuredTeachingInstruction(): string {
  return [
    '为了便于 GoMentor 校验证据，最终答案应能被拆成结构化 claims。',
    `如果当前 LLM 支持结构化 JSON，请按 ${GOMENTOR_GROUNDING_JSON_MARKER} 输出 GroundedTeachingOutput；否则输出自然语言，但每个关键结论必须可回指到 KataGo、棋盘、知识库或学生画像证据。`,
    '每条 claim 必须包含 evidenceRefs；没有证据的坐标、胜率、目差、PV、定式名、死活结论和先后手判断必须降级为假设或省略。',
    'finalMarkdown 是给学生看的最终讲解，claims 是给本地 verifier 检查的证据声明。'
  ].join('\n')
}
