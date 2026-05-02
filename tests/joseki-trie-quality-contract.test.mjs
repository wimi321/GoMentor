import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('joseki trie module is order-aware and integrated with recognizer', () => {
  const trie = read('src/main/services/knowledge/josekiTrie.ts')
  const recognizer = read('src/main/services/knowledge/josekiRecognizer.ts')
  assert.match(trie, /recognizeJosekiTrie/)
  assert.match(trie, /exactOrderMatch/)
  assert.match(trie, /colorConsistent/)
  assert.match(trie, /tenukiCount/)
  assert.match(trie, /kataGoSupportsContinuation/)
  assert.match(trie, /safeWording/)
  assert.match(recognizer, /recognizeJosekiTrie/)
  assert.match(recognizer, /sequence-trie/)
})

test('v7 knowledge pack adds evidence and profile quality motifs', () => {
  const cards = read('data/knowledge/elite-pattern-cards-v7.json')
  assert.match(cards, /human_winrate_calibration/)
  assert.match(cards, /ownership_swing/)
  assert.match(cards, /joseki_sequence_order/)
  assert.match(cards, /profile_overfitting_guard/)
  assert.match(cards, /pv_branch_integrity/)
  const motif = read('src/main/services/knowledge/motifRecognizer.ts')
  assert.match(motif, /elite-pattern-cards-v7\.json/)
})
