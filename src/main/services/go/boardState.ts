import type { BoardSetupStone, GameMove, StoneColor } from '@main/lib/types'

const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

export interface BoardGroup {
  id: string
  color: StoneColor
  stones: string[]
  liberties: string[]
  adjacentEnemyGroups: string[]
}

export interface BoardState {
  boardSize: number
  stones: BoardSetupStone[]
  groups: BoardGroup[]
  lastMove?: string
  initialStones: BoardSetupStone[]
  warnings: string[]
}

type BoardMap = Map<string, StoneColor>

function pointKey(row: number, col: number): string {
  return `${row},${col}`
}

function parseKey(key: string): { row: number; col: number } {
  const [row, col] = key.split(',').map(Number)
  return { row, col }
}

export function coordToGtp(row: number, col: number, boardSize: number): string {
  return `${GTP_LETTERS[col] ?? '?'}${boardSize - row}`
}

export function gtpToCoord(point: string, boardSize: number): { row: number; col: number } | null {
  const match = point.trim().toUpperCase().match(/^([A-HJ-Z])(\d{1,2})$/)
  if (!match) return null
  const col = GTP_LETTERS.indexOf(match[1])
  const number = Number(match[2])
  if (col < 0 || col >= boardSize || number < 1 || number > boardSize) return null
  return { row: boardSize - number, col }
}

function sgfPointToSetupStone(color: StoneColor, raw: string, boardSize: number): BoardSetupStone | null {
  const point = raw.trim().toLowerCase()
  if (!point || point.length < 2) return null
  const col = point.charCodeAt(0) - 97
  const row = point.charCodeAt(1) - 97
  if (row < 0 || col < 0 || row >= boardSize || col >= boardSize) return null
  return { color, row, col, point: coordToGtp(row, col, boardSize) }
}

function readPropertyValues(content: string, property: string): string[] {
  const values: string[] = []
  let index = 0
  const upper = property.toUpperCase()
  while (index < content.length) {
    const propIndex = content.indexOf(upper, index)
    if (propIndex < 0) break
    const before = content[propIndex - 1]
    const after = content[propIndex + upper.length]
    if ((before && /[A-Za-z]/.test(before)) || after !== '[') {
      index = propIndex + upper.length
      continue
    }
    let cursor = propIndex + upper.length
    while (content[cursor] === '[') {
      cursor += 1
      let value = ''
      let escaped = false
      while (cursor < content.length) {
        const ch = content[cursor]
        cursor += 1
        if (escaped) {
          value += ch
          escaped = false
          continue
        }
        if (ch === '\\') {
          escaped = true
          continue
        }
        if (ch === ']') break
        value += ch
      }
      values.push(value)
      while (/\s/.test(content[cursor] ?? '')) cursor += 1
    }
    index = cursor
  }
  return values
}

function rootNodeContent(content: string): string {
  const firstNode = content.indexOf(';')
  if (firstNode < 0) return content
  let index = firstNode + 1
  let inValue = false
  let escaped = false
  while (index < content.length) {
    const ch = content[index]
    if (inValue) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === ']') inValue = false
      index += 1
      continue
    }
    if (ch === '[') inValue = true
    else if (ch === ';' || ch === '(' || ch === ')') break
    index += 1
  }
  return content.slice(firstNode + 1, index)
}

export function extractInitialStonesFromSgf(content: string, boardSize: number): BoardSetupStone[] {
  const setupNode = rootNodeContent(content)
  const byPoint = new Map<string, BoardSetupStone>()
  for (const value of readPropertyValues(setupNode, 'AB')) {
    const stone = sgfPointToSetupStone('B', value, boardSize)
    if (stone) byPoint.set(stone.point, stone)
  }
  for (const value of readPropertyValues(setupNode, 'AW')) {
    const stone = sgfPointToSetupStone('W', value, boardSize)
    if (stone) byPoint.set(stone.point, stone)
  }
  for (const value of readPropertyValues(setupNode, 'AE')) {
    const stone = sgfPointToSetupStone('B', value, boardSize)
    if (stone) byPoint.delete(stone.point)
  }
  return Array.from(byPoint.values()).sort((a, b) => a.row - b.row || a.col - b.col)
}

function neighbors(row: number, col: number, boardSize: number): Array<{ row: number; col: number }> {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 }
  ].filter((point) => point.row >= 0 && point.col >= 0 && point.row < boardSize && point.col < boardSize)
}

function collectGroup(board: BoardMap, row: number, col: number, boardSize: number): string[] {
  const color = board.get(pointKey(row, col))
  if (!color) return []
  const seen = new Set<string>()
  const stack = [pointKey(row, col)]
  while (stack.length > 0) {
    const key = stack.pop()!
    if (seen.has(key)) continue
    const point = parseKey(key)
    if (board.get(key) !== color) continue
    seen.add(key)
    for (const next of neighbors(point.row, point.col, boardSize)) {
      const nextKey = pointKey(next.row, next.col)
      if (board.get(nextKey) === color) stack.push(nextKey)
    }
  }
  return Array.from(seen)
}

