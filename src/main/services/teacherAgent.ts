import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { getGames, getSettings, replaceSettings, reportsDir } from '@main/lib/store'
import type {
  CoachUserLevel,
  GameMove,
  KataGoMoveAnalysis,
  KnowledgeMatch,
  KnowledgePacket,
  LibraryGame,
  RecommendedProblem,
  ReviewArtifact,
  StructuredTeacherResult,
  StudentProfile,
  TeachingPacingAdvice,
  TeacherRunRequest,
  TeacherRunProgress,
  TeacherRunResult,
  TeacherToolLog
} from '@main/lib/types'
import type { ChatMessage, ChatTool, ChatToolCall, ProviderSettings } from './llm/provider'
import { analyzePosition, analyzeMoveRange } from './katago'
import { parseMoveRangeFromPrompt } from '@main/lib/moveRange'
import { searchKnowledge, searchKnowledgeMatches } from './knowledge'
import { recommendedProblemsFromMatches, type BoardSnapshotStone, type LocalWindow } from './knowledge/matchEngine'
import { readGameRecord } from './sgf'
import { ensureFoxGameDownloaded } from './fox'
import { getStudentProfile, readStudentForGame, updateStudentProfile } from './studentProfile'
import { runReview } from './review'
import { applyDetectedDefaults, detectSystemProfile } from './systemProfile'
import { parseStructuredTeacherResult } from './teacher/structuredResultParser'
import { classifyTeacherIntent, type TeacherIntent } from './teacher/intentClassifier'
import { buildTeachingPacingAdvice } from './teacher/teachingEvidence'
import { streamOpenAICompatibleToolTurn } from './llm/openaiCompatibleProvider'

type TeacherProgressEmitter = (progress: TeacherRunProgress) => void

interface TeacherRunContext {
  runId: string
  emit?: TeacherProgressEmitter
}

interface BatchIssue {
  game: LibraryGame
  moveNumber: number
  playedMove: string
  bestMove: string
  loss: number
  scoreLead: number
  pv: string[]
}

function startTool(logs: TeacherToolLog[], name: string, label: string, detail: string): TeacherToolLog {
  const log: TeacherToolLog = {
    id: randomUUID(),
    name,
    label,
    detail,
    status: 'running',
    startedAt: new Date().toISOString()
  }
  logs.push(log)
  return log
}

function finishTool(log: TeacherToolLog, status: TeacherToolLog['status'], detail?: string): void {
  log.status = status
  if (detail) {
    log.detail = detail
  }
  log.endedAt = new Date().toISOString()
}

function cloneToolLogs(logs: TeacherToolLog[]): TeacherToolLog[] {
  return logs.map((log) => ({ ...log }))
}

function emitProgress(context: TeacherRunContext | undefined, progress: Omit<TeacherRunProgress, 'runId'>): void {
  context?.emit?.({
    runId: context.runId,
    ...progress
  })
}

function emitToolState(context: TeacherRunContext | undefined, logs: TeacherToolLog[], message: string): void {
  emitProgress(context, {
    stage: 'tool',
    message,
    toolLogs: cloneToolLogs(logs)
  })
}

function emitAssistantDelta(context: TeacherRunContext | undefined, delta: string): void {
  emitProgress(context, {
    stage: 'assistant-delta',
    markdownDelta: delta
  })
}

function inferCount(prompt: string): number {
  const arabic = prompt.match(/(\d+)\s*盘/)
  if (arabic) {
    return Math.max(1, Math.min(20, Number(arabic[1])))
  }
  if (/十盘|10盘|最近十/.test(prompt)) {
    return 10
  }
  return 10
}

function detectStudentName(request: TeacherRunRequest, game?: LibraryGame): string {
  const settings = getSettings()
  return (
    request.playerName?.trim() ||
    settings.defaultPlayerName.trim() ||
    game?.sourceLabel.replace(/^Fox\s*/, '').trim() ||
    game?.black ||
    '默认学生'
  )
}

function findGamesForStudent(studentName: string, count: number): LibraryGame[] {
  const target = studentName.trim().toLowerCase()
  const games = getGames()
  const matched = target
    ? games.filter((game) =>
        [game.black, game.white, game.sourceLabel, game.title].some((value) =>
          value.toLowerCase().includes(target)
        )
      )
    : games
  return (matched.length > 0 ? matched : games).slice(0, count)
}

function gtpToCoord(point: string, boardSize: number): { row: number; col: number } | null {
  const match = point.trim().toUpperCase().match(/^([A-HJ-T])(\d{1,2})$/)
  if (!match) return null
  const letters = 'ABCDEFGHJKLMNOPQRST'
  const col = letters.indexOf(match[1])
  const number = Number(match[2])
  if (col < 0 || col >= boardSize || number < 1 || number > boardSize) return null
  return { row: boardSize - number, col }
}

function coordToGtp(row: number, col: number, boardSize: number): string {
  const letters = 'ABCDEFGHJKLMNOPQRST'
  return `${letters[col]}${boardSize - row}`
}

function coordKey(row: number, col: number): string {
  return `${row},${col}`
}

function neighborsOf(row: number, col: number, boardSize: number): Array<{ row: number; col: number }> {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 }
  ].filter((point) => point.row >= 0 && point.col >= 0 && point.row < boardSize && point.col < boardSize)
}

function collectGroup(board: Map<string, 'B' | 'W'>, row: number, col: number, boardSize: number): Array<{ row: number; col: number }> {
  const color = board.get(coordKey(row, col))
  if (!color) return []
  const seen = new Set<string>()
  const group: Array<{ row: number; col: number }> = []
  const stack = [{ row, col }]
  while (stack.length > 0) {
    const current = stack.pop()!
    const key = coordKey(current.row, current.col)
    if (seen.has(key)) continue
    if (board.get(key) !== color) continue
    seen.add(key)
    group.push(current)
    for (const next of neighborsOf(current.row, current.col, boardSize)) {
      if (board.get(coordKey(next.row, next.col)) === color) {
        stack.push(next)
      }
    }
  }
  return group
}

