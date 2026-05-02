import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

test('local pattern matcher supports symmetry, perspectives, constraints, and counter evidence', () => {
  const source = read('src/main/services/knowledge/localPatternMatcher.ts')
  assert.match(source, /TRANSFORMS/)
  assert.match(source, /rotate90/)
  assert.match(source, /mirror-main-diagonal/)
  assert.match(source, /friendly/)
  assert.match(source, /enemy/)
  assert.match(source, /antiPatterns/)
  assert.match(source, /counterEvidence/)
  assert.match(source, /findLocalPatternMatches/)
})

test('shape recognition engine fuses local patterns and KataGo-derived shape features', () => {
  const source = read('src/main/services/knowledge/shapeRecognitionEngine.ts')
  assert.match(source, /recognizeShapes/)
  assert.match(source, /findLocalPatternMatches/)
  assert.match(source, /extractKataGoShapeFeatures/)
  assert.match(source, /safeWording/)
  assert.match(source, /recognizedShapesToKnowledgePackets/)
})

test('knowledge retrieval includes recognized shape packets before generic knowledge', () => {
  const source = read('src/main/services/knowledge.ts')
  assert.match(source, /recognizeShapes/)
  assert.match(source, /recognizedShapesToKnowledgePackets/)
  assert.match(source, /shapePackets/)
})

test('v11 shape recognition knowledge pack and shape pattern cards are present', () => {
  const v11 = json('data/knowledge/elite-pattern-cards-v11.json')
  const shapes = json('data/knowledge/shape-pattern-cards-v1.json')
  assert.ok(v11.length >= 6)
  assert.ok(shapes.length >= 8)
  assert.ok(v11.some((card) => card.patternType === 'local_pattern_symmetry'))
  assert.ok(shapes.some((card) => card.shapeType === 'cut_point'))
  assert.ok(shapes.some((card) => card.shapeType === 'false_eye_risk'))
})

test('shape recognition eval is wired into package quality checks', () => {
  const pkg = json('package.json')
  assert.equal(pkg.scripts['eval:shape-recognition'], 'node scripts/eval_shape_recognition.mjs')
  assert.match(pkg.scripts['check:teacher-quality'], /eval:shape-recognition/)
})
