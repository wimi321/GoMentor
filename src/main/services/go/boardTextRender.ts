import type { GameMove, StoneColor } from '../../lib/types'
import { buildBoardState, boardStateToSnapshot, coordToGtp, gtpToCoord } from './boardState'

interface BoardTextRecord {
  boardSize: number
  moves: GameMove[]
  initialStones?: Array<{ color: StoneColor; row: number; col: number; point: string }>
}

export function renderBoardText(
  record: BoardTextRecord,
  uptoMoveNumber: number
): string {
  const boardSize = record.boardSize
  const safeMoveNumber = Math.max(0, Math.min(Math.trunc(uptoMoveNumber), record.moves.length))
  const boardState = buildBoardState({
    boardSize,
    moves: record.moves,
    uptoMoveNumber: safeMoveNumber,
    initialStones: record.initialStones
  })
  const snapshot = boardStateToSnapshot(boardState)
  const stoneMap = new Map<string, StoneColor>()
  for (const s of snapshot) {
    const coord = gtpToCoord(s.point, boardSize)
    if (coord) stoneMap.set(`${coord.row},${coord.col}`, s.color)
  }
  const lastMove = safeMoveNumber > 0 ? record.moves[safeMoveNumber - 1] : undefined
  let lastMoveKey = ''
  if (lastMove && !lastMove.pass && lastMove.row !== null && lastMove.col !== null) {
    lastMoveKey = `${lastMove.row},${lastMove.col}`
  }
  const columns = Array.from({ length: boardSize }, (_, col) =>
    coordToGtp(0, col, boardSize).replace(/\d+$/, '')
  )
  const lines: string[] = []
  lines.push('  ' + columns.join(' '))
  for (let row = 0; row < boardSize; row++) {
    const rowNum = boardSize - row
    const cells: string[] = []
    for (let col = 0; col < boardSize; col++) {
      const key = `${row},${col}`
      const color = stoneMap.get(key)
      const isLastMove = `${row},${col}` === lastMoveKey
      if (isLastMove) {
        cells.push(color === 'B' ? '◉' : '◎')
      } else if (color === 'B') {
        cells.push('●')
      } else if (color === 'W') {
        cells.push('○')
      } else {
        cells.push('·')
      }
    }
    lines.push(`${String(rowNum).padStart(2)} ${cells.join(' ')}`)
  }
  return lines.join('\n')
}
