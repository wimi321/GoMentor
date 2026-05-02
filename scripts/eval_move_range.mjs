#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'src/shared/moveRange.ts',
  'src/main/services/teacher/moveRangeReview.ts',
  'tests/move-range-contract.test.mjs',
  'docs/MOVE_RANGE_REVIEW.md'
]

const failures = []
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`missing ${file}`)
}

const parser = readFileSync(join(root, 'src/shared/moveRange.ts'), 'utf8')
for (const token of [
  'MOVE_RANGE_MAX_MOVES',
  'parseMoveRangeFromPrompt',
  'validateMoveRange',
  'DATE_LIKE_PATTERN',
  'SCORE_LIKE_PATTERN',
  'WINRATE_LIKE_PATTERN',
  '100手',
  'moves?',
  '수'
]) {
  if (!parser.includes(token)) failures.push(`parser missing ${token}`)
}

const teacher = readFileSync(join(root, 'src/main/services/teacherAgent.ts'), 'utf8')
for (const token of [
  'move-range',
  'moveRangeSummary',
  'katago_analyzeMoveRangeKeyMoves',
  'MOVE_RANGE_MAX_MOVES',
  'formatMoveRangeSummaryForPrompt'
]) {
  if (!teacher.includes(token)) failures.push(`teacherAgent missing ${token}`)
}

const app = readFileSync(join(root, 'src/renderer/src/App.tsx'), 'utf8')
for (const token of [
  'handleTimelineRangeSelect',
  'buildMoveRangeSummary',
  'boardImageDataUrls',
  'moveRangeSummary',
  'validateMoveRange'
]) {
  if (!app.includes(token)) failures.push(`App missing ${token}`)
}

const timeline = readFileSync(join(root, 'src/renderer/src/features/board/WinrateTimelineV2.tsx'), 'utf8')
for (const token of ['onRangeSelect', 'event.altKey', 'ks-timeline-range-highlight', 'Escape']) {
  if (!timeline.includes(token)) failures.push(`timeline missing ${token}`)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (!pkg.scripts?.['eval:move-range']) failures.push('package.json missing eval:move-range')
if (!String(pkg.scripts?.['check:teacher-quality'] ?? '').includes('eval:move-range')) failures.push('check:teacher-quality does not include eval:move-range')

if (failures.length) {
  console.error('Move-range review eval failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Move-range review eval passed.')