function groupHasLiberty(board: Map<string, 'B' | 'W'>, group: Array<{ row: number; col: number }>, boardSize: number): boolean {
  return group.some((stone) => neighborsOf(stone.row, stone.col, boardSize).some((next) => !board.has(coordKey(next.row, next.col))))
}

function buildBoardSnapshot(moves: GameMove[], uptoMoveNumber: number, boardSize: number): BoardSnapshotStone[] {
  const board = new Map<string, 'B' | 'W'>()
  for (const move of moves.slice(0, Math.max(0, uptoMoveNumber))) {
    if (move.pass) continue
    const coord = move.row !== null && move.col !== null ? { row: move.row, col: move.col } : gtpToCoord(move.gtp, boardSize)
    if (!coord) continue
    const key = coordKey(coord.row, coord.col)
    board.set(key, move.color)
    const opponent = move.color === 'B' ? 'W' : 'B'
    for (const next of neighborsOf(coord.row, coord.col, boardSize)) {
      if (board.get(coordKey(next.row, next.col)) !== opponent) continue
      const group = collectGroup(board, next.row, next.col, boardSize)
      if (!groupHasLiberty(board, group, boardSize)) {
        for (const stone of group) board.delete(coordKey(stone.row, stone.col))
      }
    }
    const ownGroup = collectGroup(board, coord.row, coord.col, boardSize)
    if (!groupHasLiberty(board, ownGroup, boardSize)) {
      for (const stone of ownGroup) board.delete(coordKey(stone.row, stone.col))
    }
  }
  return [...board.entries()].map(([key, color]) => {
    const [row, col] = key.split(',').map(Number)
    return { color, point: coordToGtp(row, col, boardSize) }
  })
}

function buildLocalWindows(snapshot: BoardSnapshotStone[], anchors: Array<string | undefined>, boardSize: number): LocalWindow[] {
  return [...new Set(anchors.filter(Boolean) as string[])]
    .filter((anchor) => gtpToCoord(anchor, boardSize))
    .map((anchor) => {
      const anchorPoint = gtpToCoord(anchor, boardSize)!
      return {
        anchor,
        stones: snapshot.filter((stone) => {
          const point = gtpToCoord(stone.point, boardSize)
          if (!point) return false
          return Math.max(Math.abs(point.row - anchorPoint.row), Math.abs(point.col - anchorPoint.col)) <= 4
        })
      }
    })
    .filter((window) => window.stones.length > 0)
}

function tagsFromAnalysis(analysis: KataGoMoveAnalysis, move?: GameMove): string[] {
  const tags = new Set<string>()
  if (analysis.moveNumber <= 40) {
    tags.add('布局')
    tags.add('方向')
    tags.add('大场')
  }
  if ((analysis.playedMove?.winrateLoss ?? 0) >= 4) {
    tags.add('急所')
    tags.add('价值判断')
  }
  if ((analysis.playedMove?.winrateLoss ?? 0) >= 10) {
    tags.add('问题手')
  }
  if (move && move.row !== null && move.col !== null) {
    const edge = Math.min(move.row, move.col, analysis.boardSize - 1 - move.row, analysis.boardSize - 1 - move.col)
    if (edge <= 4) {
      tags.add('角部')
      tags.add('定式')
    }
  }
  for (const candidate of analysis.before.topMoves.slice(0, 2)) {
    if (candidate.pv.length > 0) {
      tags.add('变化')
    }
  }
  return [...tags]
}

function themesFromProfile(profile: StudentProfile): string[] {
  const tags = profile.commonMistakes.slice(0, 4).map((item) => item.tag)
  if (tags.length === 0) {
    return ['大场与急所判断', '每手棋先看全局价值', '跟着 KataGo PV 复盘关键变化']
  }
  return tags.map((tag) => {
    if (tag.includes('布局') || tag.includes('大场')) {
      return '布局阶段先比较大场和急所'
    }
    if (tag.includes('计算')) {
      return '关键战斗前先读 3 手变化'
    }
    if (tag.includes('形势')) {
      return '用目差和胜率变化校准形势判断'
    }
    return `围绕${tag}做专项复盘`
  })
}

function systemPrompt(level: CoachUserLevel): string {
  return [
    '你是 GoMentor 的围棋老师。',
    '帮助学生理解棋局，并提升下一次判断。',
    '需要信息时调用工具；不要靠印象猜局面。',
    '分析当前手时必须先看棋盘图片，再调用 KataGo 工具核对当前手、一选、胜率差、目差、搜索数和 PV，然后调用知识库工具匹配棋形、定式、死活、手筋或常见错误类型。',
    '工具结果和 KataGo 是事实依据。',
    '不要编造坐标、胜率、PV、定式名或来源。',
    '强匹配才能明确说定式、死活型或手筋名；相似匹配只能说“像某某型”。',
    '把握讲解火候：常规定式少讲，分支列变化，中盘战详细讲目的和后续。',
    '如果工具结果给出 teachingDensity，就按它控制详略：minimal 很短，branch 讲 1-2 个关键变化，detailed 讲目的、应手、后续变化和实战评价，caution 只说倾向。',
    '像老师讲棋：先帮学生看懂棋形和判断方法，再自然引用必要证据；不要按固定栏目或机器报告口吻堆字段。',
    `学生水平：${level}。`
  ].join('\n')
}

function saveReport(id: string, title: string, markdown: string, extra: Record<string, unknown>): string {
  const dir = join(reportsDir, id)
  mkdirSync(dir, { recursive: true })
  const markdownPath = join(dir, 'report.md')
  const jsonPath = join(dir, 'report.json')
  writeFileSync(markdownPath, markdown, 'utf8')
  writeFileSync(jsonPath, JSON.stringify({ title, ...extra }, null, 2), 'utf8')
  return markdownPath
}

function structuredFromTeacherText(
  markdown: string,
  taskType: StructuredTeacherResult['taskType'],
  knowledge: KnowledgePacket[],
  knowledgeMatches: KnowledgeMatch[] = [],
  recommendedProblems: RecommendedProblem[] = []
): StructuredTeacherResult {
  const parsed = parseStructuredTeacherResult({
    text: markdown,
    taskType,
    knowledgeCardIds: knowledge.map((card) => card.id)
  }) as StructuredTeacherResult
  return {
    ...parsed,
    knowledgeMatches: parsed.knowledgeMatches?.length ? parsed.knowledgeMatches : knowledgeMatches,
    recommendedProblems: parsed.recommendedProblems?.length ? parsed.recommendedProblems : recommendedProblems,
    profileUpdates: {
      ...parsed.profileUpdates,
      patterns: parsed.profileUpdates.patterns,
      trainingFocus: parsed.profileUpdates.trainingFocus
    }
  }
}

