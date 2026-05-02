import type { BoardSnapshotStone, LocalWindow } from './matchEngine'

export type LocalPatternPointState = 'friendly' | 'enemy' | 'empty' | 'black' | 'white' | 'any-stone'
export type LocalPatternConfidence = 'strong' | 'medium' | 'weak'

export interface LocalPatternPoint {
  dx: number
  dy: number
  state: LocalPatternPointState
  required?: boolean
}

export interface LocalPatternConstraint {
  type: 'min-friendly-liberties' | 'min-enemy-liberties' | 'edge-distance' | 'anchor-empty'
  value: number
}

export interface ShapePatternCard {
  id: string
  title: string
  shapeType: string
  category: string
  anchorRole: 'actual' | 'candidate' | 'either'
  phase: Array<'opening' | 'middlegame' | 'endgame' | 'any'>
  regions: Array<'corner' | 'side' | 'center' | 'any'>
  tags: string[]
  sourceRefs: string[]
  sourceQuality: string
  minScore?: number
  points: LocalPatternPoint[]
  constraints?: LocalPatternConstraint[]
  antiPatterns?: LocalPatternPoint[]
  teaching: {
    recognition: string
    wrongThinking: string
    correctThinking: string
    drillPrompt: string
  }
}

export interface LocalPatternMatcherInput {
  boardSize: number
  boardSnapshot?: BoardSnapshotStone[]
  localWindows?: LocalWindow[]
  anchors: Array<string | undefined>
  playerColor?: 'B' | 'W'
  phase?: 'opening' | 'middlegame' | 'endgame'
}

export interface LocalPatternMatch {
  card: ShapePatternCard
  confidence: LocalPatternConfidence
  score: number
  anchor: string
  transform: string
  perspective: 'B' | 'W'
  matchedPoints: number
  requiredPoints: number
  evidence: string[]
  counterEvidence: string[]
}

type Transform = { name: string; apply: (dx: number, dy: number) => [number, number] }

const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'
const TRANSFORMS: Transform[] = [
  { name: 'identity', apply: (dx, dy) => [dx, dy] },
  { name: 'rotate90', apply: (dx, dy) => [-dy, dx] },
  { name: 'rotate180', apply: (dx, dy) => [-dx, -dy] },
  { name: 'rotate270', apply: (dx, dy) => [dy, -dx] },
  { name: 'mirror-x', apply: (dx, dy) => [-dx, dy] },
  { name: 'mirror-y', apply: (dx, dy) => [dx, -dy] },
  { name: 'mirror-main-diagonal', apply: (dx, dy) => [dy, dx] },
  { name: 'mirror-anti-diagonal', apply: (dx, dy) => [-dy, -dx] }
]

function gtpToCoord(point: string | undefined, boardSize: number): { row: number; col: number } | null {
  if (!point) return null
  const match = point.trim().toUpperCase().match(/^([A-HJ-Z])(\d{1,2})$/)
  if (!match) return null
  const col = GTP_COLUMNS.slice(0, boardSize).indexOf(match[1])
  const number = Number(match[2])
  if (col < 0 || number < 1 || number > boardSize) return null
  return { row: boardSize - number, col }
}

function key(row: number, col: number): string {
  return `${row},${col}`
}

function buildBoard(stones: BoardSnapshotStone[] | undefined, boardSize: number): Map<string, 'B' | 'W'> {
  const board = new Map<string, 'B' | 'W'>()
  for (const stone of stones ?? []) {
    const coord = gtpToCoord(stone.point, boardSize)
    if (coord) board.set(key(coord.row, coord.col), stone.color)
  }
  return board
}

function opposite(color: 'B' | 'W'): 'B' | 'W' {
  return color === 'B' ? 'W' : 'B'
}

function stateMatches(actual: 'B' | 'W' | undefined, expected: LocalPatternPointState, perspective: 'B' | 'W'): boolean {
  if (expected === 'empty') return !actual
  if (expected === 'any-stone') return Boolean(actual)
  if (expected === 'black') return actual === 'B'
  if (expected === 'white') return actual === 'W'
  if (expected === 'friendly') return actual === perspective
  return actual === opposite(perspective)
}

function neighbors(row: number, col: number, boardSize: number): Array<{ row: number; col: number }> {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 }
  ].filter((point) => point.row >= 0 && point.col >= 0 && point.row < boardSize && point.col < boardSize)
}

function libertyCount(board: Map<string, 'B' | 'W'>, row: number, col: number, boardSize: number): number {
  const color = board.get(key(row, col))
  if (!color) return 0
  const seen = new Set<string>()
  const libs = new Set<string>()
  const stack = [{ row, col }]
  while (stack.length) {
    const current = stack.pop()!
    const currentKey = key(current.row, current.col)
    if (seen.has(currentKey) || board.get(currentKey) !== color) continue
    seen.add(currentKey)
    for (const next of neighbors(current.row, current.col, boardSize)) {
      const nextKey = key(next.row, next.col)
      const nextColor = board.get(nextKey)
      if (!nextColor) libs.add(nextKey)
      else if (nextColor === color) stack.push(next)
    }
  }
  return libs.size
}

function pointRegion(row: number, col: number, boardSize: number): 'corner' | 'side' | 'center' {
  const x = Math.min(col, boardSize - 1 - col)
  const y = Math.min(row, boardSize - 1 - row)
  if (x <= 5 && y <= 5) return 'corner'
  if (Math.min(x, y) <= 3) return 'side'
  return 'center'
}

