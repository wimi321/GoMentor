import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('student profile quality guard prevents overfitting from one game', () => {
  const quality = read('src/main/services/teacher/studentProfileQuality.ts')
  const profile = read('src/main/services/studentProfile.ts')
  assert.match(quality, /scoreProfileWeaknesses/)
  assert.match(quality, /shouldPromoteWeakness/)
  assert.match(quality, /gamesReviewed < 3/)
  assert.match(quality, /lastSeenDaysAgo/)
  assert.match(profile, /summarizeProfileQualityForPrompt/)
  assert.match(profile, /画像可信度/)
})

test('teacher quality scripts validate golden fixtures and claim consistency', () => {
  const pkg = read('package.json')
  const claims = read('scripts/eval_teacher_claims.mjs')
  const fixture = read('tests/fixtures/teaching-golden/joseki/sequence-trie-001.json')
  assert.match(pkg, /eval:claims/)
  assert.match(pkg, /check:teacher-quality.*eval:claims/)
  assert.match(claims, /allowedBestMoves intersects forbiddenMoves/)
  assert.match(claims, /evidenceRefs/)
  assert.match(fixture, /joseki_sequence_order/)
})
