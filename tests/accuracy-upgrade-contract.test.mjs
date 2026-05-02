import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('accuracy upgrade adds SGF setup and board-state foundations', () => {
  const sgf = read('src/main/services/sgf.ts')
  const board = read('src/main/services/go/boardState.ts')
  const types = read('src/main/lib/types.ts')
  assert.match(board, /extractInitialStonesFromSgf/)
  assert.match(board, /AB/)
  assert.match(board, /AW/)
  assert.match(board, /AE/)
  assert.match(board, /buildBoardState/)
  assert.match(sgf, /initialStones: extractInitialStonesFromSgf/)
  assert.match(types, /export interface BoardSetupStone/)
  assert.match(types, /initialStones\?: BoardSetupStone\[\]/)
})

test('KataGo evidence v2 exposes quality and richer analysis fields', () => {
  const katago = read('src/main/services/katago.ts')
  const types = read('src/main/lib/types.ts')
  assert.match(types, /export interface AnalysisQuality/)
  assert.match(types, /scoreStdev\?: number/)
  assert.match(types, /pvVisits\?: number\[\]/)
  assert.match(types, /humanPrior\?: number/)
  assert.match(katago, /includeOwnership/)
  assert.match(katago, /includePVVisits/)
  assert.match(katago, /initialStonesFromRecord/)
  assert.match(katago, /buildAnalysisQuality/)
  assert.match(katago, /analysisQuality: buildAnalysisQuality/)
})

test('teacher prompt and compact analysis surface confidence for grounded explanations', () => {
  const agent = read('src/main/services/teacherAgent.ts')
  assert.match(agent, /每个关键结论都应能回指到工具证据/)
  assert.match(agent, /analysisQuality\.confidence/)
  assert.match(agent, /analysisQuality: analysis\.analysisQuality/)
  assert.match(agent, /humanCalibration: analysis\.humanCalibration/)
})

test('claim verifier blocks unsupported coordinates, joseki overclaims, and absolute language', () => {
  const verifier = read('src/main/services/teacher/claimVerifier.ts')
  assert.match(verifier, /verifyGroundedClaims/)
  assert.match(verifier, /verifyTeacherClaimsFromMarkdown/)
  assert.match(verifier, /unsupported coordinate/)
  assert.match(verifier, /joseki without medium\/strong joseki motif/)
  assert.match(verifier, /too absolute/)
})

test('knowledge base v6 expansion is loaded by motif recognizer', () => {
  const motif = read('src/main/services/knowledge/motifRecognizer.ts')
  const cards = read('data/knowledge/elite-pattern-cards-v6.json')
  assert.match(motif, /elite-pattern-cards-v6\.json/)
  assert.match(cards, /liberty_shortage/)
  assert.match(cards, /cut_point_connection/)
  assert.match(cards, /reverse_sente_yose/)
  assert.match(cards, /invasion_reduction_balance/)
})

test('teacher-quality eval script is wired', () => {
  const pkg = read('package.json')
  const evalScript = read('scripts/eval_teaching_accuracy.mjs')
  assert.match(pkg, /eval:teacher/)
  assert.match(pkg, /check:teacher-quality/)
  assert.match(evalScript, /teaching-golden/)
})
