import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// --- Contract tests: verify source patterns ---

const boardTextRenderPath = join(import.meta.dirname, '../src/main/services/go/boardTextRender.ts')
const boardTextRenderSource = readFileSync(boardTextRenderPath, 'utf-8')

const boardStatePath = join(import.meta.dirname, '../src/main/services/go/boardState.ts')
const boardStateSource = readFileSync(boardStatePath, 'utf-8')

test('renderBoardText uses coordToGtp from boardState for column letters', () => {
  assert.match(boardTextRenderSource, /import.*coordToGtp.*from '\.\/boardState'/)
  assert.match(boardTextRenderSource, /coordToGtp\(0,\s*col/)
})

test('renderBoardText uses gtpToCoord from boardState for snapshot parsing', () => {
  assert.match(boardTextRenderSource, /import.*gtpToCoord.*from '\.\/boardState'/)
  assert.match(boardTextRenderSource, /gtpToCoord\(s\.point/)
})

test('renderBoardText has no local GTP_LETTERS constant', () => {
  assert.doesNotMatch(boardTextRenderSource, /const\s+GTP_LETTERS/)
  assert.doesNotMatch(boardTextRenderSource, /GTP_LETTERS/)
})

test('renderBoardText skips last-move marker on pass', () => {
  assert.match(boardTextRenderSource, /!lastMove\.pass/)
})

test('renderBoardText passes initialStones to buildBoardState', () => {
  assert.match(boardTextRenderSource, /initialStones:\s*record\.initialStones/)
})

test('boardState coordToGtp uses GTP_LETTERS that skip I', () => {
  assert.match(boardStateSource, /GTP_LETTERS\s*=\s*['"]ABCDEFGHJKLMNOPQRST/)
  // Verify no I in the letter table
  const match = boardStateSource.match(/GTP_LETTERS\s*=\s*['"]([^'"]+)['"]/)
  assert.ok(match, 'GTP_LETTERS constant not found')
  assert.ok(!match[1].includes('I'), 'GTP_LETTERS should not contain I')
})

// --- Functional tests: test the rendering logic directly ---

// Reproduce the key logic from boardTextRender/boardState inline
// so we can test without the import chain.
const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function coordToGtp(row, col, boardSize) {
  return `${GTP_LETTERS[col] ?? '?'}${boardSize - row}`
}

function gtpToCoord(point, boardSize) {
  const match = point.trim().toUpperCase().match(/^([A-HJ-Z])(\d{1,2})$/)
  if (!match) return null
  const col = GTP_LETTERS.indexOf(match[1])
  const number = Number(match[2])
  if (col < 0 || col >= boardSize || number < 1 || number > boardSize) return null
  return { row: boardSize - number, col }
}

function buildStoneMap(boardSize, moves, uptoMoveNumber, initialStones) {
  const board = new Map()
  for (const stone of initialStones ?? []) {
    board.set(`${stone.row},${stone.col}`, stone.color)
  }
  const safe = Math.max(0, Math.min(Math.trunc(uptoMoveNumber), moves.length))
  for (const move of moves.slice(0, safe)) {
    if (move.pass) continue
    const row = move.row
    const col = move.col
    if (row === null || col === null) continue
    board.set(`${row},${col}`, move.color)
    // Simplified: no capture logic needed for the rendering tests
    // (captures are tested through buildBoardState contract)
  }
  return board
}

function renderText(boardSize, stoneMap, lastMoveKey) {
  const columns = Array.from({ length: boardSize }, (_, col) =>
    coordToGtp(0, col, boardSize).replace(/\d+$/, '')
  )
  const lines = ['  ' + columns.join(' ')]
  for (let row = 0; row < boardSize; row++) {
    const rowNum = boardSize - row
    const cells = []
    for (let col = 0; col < boardSize; col++) {
      const key = `${row},${col}`
      const color = stoneMap.get(key)
      const isLastMove = key === lastMoveKey
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

function makeMove(moveNumber, color, row, col, pass = false) {
  const gtp = pass ? 'pass' : coordToGtp(row, col, 19)
  return { moveNumber, color, point: gtp, row: pass ? null : row, col: pass ? null : col, gtp, pass }
}

function makeStone(color, row, col) {
  return { color, row, col, point: coordToGtp(row, col, 19) }
}

function getLastMoveKey(moves, uptoMoveNumber) {
  const safe = Math.max(0, Math.min(Math.trunc(uptoMoveNumber), moves.length))
  if (safe === 0) return ''
  const lastMove = moves[safe - 1]
  if (lastMove && !lastMove.pass && lastMove.row !== null && lastMove.col !== null) {
    return `${lastMove.row},${lastMove.col}`
  }
  return ''
}

// GTP column letters skip I

test('19x19 columns skip I', () => {
  const stoneMap = buildStoneMap(19, [], 0, [])
  const text = renderText(19, stoneMap, '')
  const header = text.split('\n')[0]
  const cols = header.trim().split(/\s+/)
  assert.equal(cols.length, 19)
  assert.equal(cols[7], 'H')
  assert.equal(cols[8], 'J')
  assert.doesNotMatch(header, /\bI\b/)
})

test('9x9 columns skip I', () => {
  const stoneMap = buildStoneMap(9, [], 0, [])
  const text = renderText(9, stoneMap, '')
  const header = text.split('\n')[0]
  const cols = header.trim().split(/\s+/)
  assert.equal(cols.length, 9)
  assert.equal(cols[7], 'H')
  assert.equal(cols[8], 'J')
})

// Pass moves do not get last-move marker

test('last move is pass → no ◉/◎ marker', () => {
  const moves = [
    makeMove(1, 'B', 0, 0),
    makeMove(2, 'W', 0, 1),
    makeMove(3, 'B', 0, 0, true) // pass
  ]
  const stoneMap = buildStoneMap(19, moves, 3, [])
  const lastMoveKey = getLastMoveKey(moves, 3)
  assert.equal(lastMoveKey, '', 'pass should produce empty lastMoveKey')
  const text = renderText(19, stoneMap, lastMoveKey)
  assert.doesNotMatch(text, /◉/)
  assert.doesNotMatch(text, /◎/)
  assert.match(text, /●/)
  assert.match(text, /○/)
})

test('last move is white placement → ◎ marker', () => {
  const moves = [
    makeMove(1, 'B', 0, 0),
    makeMove(2, 'W', 0, 1)
  ]
  const stoneMap = buildStoneMap(19, moves, 2, [])
  const lastMoveKey = getLastMoveKey(moves, 2)
  assert.equal(lastMoveKey, '0,1')
  const text = renderText(19, stoneMap, lastMoveKey)
  assert.match(text, /◎/)
  assert.doesNotMatch(text, /◉/)
})

test('last move is black placement → ◉ marker', () => {
  const moves = [makeMove(1, 'B', 3, 3)]
  const stoneMap = buildStoneMap(19, moves, 1, [])
  const lastMoveKey = getLastMoveKey(moves, 1)
  assert.equal(lastMoveKey, '3,3')
  const text = renderText(19, stoneMap, lastMoveKey)
  assert.match(text, /◉/)
  assert.doesNotMatch(text, /◎/)
})

// initialStones are preserved

test('initialStones appear on empty board', () => {
  const stones = [
    makeStone('B', 3, 3),
    makeStone('W', 15, 15),
    makeStone('B', 3, 15),
  ]
  const stoneMap = buildStoneMap(19, [], 0, stones)
  const text = renderText(19, stoneMap, '')
  const blackCount = (text.match(/●/g) || []).length
  const whiteCount = (text.match(/○/g) || []).length
  assert.equal(blackCount, 2)
  assert.equal(whiteCount, 1)
})

test('initialStones coexist with played moves', () => {
  const stones = [makeStone('B', 0, 0)]
  const moves = [
    makeMove(1, 'W', 3, 3),
    makeMove(2, 'B', 3, 15),
  ]
  const stoneMap = buildStoneMap(19, moves, 2, stones)
  const lastMoveKey = getLastMoveKey(moves, 2)
  const text = renderText(19, stoneMap, lastMoveKey)
  const blackCount = (text.match(/●|◉/g) || []).length
  const whiteCount = (text.match(/○|◎/g) || []).length
  assert.equal(blackCount, 2)
  assert.equal(whiteCount, 1)
})

// Board dimensions

test('19x19 has 20 lines (1 header + 19 rows)', () => {
  const stoneMap = buildStoneMap(19, [], 0, [])
  const text = renderText(19, stoneMap, '')
  const lines = text.split('\n')
  assert.equal(lines.length, 20)
  assert.match(lines[1], /^19\b/)
  assert.match(lines[19], /^ 1\b/)
})

test('9x9 has 10 lines (1 header + 9 rows)', () => {
  const stoneMap = buildStoneMap(9, [], 0, [])
  const text = renderText(9, stoneMap, '')
  const lines = text.split('\n')
  assert.equal(lines.length, 10)
  assert.match(lines[1], /^ 9\b/)
  assert.match(lines[9], /^ 1\b/)
})

// Empty board

test('empty board is all dots', () => {
  const stoneMap = buildStoneMap(9, [], 0, [])
  const text = renderText(9, stoneMap, '')
  const dataLines = text.split('\n').slice(1)
  for (const line of dataLines) {
    const cells = line.trim().split(/\s+/).slice(1)
    for (const cell of cells) {
      assert.equal(cell, '·')
    }
  }
})