function phaseMatches(card: ShapePatternCard, phase: LocalPatternMatcherInput['phase']): boolean {
  return card.phase.includes('any') || !phase || card.phase.includes(phase)
}

function regionMatches(card: ShapePatternCard, anchor: { row: number; col: number }, boardSize: number): boolean {
  const region = pointRegion(anchor.row, anchor.col, boardSize)
  return card.regions.includes('any') || card.regions.includes(region)
}

function constraintSatisfied(
  constraint: LocalPatternConstraint,
  board: Map<string, 'B' | 'W'>,
  anchor: { row: number; col: number },
  boardSize: number,
  perspective: 'B' | 'W'
): boolean {
  if (constraint.type === 'anchor-empty') return !board.has(key(anchor.row, anchor.col)) === Boolean(constraint.value)
  if (constraint.type === 'edge-distance') {
    const edge = Math.min(anchor.row, anchor.col, boardSize - 1 - anchor.row, boardSize - 1 - anchor.col)
    return edge <= constraint.value
  }
  const wanted = constraint.type === 'min-friendly-liberties' ? perspective : opposite(perspective)
  let best = 0
  for (const [coordKey, color] of board.entries()) {
    if (color !== wanted) continue
    const [row, col] = coordKey.split(',').map(Number)
    if (Math.max(Math.abs(row - anchor.row), Math.abs(col - anchor.col)) <= 2) {
      best = Math.max(best, libertyCount(board, row, col, boardSize))
    }
  }
  return best >= constraint.value
}

function matchPatternAt(
  card: ShapePatternCard,
  board: Map<string, 'B' | 'W'>,
  anchorName: string,
  boardSize: number,
  perspective: 'B' | 'W'
): LocalPatternMatch | null {
  const anchor = gtpToCoord(anchorName, boardSize)
  if (!anchor || !regionMatches(card, anchor, boardSize)) return null

  let best: LocalPatternMatch | null = null
  for (const transform of TRANSFORMS) {
    let matched = 0
    let required = 0
    const evidence: string[] = []
    const counterEvidence: string[] = []

    for (const point of card.points) {
      const [dx, dy] = transform.apply(point.dx, point.dy)
      const row = anchor.row + dy
      const col = anchor.col + dx
      const requiredPoint = point.required !== false
      if (requiredPoint) required += 1
      if (row < 0 || col < 0 || row >= boardSize || col >= boardSize) {
        if (requiredPoint) counterEvidence.push(`required point off board dx=${point.dx},dy=${point.dy}`)
        continue
      }
      const actual = board.get(key(row, col))
      if (stateMatches(actual, point.state, perspective)) {
        matched += requiredPoint ? 1 : 0.5
        evidence.push(`${point.state}@${dx},${dy}`)
      } else if (requiredPoint) {
        counterEvidence.push(`expected ${point.state}@${dx},${dy}`)
      }
    }

    const antiHit = (card.antiPatterns ?? []).some((point) => {
      const [dx, dy] = transform.apply(point.dx, point.dy)
      const row = anchor.row + dy
      const col = anchor.col + dx
      if (row < 0 || col < 0 || row >= boardSize || col >= boardSize) return false
      return stateMatches(board.get(key(row, col)), point.state, perspective)
    })
    if (antiHit) counterEvidence.push('anti-pattern matched')

    const constraintsOk = (card.constraints ?? []).every((constraint) => constraintSatisfied(constraint, board, anchor, boardSize, perspective))
    if (!constraintsOk) counterEvidence.push('constraint failed')

    const ratio = required > 0 ? matched / required : 0
    const rawScore = Math.round(ratio * 20 + Math.min(8, matched) + (constraintsOk ? 4 : 0) - (antiHit ? 8 : 0))
    const minScore = card.minScore ?? 16
    if (rawScore < minScore || counterEvidence.length > Math.max(1, required - matched + 1)) continue
    const confidence: LocalPatternConfidence = rawScore >= 26 ? 'strong' : rawScore >= 20 ? 'medium' : 'weak'
    const candidate: LocalPatternMatch = {
      card,
      confidence,
      score: rawScore,
      anchor: anchorName,
      transform: transform.name,
      perspective,
      matchedPoints: matched,
      requiredPoints: required,
      evidence: [`anchor=${anchorName}`, `transform=${transform.name}`, `perspective=${perspective}`, ...evidence].slice(0, 10),
      counterEvidence: counterEvidence.slice(0, 6)
    }
    if (!best || candidate.score > best.score) best = candidate
  }
  return best
}

export function findLocalPatternMatches(cards: ShapePatternCard[], input: LocalPatternMatcherInput): LocalPatternMatch[] {
  const board = buildBoard(input.boardSnapshot, input.boardSize)
  const windowAnchors = (input.localWindows ?? []).map((window) => window.anchor)
  const anchors = Array.from(new Set([...input.anchors, ...windowAnchors].filter(Boolean) as string[]))
  const perspectives = Array.from(new Set([input.playerColor, 'B', 'W'].filter(Boolean) as Array<'B' | 'W'>))
  const matches: LocalPatternMatch[] = []

  for (const card of cards) {
    if (!phaseMatches(card, input.phase)) continue
    for (const anchor of anchors) {
      for (const perspective of perspectives) {
        const match = matchPatternAt(card, board, anchor, input.boardSize, perspective)
        if (match) matches.push(match)
      }
    }
  }

  return matches
    .sort((left, right) => right.score - left.score || left.card.title.localeCompare(right.card.title))
    .filter((match, index, all) => all.findIndex((item) => item.card.id === match.card.id && item.anchor === match.anchor) === index)
    .slice(0, 12)
}