function libertiesForGroup(board: BoardMap, group: string[], boardSize: number): string[] {
  const liberties = new Set<string>()
  for (const key of group) {
    const point = parseKey(key)
    for (const next of neighbors(point.row, point.col, boardSize)) {
      const nextKey = pointKey(next.row, next.col)
      if (!board.has(nextKey)) liberties.add(coordToGtp(next.row, next.col, boardSize))
    }
  }
  return Array.from(liberties).sort()
}

function removeGroup(board: BoardMap, group: string[]): void {
  for (const key of group) board.delete(key)
}

function playMove(board: BoardMap, move: GameMove, boardSize: number, warnings: string[]): void {
  if (move.pass) return
  const coord = move.row !== null && move.col !== null ? { row: move.row, col: move.col } : gtpToCoord(move.gtp, boardSize)
  if (!coord) {
    warnings.push(`invalid move coordinate ${move.gtp || move.point}`)
    return
  }
  const key = pointKey(coord.row, coord.col)
  if (board.has(key)) warnings.push(`overwriting occupied point ${coordToGtp(coord.row, coord.col, boardSize)} while reconstructing board`)
  board.set(key, move.color)
  const opponent = move.color === 'B' ? 'W' : 'B'
  for (const next of neighbors(coord.row, coord.col, boardSize)) {
    const nextKey = pointKey(next.row, next.col)
    if (board.get(nextKey) !== opponent) continue
    const group = collectGroup(board, next.row, next.col, boardSize)
    if (libertiesForGroup(board, group, boardSize).length === 0) removeGroup(board, group)
  }
  const ownGroup = collectGroup(board, coord.row, coord.col, boardSize)
  if (libertiesForGroup(board, ownGroup, boardSize).length === 0) {
    warnings.push(`suicide-like move detected at ${coordToGtp(coord.row, coord.col, boardSize)} under simple reconstruction`)
    removeGroup(board, ownGroup)
  }
}

function groupsFromBoard(board: BoardMap, boardSize: number): BoardGroup[] {
  const seen = new Set<string>()
  const groups: BoardGroup[] = []
  for (const [key, color] of board.entries()) {
    if (seen.has(key)) continue
    const { row, col } = parseKey(key)
    const groupKeys = collectGroup(board, row, col, boardSize)
    for (const item of groupKeys) seen.add(item)
    const enemyGroups = new Set<string>()
    for (const item of groupKeys) {
      const point = parseKey(item)
      for (const next of neighbors(point.row, point.col, boardSize)) {
        const nextKey = pointKey(next.row, next.col)
        const nextColor = board.get(nextKey)
        if (nextColor && nextColor !== color) {
          const enemy = collectGroup(board, next.row, next.col, boardSize)
          enemyGroups.add(enemy.sort().join('|'))
        }
      }
    }
    groups.push({
      id: groupKeys.sort().join('|'),
      color,
      stones: groupKeys.map((item) => {
        const point = parseKey(item)
        return coordToGtp(point.row, point.col, boardSize)
      }).sort(),
      liberties: libertiesForGroup(board, groupKeys, boardSize),
      adjacentEnemyGroups: Array.from(enemyGroups).sort()
    })
  }
  return groups.sort((a, b) => a.stones[0].localeCompare(b.stones[0]))
}

export function buildBoardState(input: {
  boardSize: number
  moves: GameMove[]
  uptoMoveNumber?: number
  initialStones?: BoardSetupStone[]
}): BoardState {
  const warnings: string[] = []
  const board: BoardMap = new Map()
  for (const stone of input.initialStones ?? []) {
    board.set(pointKey(stone.row, stone.col), stone.color)
  }
  const upto = input.uptoMoveNumber ?? input.moves.length
  const moves = input.moves.slice(0, Math.max(0, upto))
  for (const move of moves) playMove(board, move, input.boardSize, warnings)
  const stones = Array.from(board.entries()).map(([key, color]) => {
    const { row, col } = parseKey(key)
    return { color, row, col, point: coordToGtp(row, col, input.boardSize) }
  }).sort((a, b) => a.row - b.row || a.col - b.col)
  const lastMove = [...moves].reverse().find((move) => !move.pass)?.gtp
  return {
    boardSize: input.boardSize,
    stones,
    groups: groupsFromBoard(board, input.boardSize),
    lastMove,
    initialStones: input.initialStones ?? [],
    warnings
  }
}

export function boardStateToSnapshot(state: BoardState): Array<{ color: StoneColor; point: string }> {
  return state.stones.map((stone) => ({ color: stone.color, point: stone.point }))
}
