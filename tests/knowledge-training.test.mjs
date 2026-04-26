import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const catalog = JSON.parse(await readFile(new URL('../data/knowledge/training-catalog.json', import.meta.url), 'utf8'))
const patterns = JSON.parse(await readFile(new URL('../data/knowledge/pattern-cards.json', import.meta.url), 'utf8'))
const patternIds = new Set(patterns.map((card) => card.id))
const allowedSourceKinds = new Set(['original', 'common-pattern', 'licensed-source'])
const pointPattern = /^[A-HJ-T](?:[1-9]|1[0-9])$/

function assertPoint(point, label) {
  assert.match(point, pointPattern, label)
}

test('training catalog reaches P0 knowledge coverage targets', () => {
  assert.equal(catalog.version, 1)
  assert.ok(catalog.josekiLines.length >= 60)
  assert.ok(catalog.lifeDeathProblems.length >= 120)
  assert.ok(catalog.tesujiProblems.length >= 60)
  assert.equal(catalog.sourcePolicy.defaultSourceKind, 'common-pattern')
})

test('training catalog ids, source policy, and pattern links are valid', () => {
  const ids = new Set()
  for (const item of [...catalog.josekiLines, ...catalog.lifeDeathProblems, ...catalog.tesujiProblems]) {
    assert.ok(item.id)
    assert.ok(item.title)
    assert.equal(ids.has(item.id), false, item.id)
    ids.add(item.id)
    assert.equal(allowedSourceKinds.has(item.sourceKind), true, item.id)
    for (const patternId of item.patternCardIds ?? []) {
      assert.equal(patternIds.has(patternId), true, `${item.id} -> ${patternId}`)
    }
  }
})

test('joseki lines include usable branch and decision guidance', () => {
  for (const line of catalog.josekiLines) {
    assert.ok(Array.isArray(line.relativeSequence) && line.relativeSequence.length >= 4, line.id)
    for (const point of line.relativeSequence) assertPoint(point, line.id)
    assert.ok(Array.isArray(line.branches) && line.branches.length > 0, line.id)
    assert.ok(Array.isArray(line.decisionRules) && line.decisionRules.length >= 2, line.id)
    assert.ok(Array.isArray(line.commonMistakes) && line.commonMistakes.length > 0, line.id)
    assert.ok(line.katagoEraJudgement, line.id)
  }
})

test('life-and-death and tesuji problems include answer and failure explanations', () => {
  for (const problem of [...catalog.lifeDeathProblems, ...catalog.tesujiProblems]) {
    assert.ok(Array.isArray(problem.initialStones) && problem.initialStones.length > 0, problem.id)
    for (const stone of problem.initialStones) {
      assert.ok(['B', 'W'].includes(stone.color), problem.id)
      assertPoint(stone.point, problem.id)
    }
    assert.ok(Array.isArray(problem.correctMoves) && problem.correctMoves.length > 0, problem.id)
    assert.ok(Array.isArray(problem.failureMoves) && problem.failureMoves.length > 0, problem.id)
    for (const move of [...problem.correctMoves, ...problem.failureMoves]) assertPoint(move.move, problem.id)
    assert.ok(problem.teaching?.recognition, problem.id)
    assert.ok(problem.teaching?.failureExplanation, problem.id)
  }
})

test('matching engine and teacher runtime expose knowledge matches and training recommendations', async () => {
  const types = await readFile(new URL('../src/main/lib/types.ts', import.meta.url), 'utf8')
  const knowledge = await readFile(new URL('../src/main/services/knowledge.ts', import.meta.url), 'utf8')
  const engine = await readFile(new URL('../src/main/services/knowledge/matchEngine.ts', import.meta.url), 'utf8')
  const teacher = await readFile(new URL('../src/main/services/teacherAgent.ts', import.meta.url), 'utf8')
  const card = await readFile(new URL('../src/renderer/src/features/teacher/TeacherRunCardPro.tsx', import.meta.url), 'utf8')

  assert.match(types, /export interface KnowledgeMatch/)
  assert.match(types, /recommendedProblems\?: RecommendedProblem\[\]/)
  assert.match(knowledge, /searchKnowledgeMatches/)
  assert.match(engine, /searchKnowledgeMatchEngine/)
  assert.match(engine, /recommendedProblemsFromMatches/)
  assert.match(teacher, /knowledgeMatches/)
  assert.match(teacher, /recommendedProblems/)
  assert.match(teacher, /partial 匹配只能说/)
  assert.match(card, /知识匹配/)
  assert.match(card, /关联训练题/)
})