function extractIssues(artifact: ReviewArtifact | undefined, game: LibraryGame): BatchIssue[] {
  const summary = artifact?.summary as { issues?: Array<Record<string, unknown>> } | undefined
  return (summary?.issues ?? []).slice(0, 6).map((issue) => ({
    game,
    moveNumber: Number(issue.move_number ?? 0),
    playedMove: String(issue.played_move ?? ''),
    bestMove: String(issue.best_move ?? ''),
    loss: Number(issue.loss ?? 0),
    scoreLead: Number(issue.score_lead ?? 0),
    pv: Array.isArray(issue.pv) ? issue.pv.map(String).slice(0, 10) : []
  }))
}

type JsonObject = Record<string, unknown>

interface TeacherAgentToolDefinition {
  apiName: string
  canonicalName: string
  label: string
  description: string
  parameters: JsonObject
  execute: (input: JsonObject, state: TeacherAgentSessionState) => Promise<unknown>
}

interface TeacherAgentSessionState {
  id: string
  request: TeacherRunRequest
  intent: TeacherIntent
  logs: TeacherToolLog[]
  context?: TeacherRunContext
  studentName: string
  profile: StudentProfile
  game?: LibraryGame
  record?: ReturnType<typeof readGameRecord>
  lastAnalysis?: KataGoMoveAnalysis
  knowledge: KnowledgePacket[]
  knowledgeMatches: KnowledgeMatch[]
  recommendedProblems: RecommendedProblem[]
  teachingPacing?: TeachingPacingAdvice
  finalMarkdown: string
}

interface ShellTask {
  id: string
  command: string
  cwd: string
  process: ChildProcessWithoutNullStreams
  startedAt: string
}

const SHELL_TASKS = new Map<string, ShellTask>()
const MAX_TOOL_RESULT_CHARS = 18_000
const MAX_SHELL_OUTPUT_CHARS = 24_000

function agentSystemPrompt(level: CoachUserLevel): string {
  return systemPrompt(level)
}

function providerSettingsFromApp(): ProviderSettings {
  const settings = getSettings()
  if (!settings.llmBaseUrl.trim() || !settings.llmApiKey.trim() || !settings.llmModel.trim()) {
    throw new Error('请先配置支持 tool calling 和图片输入的 OpenAI-compatible LLM 代理。')
  }
  return {
    llmBaseUrl: settings.llmBaseUrl,
    llmApiKey: settings.llmApiKey,
    llmModel: settings.llmModel
  }
}

function stringInput(input: JsonObject, key: string, fallback = ''): string {
  const value = input[key]
  return typeof value === 'string' ? value.trim() : fallback
}

function numberInput(input: JsonObject, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const value = input[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function booleanInput(input: JsonObject, key: string, fallback = false): boolean {
  const value = input[key]
  return typeof value === 'boolean' ? value : fallback
}

function arrayInput(input: JsonObject, key: string): string[] {
  const value = input[key]
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]')
    .replace(/\b(sk|ghp|github_pat|xoxb|xoxp|AKIA)[A-Za-z0-9_\-]{12,}\b/g, '[REDACTED_TOKEN]')
    .replace(/((api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s"'`]+/gi, '$1[REDACTED]')
}

function compactToolResult(value: unknown, maxChars = MAX_TOOL_RESULT_CHARS): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const redacted = redactSensitiveText(raw)
  if (redacted.length <= maxChars) {
    return redacted
  }
  return `${redacted.slice(0, maxChars)}\n\n[tool result truncated: ${redacted.length - maxChars} chars omitted]`
}

function parseToolArguments(call: ChatToolCall): JsonObject {
  try {
    const parsed = JSON.parse(call.function.arguments || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : {}
  } catch {
    return {}
  }
}

function chatTool(tool: TeacherAgentToolDefinition): ChatTool {
  return {
    type: 'function',
    function: {
      name: tool.apiName,
      description: `${tool.canonicalName}: ${tool.description}`,
      parameters: tool.parameters
    }
  }
}

function schema(properties: JsonObject, required: string[] = []): JsonObject {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false
  }
}

async function ensureSessionGame(state: TeacherAgentSessionState, gameIdInput?: string): Promise<LibraryGame | undefined> {
  const gameId = gameIdInput || state.request.gameId
  if (!gameId) {
    return undefined
  }
  if (state.game?.id === gameId) {
    return state.game
  }
  const indexed = getGames().find((item) => item.id === gameId)
  if (!indexed) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }
  const game = await ensureFoxGameDownloaded(indexed)
  state.game = game
  return game
}

async function ensureSessionRecord(state: TeacherAgentSessionState, gameIdInput?: string): Promise<ReturnType<typeof readGameRecord> | undefined> {
  const game = await ensureSessionGame(state, gameIdInput)
  if (!game) {
    return undefined
  }
  if (state.record?.game.id === game.id) {
    return state.record
  }
  const record = readGameRecord(game)
  state.record = record
  return record
}

function taskTypeForIntent(intent: TeacherIntent): StructuredTeacherResult['taskType'] {
  if (intent === 'current-move') return 'current-move'
  if (intent === 'game-review') return 'full-game'
  if (intent === 'batch-review') return 'recent-games'
  if (intent === 'move-range') return 'move-range'
  return 'freeform'
}

function initialAgentUserMessage(state: TeacherAgentSessionState): ChatMessage {
  const context = {
    userPrompt: state.request.prompt,
    intent: state.intent,
    gameId: state.request.gameId,
    moveNumber: state.request.moveNumber,
    playerName: state.request.playerName || state.studentName,
    boardImageAttached: Boolean(state.request.boardImageDataUrl) || (state.request.boardImageDataUrls?.length ?? 0) > 0,
    boardImagesAttached: state.request.boardImageDataUrls?.length ?? 0,
    moveRange: state.request.moveRange,
    prefetchedAnalysisAvailable: Boolean(state.request.prefetchedAnalysis),
    note: '请按需要调用工具取得事实；没有工具证据时不要猜坐标、胜率、PV、定式名或来源。'
  }
  const text = [
    '任务说明：请根据 intent 完成用户请求。',
    '如果 intent 是 current-move，请先观察随消息附带的棋盘图片，再调用 KataGo 和知识库工具核对事实。',
    '如果 intent 是 move-range，请依次观察附带的棋盘图片（每张对应区间内的一手关键棋），先概括区间内胜率走势和整体特征，然后重点讲解胜率损失最大的关键手，说明每手的得失和更好的选点。',
    '当前手讲解要按工具返回的 teachingDensity 掌握详略：常规定式少讲；定式分支或相似型列关键变化；中盘战、攻杀、转换要讲目的、对方应手、后续变化和实战评价。',
    'boardImageAttached=true 表示本轮用户消息已附棋盘图，请把图片中的棋形、厚薄、急所和全局方向作为局面判断依据。',
    'boardImagesAttached>0 表示附带了多张区间关键手棋盘图。',
    'prefetchedAnalysisAvailable=true 表示 katago.analyzePosition 可复用已缓存的 KataGo 分析结果。',
    '上下文JSON：',
    JSON.stringify(context)
  ].join('\n')
  if (state.request.boardImageDataUrls?.length) {
    const imageBlocks = state.request.boardImageDataUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url }
    }))
    return {
      role: 'user',
      content: [
        { type: 'text', text },
        ...imageBlocks
      ]
    }
  }
  if (state.request.boardImageDataUrl) {
    return {
      role: 'user',
      content: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: state.request.boardImageDataUrl } }
      ]
    }
  }
  return { role: 'user', content: text }
}

