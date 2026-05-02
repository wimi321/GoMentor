import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { after, before, test } from 'node:test'
import ts from 'typescript'

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
  const match = boardStateSource.match(/GTP_LETTERS\s*=\s*['"]([^'"]+)['"]/)
  assert.ok(match, 'GTP_LETTERS constant not found')
  assert.ok(!match[1].includes('I'), 'GTP_LETTERS should not contain I')
})

// --- Compile + import real renderBoardText ---

async function importBoardTextRenderForTest() {
  const root = await mkdtemp(join(tmpdir(), 'gomentor-board-text-test-'))
  const goDir = join(root, 'go')
  await mkdir(goDir, { recursive: true })

  const compilerOptions = {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: false
  }

  const boardStateSrc = await readFile(new URL('../src/main/services/go/boardState.ts', import.meta.url), 'utf8')
  const boardTextRenderSrc = (await readFile(new URL('../src/main/services/go/boardTextRender.ts', import.meta.url), 'utf8'))
    .replace(/from ['"]\.\/boardState['"]/, "from './boardState.js'")

  await writeFile(join(goDir, 'boardState.js'), ts.transpileModule(boardStateSrc, { compilerOptions }).outputText, 'utf8')
  await writeFile(join(goDir, 'boardTextRender.js'), ts.transpileModule(boardTextRenderSrc, { compilerOptions }).outputText, 'utf8')

  const moduleUrl = pathToFileURL(join(goDir, 'boardTextRender.js')).href
  const mod = await import(`${moduleUrl}?t=${Date.now()}`)
  return {
    renderBoardText: mod.renderBoardText,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}

// Shared test data helpers

const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function makeMove(moveNumber, color, row, col, pass = false) {
  const gtp = pass ? 'pass' : `${GTP_LETTERS[col]}${19 - row}`
  return { moveNumber, color, point: gtp, row: pass ? null : row, col: pass ? null : col, gtp, pass }
}

function makeStone(color, row, col) {
  const gtp = `${GTP_LETTERS[col]}${19 - row}`
  return { color, row, col, point: gtp }
}

// --- Functional tests: test the real compiled renderBoardText ---

let renderBoardText
let cleanup

before(async () => {
  const result = await importBoardTextRenderForTest()
  renderBoardText = result.renderBoardText
  cleanup = result.cleanup
  assert.ok(typeof renderBoardText === 'function', 'renderBoardText should be a function')
})

after(async () => {
  if (cleanup) await cleanup()
})

// GTP column letters skip I

test('19x19 columns skip I', () => {
  const text = renderBoardText({ boardSize: 19, moves: [] }, 0)
  const header = text.split('\n')[0]
  const cols = header.trim().split(/\s+/)
  assert.equal(cols.length, 19)
  assert.equal(cols[7], 'H')
  assert.equal(cols[8], 'J')
  assert.doesNotMatch(header, /\bI\b/)
})

test('9x9 columns skip I', () => {
  const text = renderBoardText({ boardSize: 9, moves: [] }, 0)
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
  const text = renderBoardText({ boardSize: 19, moves }, 3)
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
  const text = renderBoardText({ boardSize: 19, moves }, 2)
  assert.match(text, /◎/)
  assert.doesNotMatch(text, /◉/)
})

test('last move is black placement → ◉ marker', () => {
  const moves = [makeMove(1, 'B', 3, 3)]
  const text = renderBoardText({ boardSize: 19, moves }, 1)
  assert.match(text, /◉/)
  assert.doesNotMatch(text, /◎/)
})

// initialStones

test('initialStones appear on empty board', () => {
  const stones = [
    makeStone('B', 3, 3),
    makeStone('W', 15, 15),
    makeStone('B', 3, 15),
  ]
  const text = renderBoardText({ boardSize: 19, moves: [], initialStones: stones }, 0)
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
  const text = renderBoardText({ boardSize: 19, moves, initialStones: stones }, 2)
  const blackCount = (text.match(/●|◉/g) || []).length
  const whiteCount = (text.match(/○|◎/g) || []).length
  assert.equal(blackCount, 2)
  assert.equal(whiteCount, 1)
})

test('initialStones removed by capture from played moves', () => {
  // Black initial stone at A19 (row=0, col=0)
  // White plays B19, A18, B18 to surround and capture A19
  const stones = [makeStone('B', 0, 0)]
  const moves = [
    makeMove(1, 'W', 0, 1),  // B19
    makeMove(2, 'B', 18, 18), // A1 (unrelated)
    makeMove(3, 'W', 1, 0),  // A18
    makeMove(4, 'B', 17, 17), // B2 (unrelated)
    makeMove(5, 'W', 1, 1),  // B18 — completes capture of A19
  ]
  const text = renderBoardText({ boardSize: 19, moves, initialStones: stones }, 5)
  // A19 is row 19 (first data line) — the black stone should be gone
  const row19 = text.split('\n')[1]
  assert.doesNotMatch(row19, /●/, 'A19 black stone should be captured')
  assert.doesNotMatch(row19, /◉/, 'A19 should not have last-move marker')
  // White stones at B19, A18, B18 should exist
  const whiteCount = (text.match(/○|◎/g) || []).length
  assert.ok(whiteCount >= 3, `expected at least 3 white stones, got ${whiteCount}`)
})

// Board dimensions

test('19x19 has 20 lines (1 header + 19 rows)', () => {
  const text = renderBoardText({ boardSize: 19, moves: [] }, 0)
  const lines = text.split('\n')
  assert.equal(lines.length, 20)
  assert.match(lines[1], /^19\b/)
  assert.match(lines[19], /^ 1\b/)
})

test('9x9 has 10 lines (1 header + 9 rows)', () => {
  const text = renderBoardText({ boardSize: 9, moves: [] }, 0)
  const lines = text.split('\n')
  assert.equal(lines.length, 10)
  assert.match(lines[1], /^ 9\b/)
  assert.match(lines[9], /^ 1\b/)
})

// Empty board

test('empty board is all dots', () => {
  const text = renderBoardText({ boardSize: 9, moves: [] }, 0)
  const dataLines = text.split('\n').slice(1)
  for (const line of dataLines) {
    const cells = line.trim().split(/\s+/).slice(1)
    for (const cell of cells) {
      assert.equal(cell, '·')
    }
  }
})

// Boundary: uptoMoveNumber clamping

test('uptoMoveNumber=0 shows empty board', () => {
  const moves = [makeMove(1, 'B', 3, 3)]
  const text = renderBoardText({ boardSize: 19, moves }, 0)
  assert.doesNotMatch(text, /●/)
  assert.doesNotMatch(text, /◉/)
})

test('uptoMoveNumber exceeds moves.length → shows all moves', () => {
  const moves = [makeMove(1, 'B', 3, 3)]
  const text = renderBoardText({ boardSize: 19, moves }, 999)
  assert.match(text, /◉/)
})

