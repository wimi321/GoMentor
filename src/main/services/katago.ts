import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { findGame, getSettings } from '@main/lib/store'
import type { GameMove, KataGoAnalysisGroup, KataGoCandidate, KataGoMoveAnalysis } from '@main/lib/types'
import { readGameRecord } from './sgf'
import { resolveKataGoRuntime } from './katagoRuntime'
import { ensureFoxGameDownloaded } from './fox'

interface KataGoResponse {
  id?: string
  error?: string
  isDuringSearch?: boolean
  rootInfo?: {
    winrate?: number
    scoreLead?: number
    scoreMean?: number
  }
  moveInfos?: Array<{
    move?: string
    winrate?: number
    scoreLead?: number
    scoreMean?: number
    visits?: number
    order?: number
    prior?: number
    pv?: string[]
  }>
}

interface AnalysisQuery {
  id: string
  moves: Array<[string, string]>
  boardSize: number
  komi: number
  maxVisits: number
  reportDuringSearchEvery?: number
  overrideSettings?: Record<string, number | boolean | string>
  allowMoves?: Array<{
    player: GameMove['color']
    moves: string[]
    untilDepth: number
  }>
}

interface QuickProgress {
  evaluation: KataGoMoveAnalysis
  analyzedPositions: number
  totalPositions: number
}

interface QueryBatchOptions {
  runId?: string
  group?: KataGoAnalysisGroup
  replaceGroup?: boolean
}

interface ActiveKataGoProcess {
  child: ChildProcessWithoutNullStreams
  group?: KataGoAnalysisGroup
  cancelled: boolean
}

const QUICK_ANALYSIS_FAST_VISITS = 25
const QUICK_ANALYSIS_REFINE_VISITS = 120
const QUICK_ANALYSIS_REFINE_TOP_N = 18
const QUICK_ANALYSIS_REFINE_MIN_LOSS = 4
const QUICK_ANALYSIS_WIDE_ROOT_NOISE = 0.04
const activeKataGoProcesses = new Map<string, ActiveKataGoProcess>()

export function cancelKataGoAnalysis(filter: { runId?: string; group?: KataGoAnalysisGroup }): { cancelled: number } {
  let cancelled = 0
  for (const [id, entry] of activeKataGoProcesses.entries()) {
    const matchesRun = filter.runId ? id === filter.runId : true
    const matchesGroup = filter.group ? entry.group === filter.group : true
    if (!matchesRun || !matchesGroup) {
      continue
    }
    entry.cancelled = true
    cancelled += 1
    entry.child.kill()
  }
  return { cancelled }
}

function moveHistory(moves: GameMove[]): Array<[string, string]> {
  return moves.filter((move) => !move.pass).map((move) => [move.color, move.gtp])
}

function normalizeKomi(raw: string): number {
  const parsed = Number.parseFloat(raw || '7.5')
  if (!Number.isFinite(parsed)) {
    return 7.5
  }
  return Math.abs(parsed) > 150 && Number.isInteger(parsed) ? parsed / 50 : parsed
}

function root(response: KataGoResponse): { winrate: number; scoreLead: number } {
  if (!response.rootInfo) {
    throw new Error(`KataGo 没有返回 rootInfo${response.error ? `: ${response.error}` : ''}`)
  }
  return {
    winrate: Number(response.rootInfo.winrate ?? 0.5) * 100,
    scoreLead: Number(response.rootInfo.scoreLead ?? response.rootInfo.scoreMean ?? 0)
  }
}

function candidates(response: KataGoResponse): KataGoCandidate[] {
  return (response.moveInfos ?? []).map((move, index) => ({
    move: move.move ?? '',
    winrate: Number(move.winrate ?? 0.5) * 100,
    scoreLead: Number(move.scoreLead ?? move.scoreMean ?? 0),
    visits: Number(move.visits ?? 0),
    order: Number(move.order ?? index),
    prior: Number(move.prior ?? 0) * 100,
    pv: (move.pv ?? []).slice(0, 12)
  }))
}

function mergePlayedCandidateIntoTopMoves(
  topMoves: KataGoCandidate[],
  currentMove?: GameMove,
  forcedCandidate?: KataGoCandidate
): KataGoCandidate[] {
  if (!currentMove || currentMove.pass || !forcedCandidate) {
    return topMoves
  }
  const playedKey = moveKey(currentMove.gtp)
  if (!playedKey || topMoves.some((candidate) => moveKey(candidate.move) === playedKey)) {
    return topMoves
  }
  return [...topMoves, forcedCandidate]
}

