import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('Sprint 4 UI interaction files exist', () => {
  for (const relativePath of [
    'src/renderer/src/features/board/CandidateTooltip.tsx',
    'src/renderer/src/features/board/KeyMoveNavigator.tsx',
    'src/renderer/src/features/board/timelineInteraction.ts',
    'src/renderer/src/features/teacher/TeacherKeyMoveActions.tsx',
    'src/renderer/src/features/release/BetaAcceptancePanel.tsx'
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} should exist`)
  }
})

test('Sprint 4 scripts exist', () => {
  assert.equal(existsSync(join(root, 'scripts/p0_beta_acceptance.mjs')), true)
  assert.equal(existsSync(join(root, 'scripts/package_artifact_smoke.mjs')), true)
})

test('timelineInteraction exports move helpers', () => {
  const text = read('src/renderer/src/features/board/timelineInteraction.ts')
  assert.match(text, /moveFromPointer/)
  assert.match(text, /progressFromMove/)
  assert.match(text, /lossSeverityFromWinrateDrop/)
})