function summarizeGames(games: LibraryGame[]): Array<Pick<LibraryGame, 'id' | 'title' | 'black' | 'white' | 'result' | 'date' | 'source' | 'downloadStatus' | 'moveCount'>> {
  return games.map((game) => ({
    id: game.id,
    title: game.title,
    black: game.black,
    white: game.white,
    result: game.result,
    date: game.date,
    source: game.source,
    downloadStatus: game.downloadStatus,
    moveCount: game.moveCount
  }))
}

function compactAnalysis(analysis: KataGoMoveAnalysis): JsonObject {
  const teachingPacing = buildTeachingPacingAdvice(analysis)
  return {
    gameId: analysis.gameId,
    moveNumber: analysis.moveNumber,
    boardSize: analysis.boardSize,
    currentMove: analysis.currentMove,
    judgement: analysis.judgement,
    before: {
      winrate: analysis.before.winrate,
      scoreLead: analysis.before.scoreLead,
      topMoves: analysis.before.topMoves.slice(0, 8)
    },
    after: {
      winrate: analysis.after.winrate,
      scoreLead: analysis.after.scoreLead,
      topMoves: analysis.after.topMoves.slice(0, 5)
    },
    playedMove: analysis.playedMove,
    teachingPacing
  }
}

async function knowledgeBundleForState(state: TeacherAgentSessionState, input: JsonObject): Promise<{
  knowledge: KnowledgePacket[]
  knowledgeMatches: KnowledgeMatch[]
  recommendedProblems: RecommendedProblem[]
  teachingPacing?: TeachingPacingAdvice
}> {
  const record = await ensureSessionRecord(state).catch(() => undefined)
  const analysis = state.lastAnalysis
  const moveNumber = numberInput(input, 'moveNumber', analysis?.moveNumber ?? state.request.moveNumber ?? record?.moves.length ?? 80, 0, record?.moves.length ?? 400)
  const boardSize = record?.boardSize ?? analysis?.boardSize ?? 19
  const boardSnapshot = record ? buildBoardSnapshot(record.moves, Math.max(0, moveNumber - 1), boardSize) : undefined
  const anchors = analysis
    ? [
        analysis.playedMove?.move ?? analysis.currentMove?.gtp,
        ...analysis.before.topMoves.slice(0, 6).map((candidate) => candidate.move),
        ...analysis.before.topMoves.slice(0, 2).flatMap((candidate) => candidate.pv.slice(0, 4))
      ]
    : arrayInput(input, 'candidateMoves')
  const localWindows = boardSnapshot ? buildLocalWindows(boardSnapshot, anchors, boardSize) : undefined
  const query = {
    text: stringInput(input, 'text', state.request.prompt),
    moveNumber,
    totalMoves: record?.moves.length ?? moveNumber,
    boardSize,
    recentMoves: record?.moves.slice(Math.max(0, moveNumber - 40), moveNumber) ?? [],
    userLevel: state.profile.userLevel,
    studentLevel: state.profile.userLevel,
    playerColor: analysis?.currentMove?.color,
    lossScore: analysis?.playedMove?.scoreLoss ?? numberInput(input, 'lossScore', 2),
    judgement: analysis?.judgement ?? 'mistake',
    contextTags: analysis ? tagsFromAnalysis(analysis, analysis.currentMove) : themesFromProfile(state.profile),
    playedMove: analysis?.playedMove?.move ?? analysis?.currentMove?.gtp ?? stringInput(input, 'playedMove'),
    candidateMoves: analysis?.before.topMoves.slice(0, 8).map((candidate) => candidate.move) ?? arrayInput(input, 'candidateMoves'),
    principalVariation: analysis?.before.topMoves.slice(0, 3).flatMap((candidate) => candidate.pv.slice(0, 8)) ?? arrayInput(input, 'principalVariation'),
    boardSnapshot,
    localWindows,
    maxResults: numberInput(input, 'maxResults', 4, 1, 8)
  }
  const knowledgeMatches = searchKnowledgeMatches({ ...query, maxResults: 8 })
  const recommendedProblems = recommendedProblemsFromMatches(knowledgeMatches, 3, { includeWeakFallback: true, includeJosekiFallback: true, includeDrillFallback: true })
  const knowledge = searchKnowledge(query)
  const teachingPacing = analysis ? buildTeachingPacingAdvice(analysis, knowledgeMatches) : undefined
  state.knowledge = knowledge
  state.knowledgeMatches = knowledgeMatches
  state.recommendedProblems = recommendedProblems
  state.teachingPacing = teachingPacing
  return { knowledge, knowledgeMatches, recommendedProblems, teachingPacing }
}