function displayCandidates(response: KataGoResponse, currentMove?: GameMove, forcedCandidate?: KataGoCandidate): KataGoCandidate[] {
  return mergePlayedCandidateIntoTopMoves(candidates(response).slice(0, 8), currentMove, forcedCandidate)
}

function judgement(winrateLoss: number, _scoreLoss: number): KataGoMoveAnalysis['judgement'] {
  if (winrateLoss >= 15) {
    return 'blunder'
  }
  if (winrateLoss >= 7) {
    return 'mistake'
  }
  if (winrateLoss >= 2.5) {
    return 'inaccuracy'
  }
  return 'good_move'
}

function moveKey(move: string | undefined): string {
  return (move ?? '').trim().toUpperCase()
}

function playerWinrate(blackWinrate: number, color: GameMove['color']): number {
  return color === 'B' ? blackWinrate : 100 - blackWinrate
}

function playerScoreLead(scoreLead: number, color: GameMove['color']): number {
  return color === 'B' ? scoreLead : -scoreLead
}

function findPlayedCandidate(
  currentMove: GameMove | undefined,
  topMoves: KataGoCandidate[]
): { candidate?: KataGoCandidate; rank?: number } {
  if (!currentMove) {
    return {}
  }
  const index = topMoves.findIndex((candidate) => moveKey(candidate.move) === moveKey(currentMove.gtp))
  return index >= 0 ? { candidate: topMoves[index], rank: index + 1 } : {}
}

function playedMoveValue(
  currentMove: GameMove | undefined,
  topMoves: KataGoCandidate[],
  afterRoot: { winrate: number; scoreLead: number },
  forcedCandidate?: KataGoCandidate
): { winrate: number; scoreLead: number; playerWinrate?: number; playerScoreLead?: number; visits?: number; rank?: number; source: 'candidate' | 'forced' | 'after-root' } {
  const { candidate, rank } = findPlayedCandidate(currentMove, topMoves)
  const actual = candidate ?? forcedCandidate
  const winrate = actual?.winrate ?? afterRoot.winrate
  const scoreLead = actual?.scoreLead ?? afterRoot.scoreLead
  return {
    winrate,
    scoreLead,
    playerWinrate: currentMove ? playerWinrate(winrate, currentMove.color) : undefined,
    playerScoreLead: currentMove ? playerScoreLead(scoreLead, currentMove.color) : undefined,
    visits: actual?.visits,
    rank,
    source: candidate ? 'candidate' : forcedCandidate ? 'forced' : 'after-root'
  }
}

function forcePlayedMoveQuery(
  id: string,
  moves: GameMove[],
  currentMove: GameMove | undefined,
  boardSize: number,
  komi: number,
  maxVisits: number,
  reportDuringSearchEvery?: number,
  overrideSettings?: AnalysisQuery['overrideSettings']
): AnalysisQuery | undefined {
  if (!currentMove || currentMove.pass || !moveKey(currentMove.gtp)) {
    return undefined
  }
  return {
    id,
    moves: moveHistory(moves),
    boardSize,
    komi,
    maxVisits,
    reportDuringSearchEvery,
    overrideSettings,
    allowMoves: [{
      player: currentMove.color,
      moves: [currentMove.gtp],
      untilDepth: 1
    }]
  }
}

function forcedPlayedCandidate(response: KataGoResponse | undefined, currentMove: GameMove | undefined): KataGoCandidate | undefined {
  if (!response || !currentMove) {
    return undefined
  }
  const playedKey = moveKey(currentMove.gtp)
  return candidates(response).find((candidate) => moveKey(candidate.move) === playedKey) ?? candidates(response)[0]
}

function playedLoss(
  currentMove: GameMove | undefined,
  best: KataGoCandidate | undefined,
  actual: { winrate: number; scoreLead: number }
): { winrateLoss: number; scoreLoss: number } {
  if (!currentMove || !best) {
    return { winrateLoss: 0, scoreLoss: 0 }
  }
  return {
    winrateLoss: Math.max(0, playerWinrate(best.winrate, currentMove.color) - playerWinrate(actual.winrate, currentMove.color)),
    scoreLoss: Math.max(0, playerScoreLead(best.scoreLead, currentMove.color) - playerScoreLead(actual.scoreLead, currentMove.color))
  }
}

