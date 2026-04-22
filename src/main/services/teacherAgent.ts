import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getGames, getSettings, replaceSettings, reportsDir } from '@main/lib/store'
import type {
  CoachUserLevel,
  GameMove,
  KataGoMoveAnalysis,
  KnowledgePacket,
  LibraryGame,
  ReviewArtifact,
  StudentProfile,
  TeacherRunRequest,
  TeacherRunResult,
  TeacherToolLog
} from '@main/lib/types'
import { analyzePosition } from './katago'
import { searchKnowledge } from './knowledge'
import { readGameRecord } from './sgf'
import { callMultimodalTeacher, callTeacherText } from './llm'
import { getStudentProfile, updateStudentProfile } from './studentProfile'
import { runReview } from './review'
import { applyDetectedDefaults, detectSystemProfile } from './systemProfile'

type TeacherIntent = 'current-move' | 'game-review' | 'batch-review' | 'training-plan' | 'open-ended'

interface TeacherToolDefinition {
  name: string
  purpose: string
  privateInputs: string[]
}

const TOOL_CATALOG: TeacherToolDefinition[] = [
  {
    name: 'library.findGames',
    purpose: '按学生、来源、日期、最近 N 盘筛选本地棋谱。',
    privateInputs: ['学生名', '棋谱元信息']
  },
  {
    name: 'sgf.readGameRecord',
    purpose: '读取 SGF 主线、手数、棋局元信息，用于复盘和任务上下文。',
    privateInputs: ['本地 SGF 内容']
  },
  {
    name: 'katago.analyzePosition',
    purpose: '分析单个局面，返回胜率、目差、候选点、PV 和本手损失。',
    privateInputs: ['棋局 ID', '手数']
  },
  {
    name: 'katago.analyzeGameBatch',
    purpose: '批量分析一盘或多盘棋，提取错手、胜率损失、目差损失和典型问题。',
    privateInputs: ['本地棋谱']
  },
  {
    name: 'system.detectEnvironment',
    purpose: '探测本机 KataGo、KataGo 配置、模型文件、本机 LLM 代理和可用模型。',
    privateInputs: ['本机进程列表', '本机配置文件路径']
  },
  {
    name: 'settings.writeAppConfig',
    purpose: '把探测到的 KataGo 路径、配置、模型和本机代理写入 KataSensei 应用配置。',
    privateInputs: ['KataSensei 本地设置', '本机代理 API key']
  },
  {
    name: 'katago.verifyAnalysis',
    purpose: '用当前棋谱运行一次低访问量 KataGo 分析，验证二进制、配置和模型能真正工作。',
    privateInputs: ['当前棋谱 ID', '手数']
  },
  {
    name: 'board.captureTeachingImage',
    purpose: '生成带坐标、最后一手、推荐点的教学棋盘截图，供多模态模型讲解。',
    privateInputs: ['当前棋盘截图']
  },
  {
    name: 'knowledge.searchLocal',
    purpose: '检索随应用打包的 YiGo 本地围棋知识库，用于教学解释。',
    privateInputs: []
  },
  {
    name: 'web.searchGoKnowledge',
    purpose: '老师判断需要外部围棋资料时联网搜索；查询必须泛化，不能发送学生隐私、棋谱原文或截图。',
    privateInputs: []
  },
  {
    name: 'studentProfile.read/write',
    purpose: '读取和更新长期学生画像、常见错因、训练主题和典型问题手。',
    privateInputs: ['学生名', '学习画像']
  },
  {
    name: 'report.saveAnalysis',
    purpose: '保存当前手讲解、批量复盘报告、训练计划或开放式任务结果。',
    privateInputs: ['报告内容']
  }
]

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

