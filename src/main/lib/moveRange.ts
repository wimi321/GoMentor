export interface ParsedMoveRange {
  start: number
  end: number
}

// Separators: 到 至 - ~ — ~ − から 부터 ~까지
// Prefixes: 第 手 수 手 目 move moves
// Suffixes: 手 수 手 目
const MOVE_RANGE_PATTERN = new RegExp(
  [
    // Chinese: 第100手到第200手, 100手到200手, 100到200手
    '(?:第\\s*)?(\\d+)\\s*手?\\s*(?:到|至)\\s*(?:第\\s*)?(\\d+)\\s*手?',
    // Numeric range: 100-200, 100~200, 100—200, 100−200, moves 100-200
    '(?:moves?\\s+)?(\\d+)\\s*(?:[-~—−])\\s*(\\d+)',
    // Japanese: 100手から200手, 100手〜200手, 第100手から第200手
    '(?:第\\s*)?(\\d+)\\s*手\\s*(?:から|〜)\\s*(?:第\\s*)?(\\d+)\\s*手',
    // Korean: 100수부터200수, 100수~200수, 100수-200수
    '(\\d+)\\s*수\\s*(?:부터|~|-)\\s*(\\d+)\\s*수',
    // English: from move 100 to 200, from move 100 to move 200, moves 100 to 200
    '(?:from\\s+)?(?:move\\s+)?(\\d+)\\s+to\\s+(?:move\\s+)?(\\d+)',
    // English: moves 100 through 200, move 100 thru 200
    '(?:moves?\\s+)?(\\d+)\\s+(?:through|thru)\\s+(\\d+)'
  ].join('|'),
  'i'
)

export function parseMoveRangeFromPrompt(text: string, totalMoves?: number): ParsedMoveRange | null {
  const match = text.match(MOVE_RANGE_PATTERN)
  if (!match) return null

  // Find the first two captured groups that matched
  const aRaw = match[1] ?? match[3] ?? match[5] ?? match[7] ?? match[9] ?? match[11]
  const bRaw = match[2] ?? match[4] ?? match[6] ?? match[8] ?? match[10] ?? match[12]
  if (!aRaw || !bRaw) return null

  const a = Number(aRaw)
  const b = Number(bRaw)
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null

  const start = Math.min(a, b)
  const end = Math.max(a, b)
  if (start < 1 || end <= start) return null
  if (totalMoves !== undefined && end > totalMoves) return null

  return { start, end }
}
