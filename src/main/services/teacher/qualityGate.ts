import type { TeachingEvidence, TeacherMarkdownVerification } from './teachingEvidence'
import { buildVerificationNote, verifyTeacherMarkdown } from './teachingEvidence'
import {
  buildClaimVerificationNote,
  verifyGroundedClaims,
  verifyTeacherClaimsFromMarkdown,
  type ClaimVerificationResult
} from './claimVerifier'
import { extractGroundedTeachingResult, validateGroundedTeachingResult, type GroundedTeachingOutput } from './structuredTeachingResult'

export interface TeacherQualityGateInput {
  markdown: string
  evidence?: TeachingEvidence
  locale?: unknown
  failOnWarning?: boolean
}

export interface TeacherQualityGateResult {
  ok: boolean
  warnings: string[]
  violations: string[]
  markdownVerification?: TeacherMarkdownVerification
  claimVerification?: ClaimVerificationResult
  structuredOutput?: GroundedTeachingOutput
  structuredWarnings: string[]
  structuredViolations: string[]
  note: string
}

function mergeUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function runTeacherQualityGate(input: TeacherQualityGateInput): TeacherQualityGateResult {
  const structured = extractGroundedTeachingResult(input.markdown)
  const structuredValidation = structured
    ? validateGroundedTeachingResult(structured)
    : { ok: true, warnings: ['No structured grounding JSON found; using markdown claim extraction.'], violations: [] as string[] }

  let markdownVerification: TeacherMarkdownVerification | undefined
  let claimVerification: ClaimVerificationResult | undefined
  const warnings: string[] = [...structuredValidation.warnings]
  const violations: string[] = [...structuredValidation.violations]

  if (input.evidence) {
    markdownVerification = verifyTeacherMarkdown(input.markdown, input.evidence)
    claimVerification = structured?.claims?.length
      ? verifyGroundedClaims(structured.claims, input.evidence)
      : verifyTeacherClaimsFromMarkdown(input.markdown, input.evidence)
    warnings.push(...markdownVerification.warnings, ...claimVerification.warnings)
    violations.push(...markdownVerification.violations, ...claimVerification.violations)
  } else {
    warnings.push('No TeachingEvidence was provided; quality gate could not verify coordinates, numbers, PV, joseki names, or confidence wording.')
  }

  const uniqueWarnings = mergeUnique(warnings)
  const uniqueViolations = mergeUnique(violations)
  const ok = uniqueViolations.length === 0 && (!input.failOnWarning || uniqueWarnings.length === 0)
  const noteParts: string[] = []
  if (input.evidence && markdownVerification) {
    noteParts.push(buildVerificationNote(markdownVerification, input.evidence, input.locale))
  }
  if (input.evidence && claimVerification) {
    noteParts.push(buildClaimVerificationNote(claimVerification))
  }
  if (!noteParts.length) {
    noteParts.push(`> GoMentor 质量门禁：${ok ? '通过' : '未通过'}。${uniqueViolations.concat(uniqueWarnings).slice(0, 3).join('；') || '没有可校验的证据。'}`)
  }

  return {
    ok,
    warnings: uniqueWarnings,
    violations: uniqueViolations,
    markdownVerification,
    claimVerification,
    structuredOutput: structured ?? undefined,
    structuredWarnings: structuredValidation.warnings,
    structuredViolations: structuredValidation.violations,
    note: noteParts.join('\n')
  }
}

export function appendTeacherQualityGateNote(markdown: string, gate: TeacherQualityGateResult): string {
  const trimmed = markdown.trim()
  if (!gate.note.trim()) return trimmed
  return `${trimmed}\n\n${gate.note.trim()}`
}
