import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

test('structured teaching output module defines strict schema and local validation', () => {
  const source = read('src/main/services/teacher/structuredTeachingResult.ts')
  assert.match(source, /GROUNDED_TEACHING_JSON_SCHEMA/)
  assert.match(source, /strict:\s*true/)
  assert.match(source, /GroundedTeachingOutput/)
  assert.match(source, /validateGroundedTeachingResult/)
  assert.match(source, /extractGroundedTeachingResult/)
  assert.match(source, /evidenceRefs/)
  assert.match(source, /GOMENTOR_GROUNDING_JSON/)
})

test('teacher quality gate combines markdown verification, grounded claims, and structured output validation', () => {
  const source = read('src/main/services/teacher/qualityGate.ts')
  assert.match(source, /runTeacherQualityGate/)
  assert.match(source, /verifyTeacherMarkdown/)
  assert.match(source, /verifyGroundedClaims/)
  assert.match(source, /verifyTeacherClaimsFromMarkdown/)
  assert.match(source, /appendTeacherQualityGateNote/)
})

test('v8 knowledge pack is wired into motif recognizer and source registry', () => {
  const motif = read('src/main/services/knowledge/motifRecognizer.ts')
  const cards = json('data/knowledge/elite-pattern-cards-v8.json')
  const registryIds = new Set(json('data/knowledge/source-registry.json').map((source) => source.id))
  assert.match(motif, /elite-pattern-cards-v8\.json/)
  assert.ok(cards.length >= 6)
  for (const card of cards) {
    assert.ok(card.id && card.title && card.recognition && card.correctThinking && card.drillPrompt)
    assert.ok(Array.isArray(card.sourceRefs) && card.sourceRefs.length > 0)
    for (const sourceRef of card.sourceRefs) assert.ok(registryIds.has(sourceRef), sourceRef)
  }
  assert.ok(cards.some((card) => card.patternType === 'claim_grounding'))
  assert.ok(cards.some((card) => card.patternType === 'sgf_setup_consistency'))
  assert.ok(cards.some((card) => card.patternType === 'pv_integrity'))
})

test('teacher quality gate eval script is part of the release-quality command', () => {
  const pkg = json('package.json')
  assert.equal(pkg.scripts['eval:quality-gate'], 'node scripts/eval_teacher_quality_gate.mjs')
  assert.match(pkg.scripts['check:teacher-quality'], /eval:teacher/)
  assert.match(pkg.scripts['check:teacher-quality'], /eval:claims/)
  assert.match(pkg.scripts['check:teacher-quality'], /eval:quality-gate/)
  const evalSource = read('scripts/eval_teacher_quality_gate.mjs')
  assert.match(evalSource, /assertKnowledgeCoverage/)
  assert.match(evalSource, /assertFixtureClaims/)
  assert.match(evalSource, /assertWiring/)
})

test('quality golden fixture includes structured claim requirements', () => {
  const fixture = json('tests/fixtures/teaching-golden/quality/structured-claim-gate-001.json')
  assert.equal(fixture.id, 'quality-structured-claim-gate-001')
  assert.ok(Array.isArray(fixture.expected.claims) && fixture.expected.claims.length >= 2)
  for (const claim of fixture.expected.claims) {
    assert.ok(claim.type)
    assert.ok(claim.text)
    assert.ok(Array.isArray(claim.evidenceRefs) && claim.evidenceRefs.length > 0)
  }
})
