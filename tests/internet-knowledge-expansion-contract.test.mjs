import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

test('internet-informed source registry entries are explicit and non-copying', () => {
  const registry = json('data/knowledge/source-registry-v9.json')
  const ids = new Set(registry.map((source) => source.id))
  for (const id of ['sgf-ff4-red-bean', 'sgfmill-ff4-properties', 'sensei-go-terms', 'josekipedia-game-collection', 'josekipedia-copyright-policy']) {
    assert.ok(ids.has(id), id)
  }
  for (const source of registry) {
    assert.ok(source.license)
    assert.ok(source.status)
    assert.ok(source.why)
    assert.ok(Array.isArray(source.usedFor))
    assert.doesNotMatch(source.status, /do-not-import/)
  }
})

test('v9 and v10 knowledge packs expand source policy and deep Go concepts', () => {
  const v9 = json('data/knowledge/elite-pattern-cards-v9.json')
  const v10 = json('data/knowledge/elite-pattern-cards-v10.json')
  assert.ok(v9.length >= 10)
  assert.ok(v10.length >= 18)
  assert.ok(v9.some((card) => card.patternType === 'sgf_setup_properties'))
  assert.ok(v9.some((card) => card.patternType === 'joseki_frequency_policy'))
  assert.ok(v9.some((card) => card.patternType === 'do_not_import_boundary'))
  assert.ok(v10.some((card) => card.patternType === 'aji_management'))
  assert.ok(v10.some((card) => card.patternType === 'sabaki'))
  assert.ok(v10.some((card) => card.patternType === 'semeai_liberty_order'))
  assert.ok(v10.some((card) => card.patternType === 'reverse_sente_yose'))
  for (const card of [...v9, ...v10]) {
    assert.ok(Array.isArray(card.sourceRefs) && card.sourceRefs.length > 0, card.id)
    assert.ok(card.sourceQuality, card.id)
    assert.ok(card.recognition, card.id)
    assert.ok(card.correctThinking, card.id)
  }
})

test('motif recognizer and quality scripts include v9/v10 expansion packs', () => {
  const motif = read('src/main/services/knowledge/motifRecognizer.ts')
  const pkg = json('package.json')
  assert.match(motif, /elite-pattern-cards-v9\.json/)
  assert.match(motif, /elite-pattern-cards-v10\.json/)
  assert.equal(pkg.scripts['check:knowledge-sources'], 'node scripts/check_knowledge_sources.mjs')
  assert.equal(pkg.scripts['eval:knowledge-coverage'], 'node scripts/eval_knowledge_coverage.mjs')
  assert.match(pkg.scripts['check:teacher-quality'], /check:knowledge-sources/)
  assert.match(pkg.scripts['check:teacher-quality'], /eval:knowledge-coverage/)
})

test('knowledge source policy and coverage scripts enforce release gates', () => {
  const sourceCheck = read('scripts/check_knowledge_sources.mjs')
  const coverageEval = read('scripts/eval_knowledge_coverage.mjs')
  const fixture = json('tests/fixtures/knowledge-coverage/required-topics.json')
  assert.match(sourceCheck, /do-not-import/)
  assert.match(sourceCheck, /source-registry-v9\.json/)
  assert.match(coverageEval, /requiredTopics/)
  assert.ok(fixture.requiredTopics.length >= 12)
  assert.ok(fixture.requiredSourceRefs.includes('sensei-go-terms'))
  assert.ok(fixture.requiredSourceRefs.includes('josekipedia-game-collection'))
})
