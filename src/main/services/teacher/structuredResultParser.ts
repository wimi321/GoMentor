import type { StructuredTeacherResult, TeacherKeyMistake, TeacherTaskType } from './resultSchema'

interface ExtractedJson {
  value: unknown
  trailingText: string
}

function splitLeadingJsonObject(text: string): { jsonText: string; trailingText: string } | null {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{')) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return {
          jsonText: trimmed.slice(0, index + 1),
          trailingText: trimmed.slice(index + 1).trim()
        }
      }
    }
  }
  return null
}

function extractJson(text: string): ExtractedJson | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim()
  const trailingText = fenced ? trimmed.replace(fenced[0], '').trim() : ''
  const leading = candidate ? { jsonText: candidate, trailingText } : splitLeadingJsonObject(trimmed)
  if (!leading) return null
  try {
    return {
      value: JSON.parse(leading.jsonText) as unknown,
      trailingText: leading.trailingText
    }
  } catch {
    return null
  }
}

function asString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function normalizeSeverity(value: unknown): 'inaccuracy' | 'mistake' | 'blunder' {
  if (value === 'blunder' || value === 'mistake' || value === 'inaccuracy') return value
  return 'mistake'
}

function normalizeTaskType(value: unknown, defaultValue: TeacherTaskType): TeacherTaskType {
  if (value === 'current-move' || value === 'full-game' || value === 'recent-games' || value === 'freeform') return value
  return defaultValue
}

function normalizeColor(value: unknown): 'B' | 'W' | undefined {
  return value === 'B' || value === 'W' ? value : undefined
}

function firstMeaningfulLine(text: string): string {
  const line = text.split('\n').map((item) => item.trim()).find(Boolean) ?? ''
  return line.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '').trim()
}

function structuredMarkdownFromJson(input: {
  headline: string
  summary: string
  keyMistakes: TeacherKeyMistake[]
  correctThinking: string[]
  drills: string[]
  followupQuestions: string[]
  trailingText: string
}): string {
  const lines: string[] = []
  if (input.headline) lines.push(input.headline)
  if (input.summary) lines.push('', input.summary)
  if (input.keyMistakes.length) {
    lines.push('', '关键问题手：')
    for (const mistake of input.keyMistakes.slice(0, 4)) {
      const move = mistake.moveNumber ? `第 ${mistake.moveNumber} 手` : '当前手'
      const change = mistake.played || mistake.recommended
        ? `（${[mistake.played ? `实战 ${mistake.played}` : '', mistake.recommended ? `推荐 ${mistake.recommended}` : ''].filter(Boolean).join('，')}）`
        : ''
      lines.push(`- ${move}${change}：${mistake.explanation || mistake.evidence || mistake.errorType}`)
    }
  }
  if (input.correctThinking.length) {
    lines.push('', '正确思路：')
    for (const item of input.correctThinking.slice(0, 4)) lines.push(`- ${item}`)
  }
  if (input.drills.length) {
    lines.push('', '训练建议：')
    for (const item of input.drills.slice(0, 3)) lines.push(`- ${item}`)
  }
  if (input.followupQuestions.length) {
    lines.push('', '可以继续问：')
    for (const item of input.followupQuestions.slice(0, 3)) lines.push(`- ${item}`)
  }
  if (input.trailingText) lines.push('', input.trailingText)
  return lines.join('\n').trim()
}

export function parseStructuredTeacherResult(input: {
  text: string
  taskType: TeacherTaskType
  knowledgeCardIds?: string[]
}): StructuredTeacherResult {
  const extracted = extractJson(input.text)
  if (extracted?.value && typeof extracted.value === 'object') {
    const obj = extracted.value as Record<string, unknown>
    const keyMistakes = Array.isArray(obj.keyMistakes)
      ? obj.keyMistakes.map((item) => {
          const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          return {
            moveNumber: typeof row.moveNumber === 'number' ? row.moveNumber : undefined,
            color: normalizeColor(row.color),
            played: asString(row.played),
            recommended: asString(row.recommended),
            errorType: asString(row.errorType),
            severity: normalizeSeverity(row.severity),
            evidence: asString(row.evidence),
            explanation: asString(row.explanation)
          }
        })
      : []
    const headline = asString(obj.headline)
    const summary = asString(obj.summary, input.text.split('\n').find((line) => line.trim())?.trim() ?? '')
    const correctThinking = asStringArray(obj.correctThinking)
    const drills = asStringArray(obj.drills)
    const followupQuestions = asStringArray(obj.followupQuestions)
    const markdown = asString(obj.markdown) || structuredMarkdownFromJson({
      headline,
      summary,
      keyMistakes,
      correctThinking,
      drills,
      followupQuestions,
      trailingText: extracted.trailingText
    })

    const result: StructuredTeacherResult = {
      taskType: normalizeTaskType(obj.taskType, input.taskType),
      headline,
      summary,
      keyMistakes,
      correctThinking,
      drills,
      followupQuestions,
      markdown: markdown || input.text,
      knowledgeCardIds: asStringArray(obj.knowledgeCardIds).length > 0 ? asStringArray(obj.knowledgeCardIds) : input.knowledgeCardIds ?? [],
      profileUpdates: {
        errorTypes: asStringArray((obj.profileUpdates as Record<string, unknown> | undefined)?.errorTypes),
        patterns: asStringArray((obj.profileUpdates as Record<string, unknown> | undefined)?.patterns),
        trainingFocus: asStringArray((obj.profileUpdates as Record<string, unknown> | undefined)?.trainingFocus)
      }
    }
    return result
  }

  return {
    taskType: input.taskType,
    headline: firstMeaningfulLine(input.text),
    summary: firstMeaningfulLine(input.text),
    keyMistakes: [],
    correctThinking: [],
    drills: [],
    followupQuestions: [],
    markdown: input.text,
    knowledgeCardIds: input.knowledgeCardIds ?? [],
    profileUpdates: {
      errorTypes: [],
      patterns: [],
      trainingFocus: []
    }
  }
}