async function queryKataGoBatch(
  queries: AnalysisQuery[],
  onResponse?: (response: KataGoResponse) => void,
  options: QueryBatchOptions = {}
): Promise<Map<string, KataGoResponse>> {
  if (queries.length === 0) {
    return new Map()
  }
  const settings = getSettings()
  const runtime = resolveKataGoRuntime(settings)
  if (!runtime.ready) {
    throw new Error(`${runtime.status}: ${runtime.notes.join('；')}`)
  }
  if (options.replaceGroup && options.group) {
    cancelKataGoAnalysis({ group: options.group })
  }

  const child = spawn(runtime.katagoBin, [
    'analysis',
    '-config',
    runtime.katagoConfig,
    '-model',
    runtime.katagoModel
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  })

  let stderr = ''
  const processRunId = options.runId || randomUUID()
  const activeEntry: ActiveKataGoProcess = {
    child,
    group: options.group,
    cancelled: false
  }
  activeKataGoProcesses.set(processRunId, activeEntry)

  function cleanup(): void {
    const current = activeKataGoProcesses.get(processRunId)
    if (current === activeEntry) {
      activeKataGoProcesses.delete(processRunId)
    }
  }

  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  return new Promise((resolve, reject) => {
    let settled = false
    let stdout = ''
    const results = new Map<string, KataGoResponse>()
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      child.kill()
      cleanup()
      reject(new Error('KataGo 分析超时'))
    }, Math.max(120_000, queries.length * 2500))

    child.stdout.on('data', (chunk) => {
      if (settled) {
        return
      }
      stdout += String(chunk)
      while (stdout.includes('\n')) {
        const newline = stdout.indexOf('\n')
        const line = stdout.slice(0, newline).trim()
        stdout = stdout.slice(newline + 1)
        if (!line) {
          continue
        }
        try {
          const parsed = JSON.parse(line) as KataGoResponse
          const id = parsed.id ?? ''
          if (id) {
            onResponse?.(parsed)
          }
          if (id && !parsed.isDuringSearch) {
            results.set(id, parsed)
          }
        } catch (error) {
          settled = true
          clearTimeout(timer)
          child.kill()
          cleanup()
          reject(new Error(`无法解析 KataGo 输出: ${String(error)}\n${line.slice(0, 500)}`))
          return
        }
        if (results.size >= queries.length) {
          settled = true
          clearTimeout(timer)
          child.kill()
          cleanup()
          resolve(results)
          return
        }
      }
    })

    child.once('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(error)
    })

    child.once('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      cleanup()
      if (activeEntry.cancelled) {
        reject(new Error('KataGo 分析已取消'))
        return
      }
      if (code !== 0 && code !== null) {
        reject(new Error(stderr.trim() || `KataGo exited with ${code}`))
        return
      }
      reject(new Error(stderr.trim() || `KataGo 没有返回完整分析结果，已收到 ${results.size}/${queries.length} 个局面`))
    })

    for (const query of queries) {
      const payload: Record<string, unknown> = {
        id: query.id,
        moves: query.moves,
        initialStones: [],
        rules: 'Chinese',
        komi: query.komi,
        boardXSize: query.boardSize,
        boardYSize: query.boardSize,
        maxVisits: query.maxVisits
      }
      if (query.reportDuringSearchEvery !== undefined) {
        payload.reportDuringSearchEvery = query.reportDuringSearchEvery
      }
      if (query.overrideSettings) {
        payload.overrideSettings = query.overrideSettings
      }
      if (query.allowMoves) {
        payload.allowMoves = query.allowMoves
      }
      child.stdin.write(`${JSON.stringify(payload)}\n`)
    }
    child.stdin.end()
  })
}

async function queryKataGo(
  moves: Array<[string, string]>,
  boardSize: number,
  komi: number,
  id: string,
  maxVisits: number
): Promise<KataGoResponse> {
  const results = await queryKataGoBatch([{ id, moves, boardSize, komi, maxVisits }])
  const result = results.get(id)
  if (!result) {
    throw new Error(`KataGo 没有返回局面 ${id}`)
  }
  return result
}