function classifyIntent(request: TeacherRunRequest): TeacherIntent {
  if (request.mode === 'current-move') {
    return 'current-move'
  }
  const prompt = request.prompt
  if (/最近|多盘|批量|常犯|画像|弱点|情况|\d+\s*盘|十盘/.test(prompt)) {
    return 'batch-review'
  }
  if (request.gameId && /整盘|全盘|整局|本局|这盘|全局/.test(prompt)) {
    return 'game-review'
  }
  if (/训练|计划|一周|每日/.test(prompt)) {
    return 'training-plan'
  }
  if (/当前手|这手|这一手|本手|第\s*\d+\s*手/.test(prompt) && request.gameId) {
    return 'current-move'
  }
  return 'open-ended'
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

function tagsFromAnalysis(analysis: KataGoMoveAnalysis, move?: GameMove): string[] {
  const tags = new Set<string>()
  if (analysis.moveNumber <= 40) {
    tags.add('布局')
    tags.add('方向')
    tags.add('大场')
  }
  if ((analysis.playedMove?.scoreLoss ?? 0) >= 3) {
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

function profileTagsFromIssues(issues: BatchIssue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.moveNumber <= 40) {
      return ['布局方向', '大场急所']
    }
    if (issue.loss >= 15) {
      return ['重大错手', '计算遗漏']
    }
    return ['形势判断']
  })
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
  const levelLine: Record<CoachUserLevel, string> = {
    beginner: '学生是入门水平，请少用术语，句子短，先讲方向再讲变化。',
    intermediate: '学生是业余中级，可以使用常见术语，但要把判断步骤讲清楚。',
    advanced: '学生是业余高级，可以直接讨论厚薄、目差、PV 和攻防转换。',
    dan: '学生是高段水平，请简洁、精确，重点讲判断和变化。'
  }
  return [
    '你是 KataSensei 的围棋老师智能体。',
    '你不是固定按钮流程，也不是只会复盘当前手的聊天机器人；你会像 Claude Code 一样先理解任务、规划步骤、选择工具、整合结果。',
    '只要工具目录里存在能力，就可以为了完成学生的学习目标主动使用；不要因为任务不属于预设模板就拒绝或改写成模板。',
    'KataGo 结构化数据永远是事实裁判；棋盘截图只用于视觉理解；知识库只用于教学解释。',
    '不要编造坐标、胜率、目差或不存在的变化。',
    levelLine[level],
    '输出中文 Markdown，先给结论，再讲原因，最后给一个可执行训练动作。'
  ].join('\n')
}

function toolCatalogPayload(): Array<Pick<TeacherToolDefinition, 'name' | 'purpose'>> {
  return TOOL_CATALOG.map(({ name, purpose }) => ({ name, purpose }))
}

function shouldConfigureEnvironment(prompt: string): boolean {
  return /katago|kata go|配置|环境|路径|模型|权重|设置|自动探测|找不到|不可用|修一下|跑起来|安装|configure|config|setup|environment|model|binary/i.test(prompt)
}

function currentMovePayload(
  request: TeacherRunRequest,
  analysis: KataGoMoveAnalysis,
  knowledge: KnowledgePacket[],
  profile: StudentProfile
): string {
  return JSON.stringify({
    task: 'analyze_current_move',
    userPrompt: request.prompt,
    gameId: analysis.gameId,
    moveNumber: analysis.moveNumber,
    katagoFacts: analysis,
    studentProfile: profile,
    knowledgePacket: knowledge
  }, null, 2)
}

