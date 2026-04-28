import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')

test('Teacher agent runtime uses a Claude Code style tool loop', () => {
  const agent = read('src/main/services/teacherAgent.ts')
  assert.match(agent, /runTeacherAgentSession/)
  assert.match(agent, /streamOpenAICompatibleToolTurn/)
  assert.match(agent, /tool_calls/)
  assert.match(agent, /role:\s*'tool'/)
  assert.match(agent, /executeAgentToolCall/)
  assert.match(agent, /maxTurns = 10/)
  assert.match(agent, /Agent 达到最大工具轮数/)
  assert.match(agent, /runTeacherAgentSession\(request, logs, id, intent, context\)/)
  assert.doesNotMatch(agent, /result = await runCurrentMove\(request/)
  assert.doesNotMatch(agent, /result = await runGameReview\(request/)
  assert.doesNotMatch(agent, /result = await runBatchReview\(request/)
  assert.doesNotMatch(agent, /result = await runTrainingPlan\(request/)
  assert.doesNotMatch(agent, /friendlyTeacherFallback/)
  assert.doesNotMatch(agent, /desiredShape/)
})

test('Teacher agent exposes domain tools and shell with safety rails', () => {
  const agent = read('src/main/services/teacherAgent.ts')
  for (const tool of [
    'library.findGames',
    'sgf.readGameRecord',
    'katago.analyzePosition',
    'katago.analyzeGameBatch',
    'board.captureTeachingImage',
    'knowledge.searchLocal',
    'web.searchGoKnowledge',
    'studentProfile.read',
    'studentProfile.write',
    'filesystem.read',
    'shell.exec',
    'shell.kill',
    'report.saveAnalysis'
  ]) {
    assert.match(agent, new RegExp(tool.replace('.', '\\.')))
  }
  assert.match(agent, /redactSensitiveText/)
  assert.match(agent, /dangerousShellCommand/)
  assert.match(agent, /git\\s\+reset\\s\+--hard/)
  assert.match(agent, /rm\\s\+\(-\[a-z\]\*r\[a-z\]\*f/)
  assert.match(agent, /MAX_SHELL_OUTPUT_CHARS/)
  assert.match(agent, /runInBackground/)
})

test('Provider supports OpenAI-compatible tool-call turns', () => {
  const providerTypes = read('src/main/services/llm/provider.ts')
  const provider = read('src/main/services/llm/openaiCompatibleProvider.ts')
  assert.match(providerTypes, /role:\s*'system' \| 'user' \| 'assistant' \| 'tool'/)
  assert.match(providerTypes, /export interface ChatToolCall/)
  assert.match(providerTypes, /export interface ChatTool/)
  assert.match(providerTypes, /export interface ChatTurnResult/)
  assert.match(provider, /extractToolCalls/)
  assert.match(provider, /postOpenAICompatibleToolTurn/)
  assert.match(provider, /streamOpenAICompatibleToolTurn/)
  assert.match(provider, /mergeDeltaToolCalls/)
  assert.doesNotMatch(provider, /当前接口需要最终自然语言文本/)
})

test('Teacher prompt requires board, KataGo, and knowledge evidence without template language', () => {
  const agent = read('src/main/services/teacherAgent.ts')
  const evidence = read('src/main/services/teacher/teachingEvidence.ts')
  for (const forbidden of [
    '短讲解卡',
    'desiredShape',
    '不要固定栏目',
    '讲当前手时优先回答',
    '这手想法哪里偏',
    'KataGo 数字只作为证据',
    '不要把答案写成机器报告',
    'friendlyTeacherFallback',
    'buildHumanTeacherInstruction'
  ]) {
    assert.doesNotMatch(agent, new RegExp(forbidden))
    assert.doesNotMatch(evidence, new RegExp(forbidden))
  }
  assert.match(agent, /你是 GoMentor 的围棋老师/)
  assert.match(agent, /需要信息时调用工具/)
  assert.match(agent, /看棋盘图片/)
  assert.match(agent, /调用 KataGo/)
  assert.match(agent, /调用知识库/)
  assert.match(agent, /匹配棋形、定式、死活、手筋/)
  assert.match(agent, /像老师讲棋/)
  assert.match(agent, /相似匹配只能说“像某某型”/)
  assert.match(agent, /boardImageAttached=true 表示/)
  assert.match(agent, /prefetchedAnalysisAvailable=true 表示/)
  assert.match(agent, /工具结果和 KataGo 是事实依据/)
  assert.match(agent, /不要编造坐标、胜率、PV、定式名或来源/)
})