export async function analyzePosition(
  gameId: string,
  moveNumber: number,
  maxVisits = 500
): Promise<KataGoMoveAnalysis> {
  const indexedGame = findGame(gameId)
  if (!indexedGame) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }
  const game = await ensureFoxGameDownloaded(indexedGame)
  const record = readGameRecord(game)
  const currentMove = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const beforeMoves = record.moves.slice(0, Math.max(0, moveNumber - 1))
  const afterMoves = record.moves.slice(0, Math.max(0, moveNumber))
  const komi = normalizeKomi(record.komi)

  const afterVisits = Math.max(24, Math.floor(maxVisits * 0.55))
  const beforeId = `${gameId}-before-${moveNumber}`
  const afterId = `${gameId}-after-${moveNumber}`
  const actualId = `${gameId}-actual-${moveNumber}`
  const queries: AnalysisQuery[] = [
    {
      id: beforeId,
      moves: moveHistory(beforeMoves),
      boardSize: record.boardSize,
      komi,
      maxVisits
    },
    {
      id: afterId,
      moves: moveHistory(afterMoves),
      boardSize: record.boardSize,
      komi,
      maxVisits: afterVisits
    }
  ]
  const actualQuery = forcePlayedMoveQuery(actualId, beforeMoves, currentMove, record.boardSize, komi, maxVisits)
  if (actualQuery) {
    queries.push(actualQuery)
  }
  const responses = await queryKataGoBatch(queries)
  const beforeResponse = responses.get(beforeId)
  const afterResponse = responses.get(afterId)
  if (!beforeResponse || !afterResponse) {
    throw new Error(`KataGo 没有返回完整局面分析: before=${Boolean(beforeResponse)} after=${Boolean(afterResponse)}`)
  }
  return buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, beforeResponse, afterResponse, responses.get(actualId))
}

function buildMoveAnalysis(
  gameId: string,
  moveNumber: number,
  boardSize: number,
  currentMove: GameMove | undefined,
  beforeResponse: KataGoResponse,
  afterResponse: KataGoResponse,
  actualResponse?: KataGoResponse
): KataGoMoveAnalysis {
  const beforeRoot = root(beforeResponse)
  const afterRoot = root(afterResponse)
  const searchMoves = candidates(beforeResponse)
  const forcedActual = forcedPlayedCandidate(actualResponse, currentMove)
  const topMoves = displayCandidates(beforeResponse, currentMove, forcedActual)
  const afterTopMoves = candidates(afterResponse).slice(0, 8)
  const best = searchMoves[0] ?? topMoves[0]
  const actual = playedMoveValue(currentMove, searchMoves, afterRoot, forcedActual)
  const { winrateLoss, scoreLoss } = playedLoss(currentMove, best, actual)

  return {
    gameId,
    moveNumber,
    boardSize,
    currentMove,
    before: {
      ...beforeRoot,
      topMoves
    },
    after: {
      ...afterRoot,
      topMoves: afterTopMoves
    },
    playedMove: currentMove
      ? {
          move: currentMove.gtp,
          winrate: actual.winrate,
          scoreLead: actual.scoreLead,
          playerWinrate: actual.playerWinrate,
          playerScoreLead: actual.playerScoreLead,
          visits: actual.visits,
          rank: actual.rank,
          source: actual.source,
          winrateLoss,
          scoreLoss
        }
      : undefined,
    judgement: judgement(winrateLoss, scoreLoss)
  }
}

