#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const fixtureRoot = join(root, 'tests', 'fixtures', 'teaching-golden')

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

function readJson(path) {
  return JSON.parse(readText(path))
}

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.json') ? [full] : []
  })
}

function relative(path) {
  return path.slice(root.length + 1)
}

function assertKnowledgeCoverage() {
  const sourceRegistry = readJson('data/knowledge/source-registry.json')
  const sourceIds = new Set(sourceRegistry.map((source) => source.id))
  for (const pack of ['elite-pattern-cards-v6.json', 'elite-pattern-cards-v7.json', 'elite-pattern-cards-v8.json']) {
    const cards = readJson(`data/knowledge/${pack}`)
    assert.ok(cards.length >= (pack.endsWith('v8.json') ? 6 : 5), `${pack} should contain production-quality cards`)
    const ids = new Set(cards.map((card) => card.id))
    assert.equal(ids.size, cards.length, `${pack} has duplicate ids`)
    for (const card of cards) {
      assert.ok(card.title && card.recognition && card.correctThinking && card.drillPrompt, `${pack}:${card.id} missing teaching fields`)
      assert.ok(Array.isArray(card.sourceRefs) && card.sourceRefs.length > 0, `${pack}:${card.id} missing sourceRefs`)
      for (const sourceRef of card.sourceRefs) {
        assert.ok(sourceIds.has(sourceRef), `${pack}:${card.id} references unknown source ${sourceRef}`)
      }
    }
  }
}

function assertFixtureClaims() {
  const fixtures = walk(fixtureRoot)
  assert.ok(fixtures.length >= 4, 'expected at least four golden teaching fixtures')
  const seen = new Set()
  for (const file of fixtures) {
    const fixture = JSON.parse(readFileSync(file, 'utf8'))
    assert.ok(fixture.id, `${relative(file)} missing id`)
    assert.ok(!seen.has(fixture.id), `duplicate fixture id ${fixture.id}`)
    seen.add(fixture.id)
    assert.ok(fixture.expected, `${fixture.id} missing expected block`)
    assert.ok(Array.isArray(fixture.expected.mustMention), `${fixture.id} missing mustMention`)
    assert.ok(Array.isArray(fixture.expected.mustNotMention), `${fixture.id} missing mustNotMention`)
    assert.ok(Array.isArray(fixture.expected.claims), `${fixture.id} missing expected claims`)
    for (const claim of fixture.expected.claims) {
      assert.ok(claim.type && claim.text, `${fixture.id} has incomplete expected claim`)
      assert.ok(Array.isArray(claim.evidenceRefs) && claim.evidenceRefs.length > 0, `${fixture.id} expected claim missing evidenceRefs`)
    }
    const mustMention = new Set(fixture.expected.mustMention)
    for (const forbidden of fixture.expected.mustNotMention) {
      assert.ok(!mustMention.has(forbidden), `${fixture.id} has term in both mustMention and mustNotMention: ${forbidden}`)
    }
  }
}

function assertWiring() {
  const structured = readText('src/main/services/teacher/structuredTeachingResult.ts')
  const qualityGate = readText('src/main/services/teacher/qualityGate.ts')
  const claimVerifier = readText('src/main/services/teacher/claimVerifier.ts')
  const motif = readText('src/main/services/knowledge/motifRecognizer.ts')
  const pkg = readJson('package.json')

  assert.match(structured, /GROUNDED_TEACHING_JSON_SCHEMA/)
  assert.match(structured, /strict:\s*true/)
  assert.match(structured, /evidenceRefs/)
  assert.match(qualityGate, /runTeacherQualityGate/)
  assert.match(qualityGate, /verifyGroundedClaims|verifyTeacherClaimsFromMarkdown/)
  assert.match(claimVerifier, /verifyGroundedClaims/)
  assert.match(motif, /elite-pattern-cards-v8\.json/)
  assert.equal(pkg.scripts['eval:quality-gate'], 'node scripts/eval_teacher_quality_gate.mjs')
  assert.match(pkg.scripts['check:teacher-quality'], /eval:quality-gate/)
}

assertKnowledgeCoverage()
assertFixtureClaims()
assertWiring()
console.log('teacher quality gate eval passed')