async function maybeSearchWeb(prompt: string, logs: TeacherToolLog[]): Promise<string[]> {
  if (!/联网|网上|搜索|查一下|资料来源|\bweb\b|\binternet\b|\bsearch\b/i.test(prompt)) {
    const log = startTool(logs, 'web.searchGoKnowledge', '联网搜索', '当前任务不需要外部资料，跳过联网搜索。')
    finishTool(log, 'skipped')
    return []
  }

  const log = startTool(logs, 'web.searchGoKnowledge', '联网搜索', '用泛化围棋主题检索外部资料，不发送棋谱或学生信息。')
  try {
    const response = await fetch('https://duckduckgo.com/html/?q=%E5%9B%B4%E6%A3%8B%20%E5%8E%9A%E5%8A%BF%20%E6%96%B9%E5%90%91', {
      signal: AbortSignal.timeout(12_000)
    })
    const html = await response.text()
    const titles = [...html.matchAll(/class="result__a"[^>]*>(.*?)<\/a>/g)]
      .slice(0, 3)
      .map((match) => match[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim())
      .filter(Boolean)
    finishTool(log, 'done', titles.length ? `找到 ${titles.length} 条外部资料标题。` : '搜索完成，但没有提取到可用标题。')
    return titles
  } catch (error) {
    finishTool(log, 'error', `联网搜索失败: ${String(error)}`)
    return []
  }
}

function genericKnowledgeForPrompt(prompt: string, profile: StudentProfile): KnowledgePacket[] {
  const themes = themesFromProfile(profile)
  return searchKnowledge({
    moveNumber: /布局|开局|序盘/.test(prompt) ? 30 : /收官|官子|终局/.test(prompt) ? 170 : 90,
    totalMoves: 180,
    boardSize: 19,
    recentMoves: [],
    userLevel: profile.userLevel,
    lossScore: /失误|错|问题|弱点|坏/.test(prompt) ? 5 : 2,
    judgement: /严重|崩|大错|败着/.test(prompt) ? 'blunder' : 'mistake',
    contextTags: [...themes, ...prompt.split(/[，。！？\s,.!?]/).filter((token) => token.length >= 2).slice(0, 8)],
    maxResults: 6
  })
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

async function runCurrentMove(request: TeacherRunRequest, logs: TeacherToolLog[], id: string): Promise<TeacherRunResult> {
  if (!request.gameId) {
    throw new Error('当前手分析需要先选择棋谱。')
  }
  const game = getGames().find((item) => item.id === request.gameId)
  const studentName = detectStudentName(request, game)
  const profile = getStudentProfile(studentName)
  const record = game ? readGameRecord(game) : undefined
  const moveNumber = Math.max(0, Math.min(request.moveNumber ?? record?.moves.length ?? 0, record?.moves.length ?? 0))

  const boardLog = startTool(logs, 'board.captureTeachingImage', '棋盘截图', request.boardImageDataUrl ? '已收到前端生成的教学棋盘 PNG。' : '未收到棋盘截图。')
  finishTool(boardLog, request.boardImageDataUrl ? 'done' : 'error')

  const analysisLog = startTool(logs, 'katago.analyzePosition', 'KataGo 当前局面', `分析第 ${moveNumber} 手前后局面。`)
  const analysis = request.prefetchedAnalysis ?? await analyzePosition(request.gameId, moveNumber)
  finishTool(
    analysisLog,
    'done',
    request.prefetchedAnalysis
      ? `复用前端预分析结果，推荐 ${analysis.before.topMoves[0]?.move ?? '未知'}。`
      : `推荐 ${analysis.before.topMoves[0]?.move ?? '未知'}，实战损失约 ${(analysis.playedMove?.winrateLoss ?? 0).toFixed(1)}%。`
  )

  const knowledgeLog = startTool(logs, 'knowledge.searchLocal', '本地知识库', '按阶段、区域、学生水平和 KataGo 损失检索 YiGo 知识库。')
  const knowledge = searchKnowledge({
    moveNumber,
    totalMoves: record?.moves.length ?? moveNumber,
    boardSize: record?.boardSize ?? analysis.boardSize,
    recentMoves: record?.moves.slice(Math.max(0, moveNumber - 5), moveNumber) ?? [],
    userLevel: profile.userLevel,
    lossScore: analysis.playedMove?.scoreLoss,
    judgement: analysis.judgement,
    contextTags: tagsFromAnalysis(analysis, analysis.currentMove)
  })
  finishTool(knowledgeLog, 'done', `选中 ${knowledge.length} 条知识卡片。`)

  const webSnippets = await maybeSearchWeb(request.prompt, logs)

  const llmLog = startTool(logs, 'llm.multimodalTeacher', '多模态老师', '发送棋盘截图、KataGo JSON 和知识包给多模态模型。')
  let markdown = ''
  if (!request.boardImageDataUrl) {
    markdown = '当前手分析需要棋盘截图。请重新点击“分析当前手”，让前端生成教学棋盘 PNG。'
    finishTool(llmLog, 'error', '缺少棋盘截图，未调用 LLM。')
  } else {
    try {
      markdown = await callMultimodalTeacher(
        getSettings(),
        systemPrompt(profile.userLevel),
        currentMovePayload(request, analysis, knowledge, profile) + (webSnippets.length ? `\n\n外部资料标题:\n${webSnippets.join('\n')}` : ''),
        request.boardImageDataUrl
      )
      finishTool(llmLog, 'done', '老师讲解已生成。')
    } catch (error) {
      markdown = `多模态 LLM 暂时不可用：${String(error)}`
      finishTool(llmLog, 'error', markdown)
    }
  }

  const updatedProfile = updateStudentProfile(studentName, {
    mistakeTags: tagsFromAnalysis(analysis, analysis.currentMove),
    typicalMoves: analysis.playedMove
      ? [{
          gameId: request.gameId,
          moveNumber,
          label: `${analysis.playedMove.move} -> ${analysis.before.topMoves[0]?.move ?? '未知'}`,
          lossWinrate: analysis.playedMove.winrateLoss,
          lossScore: analysis.playedMove.scoreLoss
        }]
      : []
  })

  const profileLog = startTool(logs, 'studentProfile.write', '学生画像', `更新 ${studentName} 的长期画像。`)
  finishTool(profileLog, 'done', `累计复盘 ${updatedProfile.gamesReviewed} 盘，记录 ${updatedProfile.commonMistakes.length} 类问题。`)

  const title = `第 ${moveNumber} 手分析`
  const reportPath = saveReport(id, title, markdown, { analysis, knowledge, studentProfile: updatedProfile })
  return {
    id,
    mode: 'current-move',
    title,
    markdown,
    toolLogs: logs,
    analysis,
    knowledge,
    studentProfile: updatedProfile,
    reportPath
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

async function runBatchReview(request: TeacherRunRequest, logs: TeacherToolLog[], id: string): Promise<TeacherRunResult> {
  const count = inferCount(request.prompt)
  const selectedGame = request.gameId ? getGames().find((item) => item.id === request.gameId) : undefined
  const studentName = detectStudentName(request, selectedGame)
  const profile = getStudentProfile(studentName)
  const findLog = startTool(logs, 'library.findGames', '筛选棋谱', `查找 ${studentName} 最近 ${count} 盘棋。`)
  const games = findGamesForStudent(studentName, count)
  finishTool(findLog, games.length > 0 ? 'done' : 'error', `找到 ${games.length} 盘棋。`)

  const issues: BatchIssue[] = []
  const batchLog = startTool(logs, 'katago.analyzeGameBatch', '批量 KataGo', `顺序分析 ${games.length} 盘棋，提取关键问题手。`)
  for (const game of games) {
    try {
      const result = await runReview({
        gameId: game.id,
        playerName: studentName,
        maxVisits: 360,
        minWinrateDrop: 6,
        useLlm: false
      })
      issues.push(...extractIssues(result.artifact, game))
    } catch (error) {
      issues.push({
        game,
        moveNumber: 0,
        playedMove: '分析失败',
        bestMove: String(error),
        loss: 0,
        scoreLead: 0,
        pv: []
      })
    }
  }
  finishTool(batchLog, 'done', `提取 ${issues.filter((issue) => issue.loss > 0).length} 个关键问题点。`)

  const profileUpdate = updateStudentProfile(studentName, {
    reviewedGames: games.length,
    mistakeTags: profileTagsFromIssues(issues.filter((issue) => issue.loss > 0)),
    typicalMoves: issues
      .filter((issue) => issue.loss > 0)
      .slice(0, 8)
      .map((issue) => ({
        gameId: issue.game.id,
        moveNumber: issue.moveNumber,
        label: `${issue.playedMove} -> ${issue.bestMove}`,
        lossWinrate: issue.loss,
        lossScore: Math.abs(issue.scoreLead)
      }))
  })
  const profileLog = startTool(logs, 'studentProfile.write', '学生画像', '把批量分析结果沉淀为长期画像。')
  finishTool(profileLog, 'done', `画像已更新：${profileUpdate.commonMistakes.slice(0, 3).map((item) => item.tag).join('、') || '暂无稳定标签'}`)

  const knowledgeLog = startTool(logs, 'knowledge.searchLocal', '本地知识库', '根据批量问题检索训练主题知识。')
  const themes = themesFromProfile(profileUpdate)
  const knowledge = searchKnowledge({
    moveNumber: 60,
    totalMoves: 180,
    boardSize: 19,
    recentMoves: [],
    userLevel: profileUpdate.userLevel,
    lossScore: Math.max(...issues.map((issue) => issue.loss), 0) / 2,
    judgement: issues.some((issue) => issue.loss >= 15) ? 'blunder' : 'mistake',
    contextTags: ['布局', '方向', '手筋', '形势判断', ...themes],
    maxResults: 6
  })
  finishTool(knowledgeLog, 'done', `选中 ${knowledge.length} 条训练参考。`)

  const llmLog = startTool(logs, 'llm.teacherAgent', '老师总结', '让老师自己判断输出学生画像、典型错手还是训练计划。')
  let markdown = ''
  try {
    markdown = await callTeacherText(getSettings(), systemPrompt(profileUpdate.userLevel), JSON.stringify({
      task: 'batch_student_review',
      userPrompt: request.prompt,
      studentName,
      games: games.map((game) => ({ id: game.id, title: game.title, black: game.black, white: game.white, result: game.result, date: game.date })),
      issues: issues.filter((issue) => issue.loss > 0).slice(0, 20),
      studentProfile: profileUpdate,
      knowledgePacket: knowledge
    }, null, 2))
    finishTool(llmLog, 'done', '批量分析总结已生成。')
  } catch (error) {
    markdown = [
      `多模态 LLM 暂时不可用：${String(error)}`,
      '',
      `已完成 ${games.length} 盘棋的本地分析，提取 ${issues.filter((issue) => issue.loss > 0).length} 个关键问题点。`,
      `画像主题：${themes.join('、')}`
    ].join('\n')
    finishTool(llmLog, 'error', 'LLM 未完成，保留本地结构化结果。')
  }

  const title = `${studentName} 最近 ${games.length} 盘画像`
  const reportPath = saveReport(id, title, markdown, { games, issues, knowledge, studentProfile: profileUpdate })
  return {
    id,
    mode: 'freeform',
    title,
    markdown,
    toolLogs: logs,
    knowledge,
    studentProfile: profileUpdate,
    reportPath
  }
}

async function runGameReview(request: TeacherRunRequest, logs: TeacherToolLog[], id: string): Promise<TeacherRunResult> {
  if (!request.gameId) {
    throw new Error('整盘分析需要先选择棋谱。')
  }
  const game = getGames().find((item) => item.id === request.gameId)
  if (!game) {
    throw new Error('找不到当前棋谱。')
  }
  const studentName = detectStudentName(request, game)
  const profile = getStudentProfile(studentName)

  const sgfLog = startTool(logs, 'sgf.readGameRecord', '读取整盘棋谱', `读取 ${game.black} vs ${game.white} 的主线。`)
  const record = readGameRecord(game)
  finishTool(sgfLog, 'done', `读取 ${record.moves.length} 手，结果 ${game.result || '未知'}。`)

  const reviewLog = startTool(logs, 'katago.analyzeGameBatch', '整盘 KataGo', '分析当前整盘棋，提取关键问题手和胜率损失。')
  const review = await runReview({
    gameId: game.id,
    playerName: studentName,
    maxVisits: 420,
    minWinrateDrop: 6,
    useLlm: false
  })
  const issues = extractIssues(review.artifact, game).filter((issue) => issue.loss > 0)
  finishTool(reviewLog, 'done', `提取 ${issues.length} 个关键问题手。`)

  const updatedProfile = updateStudentProfile(studentName, {
    reviewedGames: 1,
    mistakeTags: profileTagsFromIssues(issues),
    typicalMoves: issues.slice(0, 8).map((issue) => ({
      gameId: game.id,
      moveNumber: issue.moveNumber,
      label: `${issue.playedMove} -> ${issue.bestMove}`,
      lossWinrate: issue.loss,
      lossScore: Math.abs(issue.scoreLead)
    }))
  })
  const profileLog = startTool(logs, 'studentProfile.write', '学生画像', `把 ${studentName} 的本局问题写入长期画像。`)
  finishTool(profileLog, 'done', `画像累计 ${updatedProfile.gamesReviewed} 盘，问题类型 ${updatedProfile.commonMistakes.length} 类。`)

  const knowledgeLog = startTool(logs, 'knowledge.searchLocal', '本地知识库', '根据整盘关键问题检索教学主题。')
  const knowledge = searchKnowledge({
    moveNumber: issues[0]?.moveNumber ?? Math.min(80, record.moves.length),
    totalMoves: record.moves.length,
    boardSize: record.boardSize,
    recentMoves: [],
    userLevel: updatedProfile.userLevel,
    lossScore: Math.max(...issues.map((issue) => issue.loss), 0) / 2,
    judgement: issues.some((issue) => issue.loss >= 15) ? 'blunder' : 'mistake',
    contextTags: ['整盘复盘', '关键手', '形势判断', ...profileTagsFromIssues(issues)],
    maxResults: 6
  })
  finishTool(knowledgeLog, 'done', `选中 ${knowledge.length} 条知识卡片。`)

  const llmLog = startTool(logs, 'llm.teacherAgent', '老师整盘总结', '让老师结合整盘 KataGo 问题手和知识库生成复盘。')
  let markdown = ''
  try {
    markdown = await callTeacherText(getSettings(), systemPrompt(updatedProfile.userLevel), JSON.stringify({
      task: 'single_game_review',
      userPrompt: request.prompt,
      studentName,
      game: {
        id: game.id,
        black: game.black,
        white: game.white,
        result: game.result,
        date: game.date,
        totalMoves: record.moves.length
      },
      issues: issues.slice(0, 16),
      studentProfile: updatedProfile,
      knowledgePacket: knowledge
    }, null, 2))
    finishTool(llmLog, 'done', '整盘复盘已生成。')
  } catch (error) {
    markdown = [
      `LLM 暂时不可用：${String(error)}`,
      '',
      `已完成 ${game.black} vs ${game.white} 的整盘 KataGo 分析。`,
      `关键问题手：${issues.slice(0, 5).map((issue) => `第${issue.moveNumber}手 ${issue.playedMove}，建议 ${issue.bestMove}`).join('；') || '暂无明显问题手'}`
    ].join('\n')
    finishTool(llmLog, 'error', 'LLM 未完成，保留本地结构化整盘结果。')
  }

  const title = `${game.black} vs ${game.white} 整盘复盘`
  const reportPath = saveReport(id, title, markdown, { game, issues, knowledge, studentProfile: updatedProfile })
  return {
    id,
    mode: 'freeform',
    title,
    markdown,
    toolLogs: logs,
    knowledge,
    studentProfile: updatedProfile,
    reportPath
  }
}

async function runTrainingPlan(request: TeacherRunRequest, logs: TeacherToolLog[], id: string): Promise<TeacherRunResult> {
  const studentName = detectStudentName(request)
  const profile = getStudentProfile(studentName)
  const profileLog = startTool(logs, 'studentProfile.read', '读取学生画像', `读取 ${studentName} 的长期画像。`)
  finishTool(profileLog, 'done', `已有 ${profile.gamesReviewed} 盘复盘记录。`)

  const themes = themesFromProfile(profile)
  const knowledgeLog = startTool(logs, 'knowledge.searchLocal', '本地知识库', '围绕学生薄弱主题检索训练参考。')
  const knowledge = searchKnowledge({
    moveNumber: 80,
    totalMoves: 180,
    boardSize: 19,
    recentMoves: [],
    userLevel: profile.userLevel,
    lossScore: 4,
    judgement: 'mistake',
    contextTags: themes,
    maxResults: 6
  })
  finishTool(knowledgeLog, 'done', `选中 ${knowledge.length} 条知识卡片。`)

  const llmLog = startTool(logs, 'llm.teacherAgent', '训练计划', '根据学生画像和知识库生成训练计划。')
  let markdown = ''
  try {
    markdown = await callTeacherText(getSettings(), systemPrompt(profile.userLevel), JSON.stringify({
      task: 'build_training_plan',
      userPrompt: request.prompt,
      studentProfile: profile,
      suggestedThemes: themes,
      knowledgePacket: knowledge
    }, null, 2))
    finishTool(llmLog, 'done', '训练计划已生成。')
  } catch (error) {
    markdown = [
      `多模态 LLM 暂时不可用：${String(error)}`,
      '',
      '本地建议：',
      ...themes.map((theme, index) => `${index + 1}. ${theme}`)
    ].join('\n')
    finishTool(llmLog, 'error', 'LLM 未完成，保留本地训练主题。')
  }

  const title = `${studentName} 训练计划`
  const reportPath = saveReport(id, title, markdown, { studentProfile: profile, knowledge })
  return {
    id,
    mode: 'freeform',
    title,
    markdown,
    toolLogs: logs,
    knowledge,
    studentProfile: profile,
    reportPath
  }
}

async function runOpenEndedTask(request: TeacherRunRequest, logs: TeacherToolLog[], id: string): Promise<TeacherRunResult> {
  const game = request.gameId ? getGames().find((item) => item.id === request.gameId) : undefined
  const studentName = detectStudentName(request, game)
  let environmentSummary: Record<string, unknown> | null = null

  if (shouldConfigureEnvironment(request.prompt)) {
    const detectLog = startTool(logs, 'system.detectEnvironment', '探测本机环境', '老师正在探测 KataGo、模型、配置和本机 LLM 代理。')
    try {
      const detected = await detectSystemProfile()
      environmentSummary = {
        katagoBin: detected.katagoBin,
        katagoConfig: detected.katagoConfig,
        katagoModel: detected.katagoModel,
        proxyBaseUrl: detected.proxyBaseUrl,
        proxyModels: detected.proxyModels,
        notes: detected.notes
      }
      finishTool(detectLog, 'done', detected.notes.join('；') || '探测完成，但没有发现可自动配置项。')
    } catch (error) {
      finishTool(detectLog, 'error', `环境探测失败: ${String(error)}`)
    }

    const writeLog = startTool(logs, 'settings.writeAppConfig', '写入应用配置', '把探测结果写入 KataSensei 本地配置，供老师后续直接调用。')
    try {
      const nextSettings = await applyDetectedDefaults(getSettings())
      replaceSettings(nextSettings)
      finishTool(writeLog, 'done', [
        nextSettings.katagoBin ? `KataGo: ${nextSettings.katagoBin}` : 'KataGo 未配置',
        nextSettings.katagoConfig ? '配置已设置' : '配置未找到',
        nextSettings.katagoModel ? '模型已设置' : '模型未找到'
      ].join('；'))
    } catch (error) {
      finishTool(writeLog, 'error', `写入配置失败: ${String(error)}`)
    }
  }

  const profileLog = startTool(logs, 'studentProfile.read', '读取学生画像', `读取 ${studentName} 的长期画像，作为开放任务上下文。`)
  const profile = getStudentProfile(studentName)
  finishTool(profileLog, 'done', `已有 ${profile.gamesReviewed} 盘复盘记录。`)

  let recordSummary: Record<string, unknown> | null = null
  if (game) {
    const sgfLog = startTool(logs, 'sgf.readGameRecord', '读取当前棋谱', `读取当前棋谱 ${game.title}，供老师自由判断任务。`)
    try {
      const record = readGameRecord(game)
      const moveNumber = Math.max(0, Math.min(request.moveNumber ?? record.moves.length, record.moves.length))
      recordSummary = {
        game: {
          id: game.id,
          title: game.title,
          black: game.black,
          white: game.white,
          result: game.result,
          date: game.date
        },
        boardSize: record.boardSize,
        komi: record.komi,
        handicap: record.handicap,
        currentMoveNumber: moveNumber,
        totalMoves: record.moves.length,
        recentMoves: record.moves.slice(Math.max(0, moveNumber - 12), moveNumber)
      }
      finishTool(sgfLog, 'done', `读取 ${record.moves.length} 手，当前定位第 ${moveNumber} 手。`)

      if (shouldConfigureEnvironment(request.prompt)) {
        const verifyLog = startTool(logs, 'katago.verifyAnalysis', '验证 KataGo', `用当前棋谱第 ${moveNumber} 手做低访问量验证分析。`)
        try {
          const verification = await analyzePosition(game.id, moveNumber, 80)
          environmentSummary = {
            ...(environmentSummary ?? {}),
            verification: {
              moveNumber,
              bestMove: verification.before.topMoves[0]?.move ?? '',
              winrate: verification.after.winrate,
              scoreLead: verification.after.scoreLead
            }
          }
          finishTool(verifyLog, 'done', `验证成功：推荐 ${verification.before.topMoves[0]?.move ?? '未知'}，当前胜率 ${verification.after.winrate.toFixed(1)}%。`)
        } catch (error) {
          finishTool(verifyLog, 'error', `KataGo 验证失败: ${String(error)}`)
        }
      }
    } catch (error) {
      finishTool(sgfLog, 'error', `棋谱读取失败: ${String(error)}`)
    }
  }

  const knowledgeLog = startTool(logs, 'knowledge.searchLocal', '本地知识库', '开放任务先检索本地知识库，给老师可引用的教学概念。')
  const knowledge = genericKnowledgeForPrompt(request.prompt, profile)
  finishTool(knowledgeLog, 'done', `选中 ${knowledge.length} 条知识卡片。`)

  const webSnippets = await maybeSearchWeb(request.prompt, logs)
  const planningLog = startTool(logs, 'teacher.plan', '任务规划', '开放式任务不套模板，老师根据工具目录和上下文自行决定输出形式。')
  finishTool(planningLog, 'done', '已提供完整工具目录、当前棋局上下文、学生画像和知识库片段。')

  const llmLog = startTool(logs, 'llm.teacherAgent', '开放式老师智能体', '把用户任务、工具目录、上下文和知识库交给老师推理。')
  let markdown = ''
  try {
    markdown = await callTeacherText(getSettings(), systemPrompt(profile.userLevel), JSON.stringify({
      task: 'open_ended_teacher_agent',
      userPrompt: request.prompt,
      instruction: '你可以像 agent 一样自由规划。若当前上下文足够，直接完成任务；若需要额外工具结果，明确说明下一步应调用哪个工具和为什么。',
      availableTools: toolCatalogPayload(),
      studentName,
      studentProfile: profile,
      currentGameContext: recordSummary,
      environment: environmentSummary,
      knowledgePacket: knowledge,
      webSearchTitles: webSnippets
    }, null, 2))
    finishTool(llmLog, 'done', '开放式任务已生成。')
  } catch (error) {
    markdown = [
      `LLM 暂时不可用：${String(error)}`,
      '',
      '老师已准备好这些上下文：',
      `- 学生画像：${profile.gamesReviewed} 盘复盘记录`,
      `- 当前棋谱：${recordSummary ? '已读取' : '未提供'}`,
      `- 知识库：${knowledge.length} 条卡片`,
      '',
      '模型恢复后可继续执行这个开放任务。'
    ].join('\n')
    finishTool(llmLog, 'error', 'LLM 未完成，保留已读取上下文。')
  }

  const title = `${studentName} 开放任务`
  const reportPath = saveReport(id, title, markdown, { studentProfile: profile, currentGameContext: recordSummary, environment: environmentSummary, knowledge, webSnippets, availableTools: toolCatalogPayload() })
  return {
    id,
    mode: 'freeform',
    title,
    markdown,
    toolLogs: logs,
    knowledge,
    studentProfile: profile,
    reportPath
  }
}

export async function runTeacherTask(request: TeacherRunRequest): Promise<TeacherRunResult> {
  const id = randomUUID()
  const logs: TeacherToolLog[] = []
  const intent = classifyIntent(request)

  if (intent === 'current-move') {
    return runCurrentMove(request, logs, id)
  }
  if (intent === 'game-review') {
    return runGameReview(request, logs, id)
  }
  if (intent === 'batch-review') {
    return runBatchReview(request, logs, id)
  }
  if (intent === 'training-plan') {
    return runTrainingPlan(request, logs, id)
  }
  return runOpenEndedTask(request, logs, id)
}