export async function analyzePositionWithProgress(
  gameId: string,
  moveNumber: number,
  maxVisits = 500,
  onProgress?: (analysis: KataGoMoveAnalysis, isFinal: boolean) => void,
  reportDuringSearchEvery = 0.2
): Promise<KataGoMoveAnalysis> {
  const indexedGame = findGame(gameId)
  if (!indexedGame) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }
  const game = await ensureFoxGameDownloaded(indexedGame)
  const record = readGameRecord(game)
  const currentMove = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const beforeMoves = record.moves.slice(0, Math.max(0, moveNumber - 1))
  const afterMoves = record.moves.slice(0, Math.max(0, moveNumber))
  const komi = normalizeKomi(record.komi)
  const afterVisits = Math.max(24, Math.floor(maxVisits * 0.55))
  const beforeId = `${gameId}-before-${moveNumber}-stream`
  const afterId = `${gameId}-after-${moveNumber}-stream`
  const actualId = `${gameId}-actual-${moveNumber}-stream`
  let latestBefore: KataGoResponse | undefined
  let latestAfter: KataGoResponse | undefined
  let latestActual: KataGoResponse | undefined

  let responses: Map<string, KataGoResponse>
  try {
    const queries: AnalysisQuery[] = [
      {
        id: beforeId,
        moves: moveHistory(beforeMoves),
        boardSize: record.boardSize,
        komi,
        maxVisits,
        reportDuringSearchEvery
      },
      {
        id: afterId,
        moves: moveHistory(afterMoves),
        boardSize: record.boardSize,
        komi,
        maxVisits: afterVisits,
        reportDuringSearchEvery
      }
    ]
    const actualQuery = forcePlayedMoveQuery(actualId, beforeMoves, currentMove, record.boardSize, komi, maxVisits, reportDuringSearchEvery)
    if (actualQuery) {
      queries.push(actualQuery)
    }
    responses = await queryKataGoBatch(queries, (response) => {
      if (response.id === beforeId) {
        latestBefore = response
      }
      if (response.id === afterId) {
        latestAfter = response
      }
      if (response.id === actualId) {
        latestActual = response
      }
      if (latestBefore?.rootInfo && latestAfter?.rootInfo && (!actualQuery || latestActual?.rootInfo)) {
        const partial = buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, latestBefore, latestAfter, latestActual)
        onProgress?.(partial, !latestBefore.isDuringSearch && !latestAfter.isDuringSearch && !latestActual?.isDuringSearch)
      }
    }, {
      runId: `${gameId}-live-${moveNumber}`,
      group: 'live',
      replaceGroup: true
    })
  } catch (error) {
    if (String(error).includes('KataGo 分析超时') && latestBefore?.rootInfo && latestAfter?.rootInfo) {
      const partial = buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, latestBefore, latestAfter, latestActual)
      onProgress?.(partial, true)
      return partial
    }
    throw error
  }

  const beforeResponse = responses.get(beforeId)
  const afterResponse = responses.get(afterId)
  if (!beforeResponse || !afterResponse) {
    throw new Error(`KataGo 没有返回完整局面分析: before=${Boolean(beforeResponse)} after=${Boolean(afterResponse)}`)
  }
  const final = buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, beforeResponse, afterResponse, responses.get(actualId))
  onProgress?.(final, true)
  return final
}

