import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

const catalog = JSON.parse(await readFile(new URL('../data/knowledge/training-catalog.json', import.meta.url), 'utf8'))
const patterns = JSON.parse(await readFile(new URL('../data/knowledge/pattern-cards.json', import.meta.url), 'utf8'))
const patternIds = new Set(patterns.map((card) => card.id))
const allowedSourceKinds = new Set(['original', 'common-pattern', 'licensed-source'])
const pointPattern = /^[A-HJ-T](?:[1-9]|1[0-9])$/
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function findJitiCli() {
  const direct = join(repoRoot, 'node_modules', 'jiti', 'lib', 'jiti-cli.mjs')
  if (existsSync(direct)) return direct

  const pnpmStore = join(repoRoot, 'node_modules', '.pnpm')
  if (existsSync(pnpmStore)) {
    const jitiPackage = readdirSync(pnpmStore).find((entry) => entry.startsWith('jiti@'))
    if (jitiPackage) {
      const cli = join(pnpmStore, jitiPackage, 'node_modules', 'jiti', 'lib', 'jiti-cli.mjs')
      if (existsSync(cli)) return cli
    }
  }

  throw new Error('Unable to locate jiti CLI for TypeScript fixture execution')
}

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

test('matching engine feeds knowledge matches to the agent without forcing UI templates', async () => {
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
  assert.match(teacher, /工具结果和 KataGo 是事实依据/)
  assert.doesNotMatch(teacher, /partial 匹配只能说/)
  assert.match(card, /ks-teacher-pro-markdown/)
  assert.match(card, /查看工具调用/)
  assert.doesNotMatch(card, /知识匹配/)
  assert.doesNotMatch(card, /关联训练题/)
})

test('matching engine ranks exact joseki, life-death, and tesuji matches ahead of broad patterns', () => {
  const fixture = join(repoRoot, 'tests', 'fixtures', 'knowledge-match-engine-smoke.ts')
  const output = execFileSync(process.execPath, [findJitiCli(), fixture], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  const result = JSON.parse(output)

  assert.equal(result.star33.matches[0].matchType, 'joseki')
  assert.equal(result.star33.matches[0].confidence, 'exact')
  assert.match(result.star33.matches[0].title, /星位点三三/)
  assert.deepEqual(result.star33.recommendedProblems, [])

  assert.equal(result.trueFalseEye.matches[0].matchType, 'life_death')
  assert.equal(result.trueFalseEye.matches[0].confidence, 'exact')
  assert.match(result.trueFalseEye.matches[0].title, /真眼假眼/)
  assert.equal(result.trueFalseEye.recommendedProblems[0].problemType, 'life_death')
  assert.match(result.trueFalseEye.recommendedProblems[0].title, /真眼假眼/)

  const firstTesujiIndex = result.snapback.matches.findIndex((match) => match.matchType === 'tesuji')
  const firstJosekiIndex = result.snapback.matches.findIndex((match) => match.matchType === 'joseki')
  assert.equal(firstTesujiIndex, 0)
  assert.equal(result.snapback.matches[0].confidence, 'exact')
  assert.match(result.snapback.matches[0].title, /倒扑/)
  assert.ok(firstJosekiIndex === -1 || firstJosekiIndex > firstTesujiIndex)
  assert.equal(result.snapback.recommendedProblems[0].problemType, 'tesuji')
  assert.match(result.snapback.recommendedProblems[0].title, /倒扑/)

  assert.equal(result.avalanche.matches[0].matchType, 'joseki')
  assert.match(result.avalanche.matches[0].title, /大雪崩/)

  assert.equal(result.plumSix.matches[0].matchType, 'life_death')
  assert.match(result.plumSix.matches[0].title, /梅花六/)
  assert.equal(result.plumSix.recommendedProblems[0].problemType, 'life_death')

  assert.equal(result.connectAndDie.matches[0].matchType, 'tesuji')
  assert.match(result.connectAndDie.matches[0].title, /接不归/)
  assert.equal(result.connectAndDie.recommendedProblems[0].problemType, 'tesuji')

  assert.equal(result.geometricTrueFalseEye.matches[0].matchType, 'life_death')
  assert.match(result.geometricTrueFalseEye.matches[0].title, /真眼假眼/)
  assert.ok(result.geometricTrueFalseEye.matches[0].reason.some((reason) => reason.startsWith('geometry:')))
  assert.ok(result.geometricTrueFalseEye.matches[0].reason.some((reason) => reason.startsWith('liberties:')))
})
