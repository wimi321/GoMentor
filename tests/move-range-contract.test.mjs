import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('move range parser is shared and has false-positive guards', () => {
  const parser = read('src/shared/moveRange.ts')
  assert.match(parser, /parseMoveRangeFromPrompt/)
  assert.match(parser, /validateMoveRange/)
  assert.match(parser, /MOVE_RANGE_MAX_MOVES = 80/)
  assert.match(parser, /DATE_LIKE_PATTERN/)
  assert.match(parser, /SCORE_LIKE_PATTERN/)
  assert.match(parser, /WINRATE_LIKE_PATTERN/)
  assert.match(parser, /moves\?/)
  assert.match(parser, /手/)
  assert.match(parser, /수/)
})

test('move range review integrates with teacher and quality evidence path', () => {
  const teacher = read('src/main/services/teacherAgent.ts')
  assert.match(teacher, /move-range/)
  assert.match(teacher, /moveRangeSummary/)
  assert.match(teacher, /katago_analyzeMoveRangeKeyMoves/)
  assert.match(teacher, /区间复盘要先讲区间走势/)
  assert.match(teacher, /analysisQuality/)
  assert.doesNotMatch(teacher, /katago_analyzeMoveRange'/)
})

test('renderer supports Alt-drag range selection and bounded summary payload', () => {
  const app = read('src/renderer/src/App.tsx')
  const timeline = read('src/renderer/src/features/board/WinrateTimelineV2.tsx')
  assert.match(app, /handleTimelineRangeSelect/)
  assert.match(app, /buildMoveRangeSummary/)
  assert.match(app, /moveRangeSummary/)
  assert.match(app, /boardImageDataUrls/)
  assert.match(app, /MOVE_RANGE_MAX_MOVES/)
  assert.match(timeline, /onRangeSelect/)
  assert.match(timeline, /event\.altKey/)
  assert.match(timeline, /Escape/)
  assert.match(timeline, /ks-timeline-range-highlight/)
})

test('shared alias is configured without exposing main-only modules as renderer runtime imports', () => {
  const base = read('tsconfig.base.json')
  const vite = read('electron.vite.config.ts')
  const app = read('src/renderer/src/App.tsx')
  assert.match(base, /@shared\/\*/)
  assert.match(vite, /@shared/)
  assert.match(app, /@shared\/moveRange/)
  assert.doesNotMatch(app, /@main\/lib\/moveRange/)
})