function dangerousShellCommand(command: string): string | null {
  const normalized = command.trim().toLowerCase()
  const patterns: Array<[RegExp, string]> = [
    [/\brm\s+(-[a-z]*r[a-z]*f|-rf|-fr)\b/, '拒绝执行递归强制删除命令'],
    [/\bgit\s+reset\s+--hard\b/, '拒绝执行 git reset --hard'],
    [/\bgit\s+clean\s+-[a-z]*f\b/, '拒绝执行 git clean -f'],
    [/\bsudo\b/, '拒绝执行 sudo'],
    [/\b(shutdown|reboot|halt)\b/, '拒绝执行关机/重启命令'],
    [/\bmkfs\b|\bdd\s+if=.*\bof=\/dev\//, '拒绝执行磁盘破坏性命令']
  ]
  return patterns.find(([pattern]) => pattern.test(normalized))?.[1] ?? null
}

function runShell(input: JsonObject): Promise<unknown> {
  const command = stringInput(input, 'command')
  if (!command) {
    throw new Error('shell.exec 需要 command。')
  }
  const blocked = dangerousShellCommand(command)
  if (blocked) {
    throw new Error(blocked)
  }
  const cwdInput = stringInput(input, 'cwd')
  const cwd = cwdInput ? resolve(cwdInput) : process.cwd()
  const timeoutMs = numberInput(input, 'timeoutMs', 60_000, 1_000, 180_000)
  const runInBackground = booleanInput(input, 'runInBackground', false)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.SHELL || 'zsh', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: 'pipe'
    })
    const startedAt = new Date().toISOString()
    const taskId = randomUUID()
    let stdout = ''
    let stderr = ''
    let settled = false
    const append = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      if (target === 'stdout') stdout = (stdout + text).slice(-MAX_SHELL_OUTPUT_CHARS)
      else stderr = (stderr + text).slice(-MAX_SHELL_OUTPUT_CHARS)
    }
    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    const timer = setTimeout(() => {
      if (settled) return
      child.kill('SIGTERM')
      settled = true
      reject(new Error(`shell.exec 超时: ${timeoutMs}ms`))
    }, timeoutMs)
    if (runInBackground) {
      SHELL_TASKS.set(taskId, { id: taskId, command, cwd, process: child, startedAt })
      clearTimeout(timer)
      settled = true
      resolvePromise({ backgroundTaskId: taskId, command, cwd, startedAt })
      return
    }
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({
        command,
        cwd,
        exitCode: code,
        signal,
        stdout: redactSensitiveText(stdout),
        stderr: redactSensitiveText(stderr)
      })
    })
  })
}

async function searchWebForGoKnowledge(input: JsonObject): Promise<unknown> {
  const query = stringInput(input, 'query', '围棋 复盘 教学')
  const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(12_000)
  })
  const html = await response.text()
  const titles = [...html.matchAll(/class="result__a"[^>]*>(.*?)<\/a>/g)]
    .slice(0, 5)
    .map((match) => match[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim())
    .filter(Boolean)
  return { query, titles }
}

