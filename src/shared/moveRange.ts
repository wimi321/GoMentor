export interface ParsedMoveRange {
  start: number
  end: number
}

export interface MoveRangeValidation {
  ok: boolean
  range?: ParsedMoveRange
  reason?: string
}

export const MOVE_RANGE_MAX_MOVES = 80
export const MOVE_RANGE_KEY_MOVE_LIMIT = 6

const CONTEXTUAL_MOVE_RANGE_PATTERN = new RegExp(
  [
    // Examples: 第100手到第200手, 100手から200手, 100수부터200수, moves 100-200.
    '(?:第\\s*)?(\\d+)\\s*手\\s*(?:到|至)\\s*(?:第\\s*)?(\\d+)\\s*手',
    '(?:第\\s*)?(\\d+)\\s*手\\s*(?:から|〜|~)\\s*(?:第\\s*)?(\\d+)\\s*手',
    '(\\d+)\\s*수\\s*(?:부터|~|-)\\s*(\\d+)\\s*수',
    'moves?\\s+(\\d+)\\s*(?:[-~—−])\\s*(\\d+)',
    'from\\s+move\\s+(\\d+)\\s+to\\s+(?:move\\s+)?(\\d+)',
    'moves?\\s+(\\d+)\\s+to\\s+(?:move\\s+)?(\\d+)',
    'moves?\\s+(\\d+)\\s+(?:through|thru)\\s+(\\d+)'
  ].join('|'),
  'i'
)

const BARE_NUMERIC_RANGE_PATTERN = /(\d+)\s*[-~—−]\s*(\d+)/
const BARE_FROM_TO_PATTERN = /from\s+(\d+)\s+to\s+(\d+)/i

const DATE_LIKE_PATTERN = /\b\d{4}\s*[-~—−]\s*\d{1,2}\s*[-~—−]\s*\d{1,2}\b/
const SCORE_LIKE_PATTERN = /\d+\s*[-~—−]\s*\d+\s*(?:目|points?|pts?|moku)\b/i
const WINRATE_LIKE_PATTERN = /(?:胜率|勝率|win\s*rate|winrate|score|目差).{0,12}\d+\s*(?:[-~—−]|to)\s*\d+/i

function looksLikeBareRangeCommand(text: string): boolean {
  const t = text.trim()
  return /^(?:分析|看|讲|复盘|review|analyze)?\s*\d+\s*[-~—−]\s*\d+\s*(?:手|moves?)?\s*$/i.test(t) ||
    /^(?:review|analyze)?\s*from\s+\d+\s+to\s+\d+\s*(?:moves?)?\s*$/i.test(t)
}

function extractContextualNumbers(match: RegExpMatchArray): { a: number; b: number } | null {
  for (let index = 1; index < match.length; index += 2) {
    const aRaw = match[index]
    const bRaw = match[index + 1]
    if (!aRaw || !bRaw) continue
    const a = Number(aRaw)
    const b = Number(bRaw)
    if (Number.isInteger(a) && Number.isInteger(b)) return { a, b }
  }
  return null
}

export function moveRangeLength(range: ParsedMoveRange): number {
  return Math.max(0, range.end - range.start + 1)
}

export function describeMoveRange(range: ParsedMoveRange): string {
  return `第 ${range.start}-${range.end} 手`
}

export function validateMoveRange(
  startInput: number,
  endInput: number,
  totalMoves?: number,
  maxMoves = MOVE_RANGE_MAX_MOVES
): MoveRangeValidation {
  if (!Number.isInteger(startInput) || !Number.isInteger(endInput)) {
    return { ok: false, reason: 'move range must use integer move numbers' }
  }
  const start = Math.min(startInput, endInput)
  const end = Math.max(startInput, endInput)
  if (start < 1) return { ok: false, reason: 'move range must start at move 1 or later' }
  if (end <= start) return { ok: false, reason: 'move range must contain at least two moves' }
  if (totalMoves !== undefined && end > totalMoves) {
    return { ok: false, reason: `move range ends at ${end}, beyond game length ${totalMoves}` }
  }
  if (moveRangeLength({ start, end }) > maxMoves) {
    return { ok: false, reason: `move range contains ${end - start + 1} moves; please keep it within ${maxMoves} moves for focused review` }
  }
  return { ok: true, range: { start, end } }
}

export function parseMoveRangeFromPrompt(
  text: string,
  totalMoves?: number,
  maxMoves = MOVE_RANGE_MAX_MOVES
): ParsedMoveRange | null {
  const source = text.trim()
  if (!source) return null
  if (DATE_LIKE_PATTERN.test(source) || SCORE_LIKE_PATTERN.test(source) || WINRATE_LIKE_PATTERN.test(source)) {
    return null
  }

  const contextualMatch = source.match(CONTEXTUAL_MOVE_RANGE_PATTERN)
  if (contextualMatch) {
    const extracted = extractContextualNumbers(contextualMatch)
    if (!extracted) return null
    const validation = validateMoveRange(extracted.a, extracted.b, totalMoves, maxMoves)
    return validation.ok ? validation.range ?? null : null
  }

  if (!looksLikeBareRangeCommand(source)) return null

  const fromToMatch = source.match(BARE_FROM_TO_PATTERN)
  if (fromToMatch) {
    const validation = validateMoveRange(Number(fromToMatch[1]), Number(fromToMatch[2]), totalMoves, maxMoves)
    return validation.ok ? validation.range ?? null : null
  }
  const bareMatch = source.match(BARE_NUMERIC_RANGE_PATTERN)
  if (bareMatch) {
    const validation = validateMoveRange(Number(bareMatch[1]), Number(bareMatch[2]), totalMoves, maxMoves)
    return validation.ok ? validation.range ?? null : null
  }
  return null
}

export interface MoveRangeKeyMoveSummary {
  moveNumber: number
  moveColor?: 'B' | 'W'
  playedMove?: string
  bestMove?: string
  blackWinrateBefore?: number
  blackScoreLeadBefore?: number
  blackWinrateAfter?: number
  blackScoreLeadAfter?: number
  winrateLoss: number
  scoreLoss: number
  judgement?: string
  evidenceRefs: string[]
}

export interface MoveRangeSummaryLike {
  start: number
  end: number
  totalMoves: number
  keyMoves: MoveRangeKeyMoveSummary[]
  omittedMoves: number
  analysisMethod: string
  progression?: import('./moveRangeAnalysis').MoveRangeProgression
}

export function selectKeyMoveNumbers(summary: MoveRangeSummaryLike | undefined, fallbackRange: ParsedMoveRange | undefined, limit = MOVE_RANGE_KEY_MOVE_LIMIT): number[] {
  const values = new Set<number>()
  for (const item of summary?.keyMoves ?? []) {
    if (Number.isInteger(item.moveNumber)) values.add(item.moveNumber)
  }
  if (fallbackRange) {
    values.add(fallbackRange.start)
    values.add(fallbackRange.end)
  }
  return Array.from(values).sort((a, b) => a - b).slice(0, limit)
}
