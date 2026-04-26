import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('KataGo candidate ranking uses before-position choices and current-player loss', () => {
  const katago = read('src/main/services/katago.ts')
  assert.match(katago, /function playerWinrate/)
  assert.match(katago, /function playerScoreLead/)
  assert.match(katago, /function playedMoveValue/)
  assert.match(katago, /playedLoss\(currentMove, best, actual\)/)
  assert.match(katago, /playerWinrate\(best\.winrate, currentMove\.color\) - playerWinrate\(actual\.winrate, currentMove\.color\)/)
  assert.match(katago, /playerScoreLead\(best\.scoreLead, currentMove\.color\) - playerScoreLead\(actual\.scoreLead, currentMove\.color\)/)
  assert.doesNotMatch(katago, /Math\.abs\(after\.winrate - before\.winrate\)/)
  assert.doesNotMatch(katago, /Math\.abs\(after\.scoreLead - before\.scoreLead\)/)
})

test('Board overlays display candidate values from the side-to-move perspective', () => {
  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /analysis\.before\.topMoves\.length > 0 \? analysis\.before\.topMoves : analysis\.after\.topMoves/)
  assert.match(app, /const currentAnalysis = useMemo/)
  assert.match(app, /analysis\?\.moveNumber === moveNumber/)
  assert.match(app, /<GoBoardV2 record=\{record\} moveNumber=\{moveNumber\} analysis=\{currentAnalysis\}/)
  assert.match(app, /<GoBoard record=\{record\} moveNumber=\{moveNumber\} analysis=\{currentAnalysis\}/)

  const geometry = read('src/renderer/src/features/board/boardGeometry.ts')
  assert.match(geometry, /function playerWinrateValue/)
  assert.match(geometry, /function playerScoreValue/)
  assert.match(geometry, /const displayColor = isBeforePosition \? currentColor : oppositeColor\(currentColor\)/)
  assert.match(geometry, /const winrateValue = playerWinrateValue\(getCandidateWinrate\(candidate\), displayColor\)/)
  assert.match(geometry, /const scoreValue = playerScoreValue\(getCandidateScore\(candidate\), displayColor\)/)

  const board = read('src/renderer/src/features/board/GoBoardV2.tsx')
  assert.match(board, /candidate\.winrateValue/)
  assert.match(board, /candidate\.scoreValue/)
})

test('Timeline and issue list treat KataGo winrate loss as percentage points', () => {
  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /function normalizeLossPercent/)
  assert.match(app, /return Math\.max\(0, Math\.abs\(value\)\)/)
  assert.doesNotMatch(app, /Math\.abs\(value\) <= 1 \? Math\.abs\(value\) \* 100/)

  const timeline = read('src/renderer/src/features/board/WinrateTimelineV2.tsx')
  assert.match(timeline, /playedMove'\), 'winrateLoss'/)
  assert.match(timeline, /return Math\.max\(0, Math\.abs\(raw\)\)/)
  assert.doesNotMatch(timeline, /Math\.abs\(raw\) <= 1 \? raw \* 100 : raw/)
})