function createTeacherAgentTools(state: TeacherAgentSessionState): TeacherAgentToolDefinition[] {
  return [
    {
      apiName: 'library_findGames',
      canonicalName: 'library.findGames',
      label: '筛选棋谱',
      description: '按棋手名、最近 N 盘或当前上下文查找本地棋谱列表。',
      parameters: schema({
        studentName: { type: 'string' },
        count: { type: 'number' }
      }),
      execute: async (input) => {
        const count = numberInput(input, 'count', inferCount(state.request.prompt), 1, 20)
        const studentName = stringInput(input, 'studentName', state.studentName)
        const games = findGamesForStudent(studentName, count)
        return { studentName, count, games: summarizeGames(games) }
      }
    },
    {
      apiName: 'sgf_readGameRecord',
      canonicalName: 'sgf.readGameRecord',
      label: '读取棋谱',
      description: '读取 SGF 主线、棋局信息和最近手顺。',
      parameters: schema({
        gameId: { type: 'string' },
        maxMoves: { type: 'number' }
      }),
      execute: async (input) => {
        const record = await ensureSessionRecord(state, stringInput(input, 'gameId'))
        if (!record) throw new Error('没有可读取的棋谱。')
        const maxMoves = numberInput(input, 'maxMoves', 80, 1, record.moves.length)
        return {
          game: summarizeGames([record.game])[0],
          boardSize: record.boardSize,
          komi: record.komi,
          handicap: record.handicap,
          totalMoves: record.moves.length,
          moves: record.moves.slice(0, maxMoves)
        }
      }
    },
    {
      apiName: 'katago_analyzePosition',
      canonicalName: 'katago.analyzePosition',
      label: 'KataGo 当前局面',
      description: '分析单个局面，返回胜率、目差、候选点、搜索数、PV 和实战手损失。',
      parameters: schema({
        gameId: { type: 'string' },
        moveNumber: { type: 'number' },
        maxVisits: { type: 'number' }
      }),
      execute: async (input) => {
        const gameId = stringInput(input, 'gameId', state.request.gameId)
        if (!gameId) throw new Error('katago.analyzePosition 需要 gameId。')
        const record = await ensureSessionRecord(state, gameId)
        const moveNumber = numberInput(input, 'moveNumber', state.request.moveNumber ?? record?.moves.length ?? 0, 0, record?.moves.length ?? 400)
        const prefetched = state.request.prefetchedAnalysis
        const analysis = prefetched?.gameId === gameId && prefetched.moveNumber === moveNumber
          ? prefetched
          : await analyzePosition(gameId, moveNumber, numberInput(input, 'maxVisits', 520, 40, 3000))
        state.lastAnalysis = analysis
        state.teachingPacing = buildTeachingPacingAdvice(analysis)
        return compactAnalysis(analysis)
      }
    },
    {
      apiName: 'katago_analyzeGameBatch',
      canonicalName: 'katago.analyzeGameBatch',
      label: '批量 KataGo',
      description: '分析一盘或多盘棋，提取按胜率损失排序的问题手。',
      parameters: schema({
        studentName: { type: 'string' },
        count: { type: 'number' },
        gameId: { type: 'string' },
        maxVisits: { type: 'number' },
        minWinrateDrop: { type: 'number' }
      }),
      execute: async (input) => {
        const gameId = stringInput(input, 'gameId')
        const count = gameId ? 1 : numberInput(input, 'count', inferCount(state.request.prompt), 1, 20)
        const studentName = stringInput(input, 'studentName', state.studentName)
        const games = gameId
          ? getGames().filter((game) => game.id === gameId)
          : findGamesForStudent(studentName, count)
        const issues: BatchIssue[] = []
        for (const game of games) {
          const result = await runReview({
            gameId: game.id,
            playerName: studentName,
            maxVisits: numberInput(input, 'maxVisits', 420, 40, 2000),
            minWinrateDrop: numberInput(input, 'minWinrateDrop', 6, 1, 40),
            useLlm: false
          })
          issues.push(...extractIssues(result.artifact, game))
        }
        return {
          studentName,
          games: summarizeGames(games),
          issues: issues.filter((issue) => issue.loss > 0).sort((a, b) => b.loss - a.loss).slice(0, 30)
        }
      }
    },
    {
      apiName: 'katago_analyzeMoveRange',
      canonicalName: 'katago.analyzeMoveRange',
      label: 'KataGo 区间分析',
      description: '分析指定手数区间内每一手的胜率变化、胜率损失和判断，返回按损失排序的关键手。注意：renderer 通常已随消息附带了区间关键手的截图和概要数据，如需更详细的逐手分析再调用此工具。',
      parameters: schema({
        startMove: { type: 'number', description: '起始手数' },
        endMove: { type: 'number', description: '结束手数' }
      }),
      execute: async (input) => {
        const gameId = state.request.gameId
        if (!gameId) throw new Error('katago.analyzeMoveRange 需要 gameId。')
        const fallback = state.request.moveRange ?? parseMoveRangeFromPrompt(state.request.prompt ?? '')
        const startMove = Math.trunc(numberInput(input, 'startMove', fallback?.start ?? 0))
        const endMove = Math.trunc(numberInput(input, 'endMove', fallback?.end ?? 0))
        if (startMove < 1 || endMove <= startMove) {
          throw new Error('katago.analyzeMoveRange 需要明确的 startMove/endMove 或 request.moveRange。')
        }
        const analyses = await analyzeMoveRange(gameId, startMove, endMove, 200)
        const summaries = analyses
          .map((a) => ({
            moveNumber: a.moveNumber,
            playedMove: a.playedMove?.move,
            winrateLoss: a.playedMove?.winrateLoss ?? 0,
            scoreLoss: a.playedMove?.scoreLoss ?? 0,
            judgement: a.judgement,
            bestMove: a.before.topMoves[0]?.move,
            bestWinrate: a.before.topMoves[0]?.winrate
          }))
          .sort((a, b) => b.winrateLoss - a.winrateLoss)
        return {
          startMove,
          endMove,
          totalMoves: endMove - startMove + 1,
          analyses: summaries,
          topLossMoves: summaries.filter((s) => s.winrateLoss > 2).slice(0, 8)
        }
      }
    },
    {
      apiName: 'board_captureTeachingImage',
      canonicalName: 'board.captureTeachingImage',
      label: '棋盘截图',
      description: '确认当前棋盘截图是否已经作为图片输入提供给模型。',
      parameters: schema({}),
      execute: async () => {
        const single = Boolean(state.request.boardImageDataUrl)
        const multi = (state.request.boardImageDataUrls?.length ?? 0) > 0
        return {
          available: single || multi,
          imageAttachedToConversation: single || multi,
          imageCount: (state.request.boardImageDataUrls?.length ?? 0) + (single ? 1 : 0),
          note: state.request.boardImageDataUrls?.length
            ? `${state.request.boardImageDataUrls.length} 张区间棋盘图片已在用户消息中随本轮对话发送。`
            : state.request.boardImageDataUrl
              ? '当前棋盘图片已在用户消息中随本轮对话发送。'
              : '本轮没有棋盘图片。'
        }
      }
    },
    {
      apiName: 'knowledge_searchLocal',
      canonicalName: 'knowledge.searchLocal',
      label: '本地知识库',
      description: '检索本地教学卡、定式、死活、手筋和训练题。',
      parameters: schema({
        text: { type: 'string' },
        moveNumber: { type: 'number' },
        playedMove: { type: 'string' },
        candidateMoves: { type: 'array', items: { type: 'string' } },
        principalVariation: { type: 'array', items: { type: 'string' } },
        maxResults: { type: 'number' }
      }),
      execute: async (input) => knowledgeBundleForState(state, input)
    },
    {
      apiName: 'studentProfile_read',
      canonicalName: 'studentProfile.read',
      label: '读取棋手画像',
      description: '读取棋手长期画像、常见问题和训练重点。',
      parameters: schema({
        studentName: { type: 'string' }
      }),
      execute: async (input) => {
        const profile = getStudentProfile(stringInput(input, 'studentName', state.studentName))
        state.profile = profile
        return profile
      }
    },
    {
      apiName: 'studentProfile_write',
      canonicalName: 'studentProfile.write',
      label: '更新棋手画像',
      description: '把本次分析得到的弱点、问题模式和训练重点写入棋手画像。',
      parameters: schema({
        studentName: { type: 'string' },
        reviewedGames: { type: 'number' },
        mistakeTags: { type: 'array', items: { type: 'string' } },
        recentPatterns: { type: 'array', items: { type: 'string' } },
        trainingFocus: { type: 'array', items: { type: 'string' } }
      }),
      execute: async (input) => {
        const profile = updateStudentProfile(stringInput(input, 'studentName', state.studentName), {
          reviewedGames: numberInput(input, 'reviewedGames', 0, 0, 100),
          mistakeTags: arrayInput(input, 'mistakeTags'),
          recentPatterns: arrayInput(input, 'recentPatterns'),
          trainingFocus: arrayInput(input, 'trainingFocus'),
          gameId: state.request.gameId,
          typicalMoves: state.lastAnalysis?.playedMove
            ? [{
                gameId: state.lastAnalysis.gameId,
                moveNumber: state.lastAnalysis.moveNumber,
                label: `${state.lastAnalysis.playedMove.move} -> ${state.lastAnalysis.before.topMoves[0]?.move ?? '未知'}`,
                lossWinrate: state.lastAnalysis.playedMove.winrateLoss,
                lossScore: state.lastAnalysis.playedMove.scoreLoss
              }]
            : []
        })
        state.profile = profile
        return profile
      }
    },
    {
      apiName: 'system_detectEnvironment',
      canonicalName: 'system.detectEnvironment',
      label: '探测环境',
      description: '探测 KataGo、模型、配置和本机兼容代理。',
      parameters: schema({}),
      execute: async () => detectSystemProfile()
    },
    {
      apiName: 'settings_writeAppConfig',
      canonicalName: 'settings.writeAppConfig',
      label: '写入配置',
      description: '应用自动探测到的 KataGo 和 LLM 配置。',
      parameters: schema({}),
      execute: async () => replaceSettings(await applyDetectedDefaults(getSettings()))
    },
    {
      apiName: 'katago_verifyAnalysis',
      canonicalName: 'katago.verifyAnalysis',
      label: '验证 KataGo',
      description: '用当前棋谱做一次低访问量分析，验证 KataGo 可运行。',
      parameters: schema({
        gameId: { type: 'string' },
        moveNumber: { type: 'number' }
      }),
      execute: async (input) => {
        const gameId = stringInput(input, 'gameId', state.request.gameId)
        if (!gameId) throw new Error('katago.verifyAnalysis 需要 gameId。')
        const record = await ensureSessionRecord(state, gameId)
        const analysis = await analyzePosition(gameId, numberInput(input, 'moveNumber', state.request.moveNumber ?? record?.moves.length ?? 0), 80)
        return compactAnalysis(analysis)
      }
    },
    {
      apiName: 'web_searchGoKnowledge',
      canonicalName: 'web.searchGoKnowledge',
      label: '联网搜索',
      description: '按泛化围棋主题搜索外部资料，不发送隐私、棋谱原文或截图。',
      parameters: schema({
        query: { type: 'string' }
      }, ['query']),
      execute: async (input) => searchWebForGoKnowledge(input)
    },
    {
      apiName: 'filesystem_read',
      canonicalName: 'filesystem.read',
      label: '读取文件',
      description: '读取本机文件内容，输出会自动截断并脱敏。',
      parameters: schema({
        path: { type: 'string' },
        maxBytes: { type: 'number' }
      }, ['path']),
      execute: async (input) => {
        const filePath = resolve(stringInput(input, 'path'))
        if (!existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`)
        const maxBytes = numberInput(input, 'maxBytes', 16_000, 1, 80_000)
        return {
          path: filePath,
          content: redactSensitiveText(readFileSync(filePath, 'utf8').slice(0, maxBytes))
        }
      }
    },
    {
      apiName: 'shell_exec',
      canonicalName: 'shell.exec',
      label: 'Shell',
      description: '在本机 shell 执行命令，支持 cwd、超时和后台任务；输出会截断并脱敏。',
      parameters: schema({
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeoutMs: { type: 'number' },
        description: { type: 'string' },
        runInBackground: { type: 'boolean' }
      }, ['command']),
      execute: async (input) => runShell(input)
    },
    {
      apiName: 'shell_kill',
      canonicalName: 'shell.kill',
      label: '停止 Shell',
      description: '停止 shell.exec 启动的后台任务。',
      parameters: schema({
        backgroundTaskId: { type: 'string' }
      }, ['backgroundTaskId']),
      execute: async (input) => {
        const id = stringInput(input, 'backgroundTaskId')
        const task = SHELL_TASKS.get(id)
        if (!task) return { stopped: false, reason: 'background task not found' }
        task.process.kill('SIGTERM')
        SHELL_TASKS.delete(id)
        return { stopped: true, backgroundTaskId: id, command: task.command, cwd: task.cwd }
      }
    },
    {
      apiName: 'report_saveAnalysis',
      canonicalName: 'report.saveAnalysis',
      label: '保存报告',
      description: '保存老师生成的讲解或报告。',
      parameters: schema({
        title: { type: 'string' },
        markdown: { type: 'string' }
      }),
      execute: async (input) => {
        const title = stringInput(input, 'title', `${state.studentName} 老师讲解`)
        const markdown = stringInput(input, 'markdown', state.finalMarkdown)
        return { reportPath: saveReport(state.id, title, markdown, { savedBy: 'agent-tool' }) }
      }
    }
  ]
}

function toolLogDetailFromResult(result: unknown): string {
  const text = compactToolResult(result, 700)
  return text.replace(/\s+/g, ' ').slice(0, 700)
}

async function executeAgentToolCall(
  call: ChatToolCall,
  tools: Map<string, TeacherAgentToolDefinition>,
  state: TeacherAgentSessionState
): Promise<string> {
  const tool = tools.get(call.function.name)
  if (!tool) {
    return compactToolResult({ ok: false, error: `Unknown tool: ${call.function.name}` })
  }
  const log = startTool(state.logs, tool.canonicalName, tool.label, `调用 ${tool.canonicalName}`)
  emitToolState(state.context, state.logs, `正在执行 ${tool.canonicalName}`)
  try {
    const result = await tool.execute(parseToolArguments(call), state)
    finishTool(log, 'done', toolLogDetailFromResult(result))
    emitToolState(state.context, state.logs, `${tool.canonicalName} 已完成`)
    return compactToolResult({ ok: true, tool: tool.canonicalName, result })
  } catch (error) {
    const detail = `工具失败: ${String(error)}`
    finishTool(log, 'error', detail)
    emitToolState(state.context, state.logs, detail)
    return compactToolResult({ ok: false, tool: tool.canonicalName, error: String(error) })
  }
}

async function runTeacherAgentSession(
  request: TeacherRunRequest,
  logs: TeacherToolLog[],
  id: string,
  intent: TeacherIntent,
  context?: TeacherRunContext
): Promise<TeacherRunResult> {
  const indexedGame = request.gameId ? getGames().find((item) => item.id === request.gameId) : undefined
  const boundProfile = request.gameId ? readStudentForGame(request.gameId) : null
  const studentName = boundProfile?.displayName ?? detectStudentName(request, indexedGame)
  const profile = boundProfile ?? getStudentProfile(studentName)
  const state: TeacherAgentSessionState = {
    id,
    request,
    intent,
    logs,
    context,
    studentName,
    profile,
    knowledge: [],
    knowledgeMatches: [],
    recommendedProblems: [],
    finalMarkdown: ''
  }
  if (request.prefetchedAnalysis) {
    state.lastAnalysis = request.prefetchedAnalysis
    state.teachingPacing = buildTeachingPacingAdvice(request.prefetchedAnalysis)
  }

  const settings = providerSettingsFromApp()
  const toolDefinitions = createTeacherAgentTools(state)
  const toolMap = new Map(toolDefinitions.map((tool) => [tool.apiName, tool]))
  const tools = toolDefinitions.map(chatTool)
  const messages: ChatMessage[] = [
    { role: 'system', content: agentSystemPrompt(profile.userLevel) },
    initialAgentUserMessage(state)
  ]

  emitProgress(context, { stage: 'assistant-start', message: 'GoMentor agent 开始推理。', toolLogs: cloneToolLogs(logs) })
  let finalText = ''
  let emittedText = ''
  const maxTurns = 10
  for (let turn = 0; turn < maxTurns; turn += 1) {
    let streamedThisTurn = ''
    const result = await streamOpenAICompatibleToolTurn(settings, messages, tools, 4096, (delta) => {
      streamedThisTurn += delta
      emittedText += delta
      emitAssistantDelta(context, delta)
    })
    if (result.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: result.text,
        tool_calls: result.toolCalls
      })
      for (const call of result.toolCalls) {
        const toolResult = await executeAgentToolCall(call, toolMap, state)
        messages.push({
          role: 'tool',
          name: call.function.name,
          tool_call_id: call.id,
          content: toolResult
        })
      }
      continue
    }
    if (result.text.trim()) {
      finalText = result.text.trim()
      if (!streamedThisTurn && !emittedText.endsWith(finalText)) {
        emitAssistantDelta(context, finalText)
      }
      break
    }
    throw new Error('LLM 没有返回可展示文本，也没有返回工具调用。')
  }

  if (!finalText) {
    throw new Error(`Agent 达到最大工具轮数 ${maxTurns}，仍未生成最终回答。`)
  }
  state.finalMarkdown = finalText
  const taskType = taskTypeForIntent(intent)
  const structured = structuredFromTeacherText(finalText, taskType, state.knowledge, state.knowledgeMatches, state.recommendedProblems)
  const title = intent === 'current-move'
    ? `第 ${request.moveNumber ?? state.lastAnalysis?.moveNumber ?? 0} 手分析`
    : intent === 'move-range'
      ? `第 ${request.moveRange?.start ?? '?'}-${request.moveRange?.end ?? '?'} 手区间分析`
    : intent === 'game-review'
      ? '整盘复盘'
      : intent === 'batch-review'
        ? `${studentName} 最近对局分析`
        : intent === 'training-plan'
          ? `${studentName} 训练计划`
          : `${studentName} 对话`
  const reportPath = saveReport(id, title, finalText, {
    agent: true,
    intent,
    analysis: state.lastAnalysis,
    knowledge: state.knowledge,
    knowledgeMatches: state.knowledgeMatches,
    recommendedProblems: state.recommendedProblems,
    teachingPacing: state.teachingPacing,
    studentProfile: state.profile,
    structured
  })
  return {
    id,
    mode: intent === 'current-move' ? 'current-move' : intent === 'move-range' ? 'move-range' : 'freeform',
    title,
    markdown: finalText,
    toolLogs: logs,
    analysis: state.lastAnalysis,
    knowledge: state.knowledge,
    knowledgeMatches: state.knowledgeMatches,
    recommendedProblems: state.recommendedProblems,
    teachingPacing: state.teachingPacing,
    studentProfile: state.profile,
    structured,
    structuredResult: structured,
    reportPath
  }
}

export async function runTeacherTask(request: TeacherRunRequest, onProgress?: TeacherProgressEmitter): Promise<TeacherRunResult> {
  const id = request.runId || randomUUID()
  const normalizedRequest: TeacherRunRequest = {
    ...request,
    moveRange: request.moveRange ?? parseMoveRangeFromPrompt(request.prompt ?? '') ?? undefined
  }
  if (normalizedRequest.mode === 'move-range' && !normalizedRequest.gameId) {
    throw new Error('move-range 任务需要 gameId。')
  }
  const logs: TeacherToolLog[] = []
  const intentClassification = classifyTeacherIntent(normalizedRequest)
  const intent = intentClassification.intent
  const context: TeacherRunContext = {
    runId: id,
    emit: onProgress
  }

  emitProgress(context, {
      stage: 'queued',
      message: intent === 'current-move'
        ? '收到当前手分析任务。'
      : intent === 'move-range'
        ? '收到区间分析任务。'
      : intent === 'game-review'
        ? '收到整盘复盘任务。'
        : intent === 'batch-review'
          ? '收到最近对局分析任务。'
          : intent === 'training-plan'
            ? '收到训练计划任务。'
            : '收到开放式任务。',
      toolLogs: [{
        id: randomUUID(),
        name: 'teacher.classifyIntent',
        label: '任务识别',
        detail: `${intentClassification.intent} · ${intentClassification.confidence} · ${intentClassification.rationale}`,
        status: 'done',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString()
      }]
  })

  try {
    const result = await runTeacherAgentSession(normalizedRequest, logs, id, intent, context)
    emitProgress(context, {
      stage: 'done',
      markdown: result.markdown,
      toolLogs: cloneToolLogs(logs),
      result
    })
    return result
  } catch (error) {
    emitProgress(context, {
      stage: 'error',
      error: String(error),
      toolLogs: cloneToolLogs(logs)
    })
    throw error
  }
}
