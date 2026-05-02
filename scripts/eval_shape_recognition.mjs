import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function json(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function walkJsonFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walkJsonFiles(path)
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : []
  })
}

function assertShapePatternCards() {
  const cards = json('data/knowledge/shape-pattern-cards-v1.json')
  assert.ok(Array.isArray(cards) && cards.length >= 8, 'expected at least 8 shape pattern cards')
  const ids = new Set()
  for (const card of cards) {
    assert.ok(card.id, 'shape card missing id')
    assert.ok(!ids.has(card.id), `duplicate shape card id ${card.id}`)
    ids.add(card.id)
    assert.ok(card.shapeType, `${card.id} missing shapeType`)
    assert.ok(Array.isArray(card.points) && card.points.length >= 3, `${card.id} needs at least 3 local points`)
    assert.ok(card.teaching?.recognition, `${card.id} missing recognition`)
    assert.ok(card.teaching?.correctThinking, `${card.id} missing correctThinking`)
    assert.ok(card.teaching?.wrongThinking, `${card.id} missing wrongThinking`)
    assert.ok(card.teaching?.drillPrompt, `${card.id} missing drillPrompt`)
    assert.ok(Array.isArray(card.sourceRefs) && card.sourceRefs.length > 0, `${card.id} missing sourceRefs`)
  }
}

function assertShapeKnowledgePack() {
  const cards = json('data/knowledge/elite-pattern-cards-v11.json')
  assert.ok(cards.length >= 6, 'expected v11 shape recognition pack')
  const text = JSON.stringify(cards).toLowerCase()
  for (const required of ['local_pattern_symmetry', 'shape_counter_evidence', 'katago_shape_feature_fusion', 'eye_topology_shape', 'shape_recognition_eval']) {
    assert.ok(text.includes(required.toLowerCase()), `v11 missing ${required}`)
  }
}

function assertFixtures() {
  const files = walkJsonFiles(join(root, 'tests', 'fixtures', 'shape-recognition-golden'))
  assert.ok(files.length >= 3, 'expected at least 3 shape recognition golden fixtures')
  const ids = new Set()
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(file, 'utf8'))
    assert.ok(fixture.id, `${file} missing id`)
    assert.ok(!ids.has(fixture.id), `duplicate fixture id ${fixture.id}`)
    ids.add(fixture.id)
    assert.ok(fixture.sgf, `${fixture.id} missing sgf`)
    assert.ok(Number.isInteger(fixture.moveNumber), `${fixture.id} missing moveNumber`)
    assert.ok(Array.isArray(fixture.expectedShapes) && fixture.expectedShapes.length > 0, `${fixture.id} missing expectedShapes`)
    assert.ok(Array.isArray(fixture.forbiddenShapes), `${fixture.id} missing forbiddenShapes`)
    assert.ok(Array.isArray(fixture.mustHaveEvidence), `${fixture.id} missing mustHaveEvidence`)
  }
}

assertShapePatternCards()
assertShapeKnowledgePack()
assertFixtures()
console.log('shape recognition eval passed')
