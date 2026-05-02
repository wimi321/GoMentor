export interface ParsedMoveRange {
  start: number
  end: number
}

// Contextual patterns: require language markers (手/수/moves/from/to/through)
const CONTEXTUAL_MOVE_RANGE_PATTERN = new RegExp(
  [
    // Chinese: 第100手到第200手, 100手至200手
    '(?:第\\s*)?(\\d+)\\s*手\\s*(?:到|至)\\s*(?:第\\s*)?(\\d+)\\s*手',
    // Japanese: 100手から200手, 第100手から第200手, 100手〜200手
    '(?:第\\s*)?(\\d+)\\s*手\\s*(?:から|〜)\\s*(?:第\\s*)?(\\d+)\\s*手',
    // Korean: 100수부터200수, 100수~200수, 100수-200수
    '(\\d+)\\s*수\\s*(?:부터|~|-)\\s*(\\d+)\\s*수',
    // English: moves 100-200 (requires "moves" prefix)
    'moves?\\s+(\\d+)\\s*(?:[-~—−])\\s*(\\d+)',
    // English: from move 100 to 200, from move 100 to move 200
    'from\\s+move\\s+(\\d+)\\s+to\\s+(?:move\\s+)?(\\d+)',
    // English: move 100 to move 200, moves 100 to 200
    'moves?\\s+(\\d+)\\s+to\\s+(?:move\\s+)?(\\d+)',
    // English: moves 100 through 200
    'moves?\\s+(\\d+)\\s+(?:through|thru)\\s+(\\d+)'
  ].join('|'),
  'i'
)

// Bare numeric range: only accepted when the whole prompt looks like a short command
const BARE_NUMERIC_RANGE_PATTERN = /(\d+)\s*[-~—−]\s*(\d+)/
const BARE_FROM_TO_PATTERN = /from\s+(\d+)\s+to\s+(\d+)/

function looksLikeBareRangeCommand(text: string): boolean {
  const t = text.trim()
  return /^(?:分析|看|讲|复盘|review|analyze)?\s*\d+\s*[-~—−]\s*\d+\s*(?:手|moves?)?\s*$/i.test(t) ||
    /^(?:review|analyze)?\s*from\s+\d+\s+to\s+\d+\s*(?:moves?)?\s*$/i.test(t)
}

function extractMatch(match: RegExpMatchArray): { a: number; b: number } | null {
  const aRaw = match[1] ?? match[3] ?? match[5] ?? match[7] ?? match[9] ?? match[11] ?? match[13]
  const bRaw = match[2] ?? match[4] ?? match[6] ?? match[8] ?? match[10] ?? match[12] ?? match[14]
  if (!aRaw || !bRaw) return null
  const a = Number(aRaw)
  const b = Number(bRaw)
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null
  return { a, b }
}

export function parseMoveRangeFromPrompt(text: string, totalMoves?: number): ParsedMoveRange | null {
  // 1. Try contextual patterns first (always safe)
  const contextualMatch = text.match(CONTEXTUAL_MOVE_RANGE_PATTERN)
  if (contextualMatch) {
    const extracted = extractMatch(contextualMatch)
    if (extracted) {
      const start = Math.min(extracted.a, extracted.b)
      const end = Math.max(extracted.a, extracted.b)
      if (start < 1 || end <= start) return null
      if (totalMoves !== undefined && end > totalMoves) return null
      return { start, end }
    }
  }

  // 2. Bare numeric/from-to range: only when prompt is a short command-like phrase
  if (looksLikeBareRangeCommand(text)) {
    const fromToMatch = text.match(BARE_FROM_TO_PATTERN)
    if (fromToMatch) {
      const a = Number(fromToMatch[1])
      const b = Number(fromToMatch[2])
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const start = Math.min(a, b)
        const end = Math.max(a, b)
        if (start < 1 || end <= start) return null
        if (totalMoves !== undefined && end > totalMoves) return null
        return { start, end }
      }
    }
    const bareMatch = text.match(BARE_NUMERIC_RANGE_PATTERN)
    if (bareMatch) {
      const a = Number(bareMatch[1])
      const b = Number(bareMatch[2])
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const start = Math.min(a, b)
        const end = Math.max(a, b)
        if (start < 1 || end <= start) return null
        if (totalMoves !== undefined && end > totalMoves) return null
        return { start, end }
      }
    }
  }

  return null
}