export async function analyzeGameQuick(
  gameId: string,
  maxVisits = QUICK_ANALYSIS_FAST_VISITS,
  onProgress?: (progress: QuickProgress) => void,
  options: {
    refineVisits?: number
    refineTopN?: number
    runId?: string
  } = {}
): Promise<KataGoMoveAnalysis[]> {
  const indexedGame = findGame(gameId)
  if (!indexedGame) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }
  const game = await ensureFoxGameDownloaded(indexedGame)

  const record = readGameRecord(game)
  const normalizedKomi = normalizeKomi(record.komi)
  const moves = record.moves
  const queries: AnalysisQuery[] = []
  const quickVisits = Math.max(QUICK_ANALYSIS_FAST_VISITS, Math.round(maxVisits))
  const quickOverrideSettings = { wideRootNoise: QUICK_ANALYSIS_WIDE_ROOT_NOISE }
  const rootPositionCount = moves.length + 1

  // Build the visible winrate line first. Forced actual-move queries are queued
  // after the root sweep so the graph appears quickly, then issue labels refine.
  for (let moveNumber = 0; moveNumber <= moves.length; moveNumber += 1) {
    queries.push({
      id: `${gameId}-quick-${moveNumber}`,
      moves: moveHistory(moves.slice(0, moveNumber)),
      boardSize: record.boardSize,
      komi: normalizedKomi,
      maxVisits: quickVisits,
      overrideSettings: quickOverrideSettings
    })
  }

  for (let moveNumber = 0; moveNumber < moves.length; moveNumber += 1) {
    const currentMove = moves[moveNumber]
    const actualQuery = forcePlayedMoveQuery(
      `${gameId}-quick-actual-${moveNumber + 1}`,
      moves.slice(0, moveNumber),
      currentMove,
      record.boardSize,
      normalizedKomi,
      quickVisits,
      undefined,
      quickOverrideSettings
    )
    if (actualQuery) {
      queries.push(actualQuery)
    }
  }

  const roots = new Map<number, { winrate: number; scoreLead: number }>()
  const topMovesByPosition = new Map<number, KataGoCandidate[]>()
  const actualCandidatesByMove = new Map<number, KataGoCandidate>()
  const emittedQuality = new Map<number, number>()
  const idPrefix = `${gameId}-quick-`
  const actualIdPrefix = `${gameId}-quick-actual-`

  function buildEvaluation(moveNumber: number): KataGoMoveAnalysis | null {
    const before = roots.get(moveNumber - 1)
    const after = roots.get(moveNumber)
    if (!before || !after || moveNumber < 1 || moveNumber > moves.length) {
      return null
    }
    const beforeTopMoves = topMovesByPosition.get(moveNumber - 1) ?? []
    const afterTopMoves = topMovesByPosition.get(moveNumber) ?? []
    const currentMove = moves[moveNumber - 1]
    const forcedActual = actualCandidatesByMove.get(moveNumber)
    const playedCandidate = findPlayedCandidate(currentMove, beforeTopMoves).candidate
    const displayBeforeMoves = mergePlayedCandidateIntoTopMoves(beforeTopMoves, currentMove, forcedActual)
    const best = beforeTopMoves[0] ?? displayBeforeMoves[0]
    const actual = playedMoveValue(currentMove, beforeTopMoves, after, forcedActual)
    const { winrateLoss, scoreLoss } = playedLoss(currentMove, best, actual)
    return {
      gameId,
      moveNumber,
      boardSize: record.boardSize,
      currentMove,
      before: {
        ...before,
        topMoves: displayBeforeMoves
      },
      after: {
        ...after,
        topMoves: afterTopMoves
      },
      playedMove: {
        move: currentMove.gtp,
        winrate: actual.winrate,
        scoreLead: actual.scoreLead,
        playerWinrate: actual.playerWinrate,
        playerScoreLead: actual.playerScoreLead,
        visits: actual.visits,
        rank: actual.rank,
        source: actual.source,
        winrateLoss,
        scoreLoss
      },
      judgement: judgement(winrateLoss, scoreLoss)
    }
  }

  function evaluationProgressQuality(evaluation: KataGoMoveAnalysis): number {
    if (evaluation.playedMove?.source === 'forced') return 3
    if (evaluation.playedMove?.source === 'candidate') return 2
    if (evaluation.playedMove?.source === 'after-root') return 1
    return 0
  }

  function emitIfReady(moveNumber: number): void {
    if (!onProgress) {
      return
    }
    const evaluation = buildEvaluation(moveNumber)
    if (!evaluation) {
      return
    }
    const quality = evaluationProgressQuality(evaluation)
    const previousQuality = emittedQuality.get(moveNumber) ?? -1
    if (quality <= previousQuality) {
      return
    }
    emittedQuality.set(moveNumber, quality)
    onProgress({
      evaluation,
      analyzedPositions: Math.min(roots.size, rootPositionCount),
      totalPositions: rootPositionCount
    })
  }

  const runId = options.runId || `${gameId}-quick-${Date.now()}`
  const responses = await queryKataGoBatch(queries, (response) => {
    if (response.id?.startsWith(actualIdPrefix)) {
      const moveNumber = Number.parseInt(response.id.slice(actualIdPrefix.length), 10)
      if (Number.isFinite(moveNumber)) {
        const candidate = forcedPlayedCandidate(response, moves[moveNumber - 1])
        if (candidate) {
          actualCandidatesByMove.set(moveNumber, candidate)
        }
        emitIfReady(moveNumber)
      }
      return
    }
    if (!response.id?.startsWith(idPrefix)) {
      return
    }
    const position = Number.parseInt(response.id.slice(idPrefix.length), 10)
    if (!Number.isFinite(position)) {
      return
    }
    try {
      roots.set(position, root(response))
      topMovesByPosition.set(position, candidates(response).slice(0, 8))
      emitIfReady(position)
      emitIfReady(position + 1)
    } catch {
      // Keep the quick graph resilient: one invalid branch point should not block the rest.
    }
  }, {
    runId: `${runId}-root`,
    group: 'quick',
    replaceGroup: true
  })

  for (let moveNumber = 0; moveNumber <= moves.length; moveNumber += 1) {
    const response = responses.get(`${gameId}-quick-${moveNumber}`)
    if (response && !topMovesByPosition.has(moveNumber)) {
      topMovesByPosition.set(moveNumber, candidates(response).slice(0, 8))
    }
    if (response && !roots.has(moveNumber)) {
      try {
        roots.set(moveNumber, root(response))
      } catch {
        // Keep the quick graph resilient: one invalid branch point should not block the rest.
      }
    }
  }

  for (let moveNumber = 1; moveNumber <= moves.length; moveNumber += 1) {
    if (actualCandidatesByMove.has(moveNumber)) {
      continue
    }
    const response = responses.get(`${gameId}-quick-actual-${moveNumber}`)
    const candidate = forcedPlayedCandidate(response, moves[moveNumber - 1])
    if (candidate) {
      actualCandidatesByMove.set(moveNumber, candidate)
    }
  }

  if (roots.size < 2) {
    throw new Error('KataGo 快速分析没有返回有效局面')
  }

  const evaluations: KataGoMoveAnalysis[] = []
  for (let moveNumber = 1; moveNumber <= moves.length; moveNumber += 1) {
    const evaluation = buildEvaluation(moveNumber)
    if (!evaluation) {
      continue
    }
    evaluations.push(evaluation)
  }

  const refineVisits = Math.max(quickVisits, Math.round(options.refineVisits ?? QUICK_ANALYSIS_REFINE_VISITS))
  const refineTopN = Math.max(0, Math.round(options.refineTopN ?? QUICK_ANALYSIS_REFINE_TOP_N))
  const refineMoveNumbers = refineVisits > quickVisits && refineTopN > 0
    ? evaluations
      .filter((item) => (item.playedMove?.winrateLoss ?? 0) >= QUICK_ANALYSIS_REFINE_MIN_LOSS)
      .sort((left, right) =>
        (right.playedMove?.winrateLoss ?? 0) - (left.playedMove?.winrateLoss ?? 0) ||
        left.moveNumber - right.moveNumber
      )
      .slice(0, refineTopN)
      .map((item) => item.moveNumber)
    : []

  if (refineMoveNumbers.length === 0) {
    return evaluations
  }

  const refineQueries: AnalysisQuery[] = []
  for (const moveNumber of refineMoveNumbers) {
    const currentMove = moves[moveNumber - 1]
    const beforeMoves = moves.slice(0, moveNumber - 1)
    const afterMoves = moves.slice(0, moveNumber)
    refineQueries.push({
      id: `${gameId}-quick-refine-before-${moveNumber}`,
      moves: moveHistory(beforeMoves),
      boardSize: record.boardSize,
      komi: normalizedKomi,
      maxVisits: refineVisits,
      overrideSettings: quickOverrideSettings
    })
    refineQueries.push({
      id: `${gameId}-quick-refine-after-${moveNumber}`,
      moves: moveHistory(afterMoves),
      boardSize: record.boardSize,
      komi: normalizedKomi,
      maxVisits: Math.max(quickVisits, Math.floor(refineVisits * 0.6)),
      overrideSettings: quickOverrideSettings
    })
    const actualQuery = forcePlayedMoveQuery(
      `${gameId}-quick-refine-actual-${moveNumber}`,
      beforeMoves,
      currentMove,
      record.boardSize,
      normalizedKomi,
      refineVisits,
      undefined,
      quickOverrideSettings
    )
    if (actualQuery) {
      refineQueries.push(actualQuery)
    }
  }

  const refinedResponses = await queryKataGoBatch(refineQueries, undefined, {
    runId: `${runId}-refine`,
    group: 'quick'
  })
  const byMove = new Map(evaluations.map((item) => [item.moveNumber, item]))
  let refinedCount = 0
  for (const moveNumber of refineMoveNumbers) {
    const beforeResponse = refinedResponses.get(`${gameId}-quick-refine-before-${moveNumber}`)
    const afterResponse = refinedResponses.get(`${gameId}-quick-refine-after-${moveNumber}`)
    if (!beforeResponse || !afterResponse) {
      continue
    }
    const refined = buildMoveAnalysis(
      gameId,
      moveNumber,
      record.boardSize,
      moves[moveNumber - 1],
      beforeResponse,
      afterResponse,
      refinedResponses.get(`${gameId}-quick-refine-actual-${moveNumber}`)
    )
    byMove.set(moveNumber, refined)
    refinedCount += 1
    onProgress?.({
      evaluation: refined,
      analyzedPositions: rootPositionCount + refinedCount,
      totalPositions: rootPositionCount + refineMoveNumbers.length
    })
  }

  return [...byMove.values()].sort((left, right) => left.moveNumber - right.moveNumber)
}
