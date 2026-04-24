import type { StructuredTeacherResult, TeacherTaskType } from './resultSchema'
import { renderStructuredTeacherResult } from './resultSchema'

function extractJson(text: string): unknown | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  if (!candidate.startsWith('{')) return null
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    return null
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function normalizeSeverity(value: unknown): 'inaccuracy' | 'mistake' | 'blunder' {
  if (value === 'blunder' || value === 'mistake' || value === 'inaccuracy') return value
  return 'mistake'
}

function normalizeTaskType(value: unknown, fallback: TeacherTaskType): TeacherTaskType {
  if (value === 'current-move' || value === 'full-game' || value === 'recent-games' || value === 'freeform') return value
  return fallback
}

function normalizeColor(value: unknown): 'B' | 'W' | undefined {
  return value === 'B' || value === 'W' ? value : undefined
}

export function parseStructuredTeacherResult(input: {
  text: string
  taskType: TeacherTaskType
  knowledgeCardIds?: string[]
}): StructuredTeacherResult {
  const json = extractJson(input.text)
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    const keyMistakes = Array.isArray(obj.keyMistakes)
      ? obj.keyMistakes.map((item) => {
          const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          return {
            moveNumber: typeof row.moveNumber === 'number' ? row.moveNumber : undefined,
            color: normalizeColor(row.color),
            played: asString(row.played),
            recommended: asString(row.recommended),
            errorType: asString(row.errorType, '未分类'),
            severity: normalizeSeverity(row.severity),
            evidence: asString(row.evidence, 'KataGo 分析显示该处存在明显收益差。'),
            explanation: asString(row.explanation, '这手需要结合全局方向重新判断。')
          }
        })
      : []

    const result: StructuredTeacherResult = {
      taskType: normalizeTaskType(obj.taskType, input.taskType),
      headline: asString(obj.headline, '这盘棋最重要的是先抓住主问题'),
      summary: asString(obj.summary, input.text.slice(0, 500)),
      keyMistakes,
      correctThinking: asStringArray(obj.correctThinking),
      drills: asStringArray(obj.drills),
      followupQuestions: asStringArray(obj.followupQuestions),
      markdown: asString(obj.markdown),
      knowledgeCardIds: asStringArray(obj.knowledgeCardIds).length > 0 ? asStringArray(obj.knowledgeCardIds) : input.knowledgeCardIds ?? [],
      profileUpdates: {
        errorTypes: asStringArray((obj.profileUpdates as Record<string, unknown> | undefined)?.errorTypes),
        patterns: asStringArray((obj.profileUpdates as Record<string, unknown> | undefined)?.patterns),
        trainingFocus: asStringArray((obj.profileUpdates as Record<string, unknown> | undefined)?.trainingFocus)
      }
    }
    return {
      ...result,
      markdown: result.markdown || renderStructuredTeacherResult(result)
    }
  }

  const fallback: StructuredTeacherResult = {
    taskType: input.taskType,
    headline: '老师分析完成',
    summary: input.text.split('\n').find((line) => line.trim())?.trim() ?? '已完成本次复盘分析。',
    keyMistakes: [],
    correctThinking: [],
    drills: [],
    followupQuestions: ['要不要我把这盘棋的最大转折点单独展开讲？'],
    markdown: input.text,
    knowledgeCardIds: input.knowledgeCardIds ?? [],
    profileUpdates: {
      errorTypes: [],
      patterns: [],
      trainingFocus: []
    }
  }
  return fallback
}

export function structuredResultOutputInstruction(): string {
  return [
    '请优先输出 JSON，不要包在 markdown 里。JSON 结构如下：',
    '{',
    '  "taskType": "current-move|full-game|recent-games|freeform",',
    '  "headline": "一句话核心结论",',
    '  "summary": "面向学生的简洁总结",',
    '  "keyMistakes": [{"moveNumber": 42, "color": "B", "played": "D4", "recommended": "Q16", "errorType": "方向", "severity": "mistake", "evidence": "KataGo证据", "explanation": "老师解释"}],',
    '  "correctThinking": ["正确思路1"],',
    '  "drills": ["训练建议1"],',
    '  "followupQuestions": ["可追问问题1"],',
    '  "knowledgeCardIds": ["direction_global_over_local"],',
    '  "profileUpdates": {"errorTypes": ["方向"], "patterns": ["局部过重"], "trainingFocus": ["方向感复盘"]}',
    '}',
    '如果无法严格 JSON，也必须按：结论、关键证据、为什么错、正确思路、训练建议 五段输出。'
  ].join('\n')
}
