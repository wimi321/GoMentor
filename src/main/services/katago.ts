import { spawn } from 'node:child_process'
import { getSettings } from '@main/lib/store'
import type { GameMove, KataGoCandidate, KataGoMoveAnalysis } from '@main/lib/types'
import { findGame } from '@main/lib/store'
import { readGameRecord } from './sgf'
import { resolveKataGoRuntime } from './katagoRuntime'

interface KataGoResponse {
  id?: string
  error?: string
  isDuringSearch?: boolean
  rootInfo?: {
    winrate?: number
    scoreLead?: number
  }
  moveInfos?: Array<{
    move?: string
    winrate?: number
    scoreLead?: number
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
}

interface QuickProgress {
  evaluation: KataGoMoveAnalysis
  analyzedPositions: number
  totalPositions: number
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
    scoreLead: Number(response.rootInfo.scoreLead ?? 0)
  }
}

function candidates(response: KataGoResponse): KataGoCandidate[] {
  return (response.moveInfos ?? []).slice(0, 8).map((move, index) => ({
    move: move.move ?? '',
    winrate: Number(move.winrate ?? 0.5) * 100,
    scoreLead: Number(move.scoreLead ?? 0),
    visits: Number(move.visits ?? 0),
    order: Number(move.order ?? index),
    prior: Number(move.prior ?? 0) * 100,
    pv: (move.pv ?? []).slice(0, 12)
  }))
}

function judgement(winrateLoss: number, scoreLoss: number): KataGoMoveAnalysis['judgement'] {
  if (winrateLoss >= 15 || scoreLoss >= 8) {
    return 'blunder'
  }
  if (winrateLoss >= 7 || scoreLoss >= 3.5) {
    return 'mistake'
  }
  if (winrateLoss >= 2.5 || scoreLoss >= 1.2) {
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
  afterRoot: { winrate: number; scoreLead: number }
): { winrate: number; scoreLead: number; playerWinrate?: number; playerScoreLead?: number; visits?: number; rank?: number } {
  const { candidate, rank } = findPlayedCandidate(currentMove, topMoves)
  const winrate = candidate?.winrate ?? afterRoot.winrate
  const scoreLead = candidate?.scoreLead ?? afterRoot.scoreLead
  return {
    winrate,
    scoreLead,
    playerWinrate: currentMove ? playerWinrate(winrate, currentMove.color) : undefined,
    playerScoreLead: currentMove ? playerScoreLead(scoreLead, currentMove.color) : undefined,
    visits: candidate?.visits,
    rank
  }
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
  onResponse?: (response: KataGoResponse) => void
): Promise<Map<string, KataGoResponse>> {
  if (queries.length === 0) {
    return new Map()
  }
  const settings = getSettings()
  const runtime = resolveKataGoRuntime(settings)
  if (!runtime.ready) {
    throw new Error(`${runtime.status}: ${runtime.notes.join('；')}`)
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
          reject(new Error(`无法解析 KataGo 输出: ${String(error)}\n${line.slice(0, 500)}`))
          return
        }
        if (results.size >= queries.length) {
          settled = true
          clearTimeout(timer)
          child.kill()
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
      reject(error)
    })

    child.once('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
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
  const game = findGame(gameId)
  if (!game) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }
  const record = readGameRecord(game)
  const currentMove = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const beforeMoves = record.moves.slice(0, Math.max(0, moveNumber - 1))
  const afterMoves = record.moves.slice(0, Math.max(0, moveNumber))
  const komi = normalizeKomi(record.komi)

  const afterVisits = Math.max(24, Math.floor(maxVisits * 0.55))
  const beforeId = `${gameId}-before-${moveNumber}`
  const afterId = `${gameId}-after-${moveNumber}`
  const responses = await queryKataGoBatch([
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
  ])
  const beforeResponse = responses.get(beforeId)
  const afterResponse = responses.get(afterId)
  if (!beforeResponse || !afterResponse) {
    throw new Error(`KataGo 没有返回完整局面分析: before=${Boolean(beforeResponse)} after=${Boolean(afterResponse)}`)
  }
  return buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, beforeResponse, afterResponse)
}

function buildMoveAnalysis(
  gameId: string,
  moveNumber: number,
  boardSize: number,
  currentMove: GameMove | undefined,
  beforeResponse: KataGoResponse,
  afterResponse: KataGoResponse
): KataGoMoveAnalysis {
  const beforeRoot = root(beforeResponse)
  const afterRoot = root(afterResponse)
  const topMoves = candidates(beforeResponse)
  const afterTopMoves = candidates(afterResponse)
  const best = topMoves[0]
  const actual = playedMoveValue(currentMove, topMoves, afterRoot)
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
  const game = findGame(gameId)
  if (!game) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }
  const record = readGameRecord(game)
  const currentMove = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const beforeMoves = record.moves.slice(0, Math.max(0, moveNumber - 1))
  const afterMoves = record.moves.slice(0, Math.max(0, moveNumber))
  const komi = normalizeKomi(record.komi)
  const afterVisits = Math.max(24, Math.floor(maxVisits * 0.55))
  const beforeId = `${gameId}-before-${moveNumber}-stream`
  const afterId = `${gameId}-after-${moveNumber}-stream`
  let latestBefore: KataGoResponse | undefined
  let latestAfter: KataGoResponse | undefined

  const responses = await queryKataGoBatch([
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
  ], (response) => {
    if (response.id === beforeId) {
      latestBefore = response
    }
    if (response.id === afterId) {
      latestAfter = response
    }
    if (latestBefore?.rootInfo && latestAfter?.rootInfo) {
      const partial = buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, latestBefore, latestAfter)
      onProgress?.(partial, !latestBefore.isDuringSearch && !latestAfter.isDuringSearch)
    }
  })

  const beforeResponse = responses.get(beforeId)
  const afterResponse = responses.get(afterId)
  if (!beforeResponse || !afterResponse) {
    throw new Error(`KataGo 没有返回完整局面分析: before=${Boolean(beforeResponse)} after=${Boolean(afterResponse)}`)
  }
  const final = buildMoveAnalysis(gameId, moveNumber, record.boardSize, currentMove, beforeResponse, afterResponse)
  onProgress?.(final, true)
  return final
}

export async function analyzeGameQuick(
  gameId: string,
  maxVisits = 12,
  onProgress?: (progress: QuickProgress) => void
): Promise<KataGoMoveAnalysis[]> {
  const game = findGame(gameId)
  if (!game) {
    throw new Error(`找不到棋谱: ${gameId}`)
  }

  const record = readGameRecord(game)
  const normalizedKomi = normalizeKomi(record.komi)
  const moves = record.moves
  const queries: AnalysisQuery[] = []

  for (let moveNumber = 0; moveNumber <= moves.length; moveNumber += 1) {
    queries.push({
      id: `${gameId}-quick-${moveNumber}`,
      moves: moveHistory(moves.slice(0, moveNumber)),
      boardSize: record.boardSize,
      komi: normalizedKomi,
      maxVisits
    })
  }

  const roots = new Map<number, { winrate: number; scoreLead: number }>()
  const topMovesByPosition = new Map<number, KataGoCandidate[]>()
  const emitted = new Set<number>()
  const idPrefix = `${gameId}-quick-`

  function buildEvaluation(moveNumber: number): KataGoMoveAnalysis | null {
    const before = roots.get(moveNumber - 1)
    const after = roots.get(moveNumber)
    if (!before || !after || moveNumber < 1 || moveNumber > moves.length) {
      return null
    }
    const beforeTopMoves = topMovesByPosition.get(moveNumber - 1) ?? []
    const afterTopMoves = topMovesByPosition.get(moveNumber) ?? []
    const currentMove = moves[moveNumber - 1]
    const best = beforeTopMoves[0]
    const actual = playedMoveValue(currentMove, beforeTopMoves, after)
    const { winrateLoss, scoreLoss } = playedLoss(currentMove, best, actual)
    return {
      gameId,
      moveNumber,
      boardSize: record.boardSize,
      currentMove,
      before: {
        ...before,
        topMoves: beforeTopMoves
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
        winrateLoss,
        scoreLoss
      },
      judgement: judgement(winrateLoss, scoreLoss)
    }
  }

  function emitIfReady(moveNumber: number): void {
    if (!onProgress || emitted.has(moveNumber)) {
      return
    }
    const evaluation = buildEvaluation(moveNumber)
    if (!evaluation) {
      return
    }
    emitted.add(moveNumber)
    onProgress({
      evaluation,
      analyzedPositions: roots.size,
      totalPositions: queries.length
    })
  }

  const responses = await queryKataGoBatch(queries, (response) => {
    if (!response.id?.startsWith(idPrefix)) {
      return
    }
    const position = Number.parseInt(response.id.slice(idPrefix.length), 10)
    if (!Number.isFinite(position)) {
      return
    }
    try {
      roots.set(position, root(response))
      topMovesByPosition.set(position, candidates(response))
      emitIfReady(position)
      emitIfReady(position + 1)
    } catch {
      // Keep the quick graph resilient: one invalid branch point should not block the rest.
    }
  })

  for (let moveNumber = 0; moveNumber <= moves.length; moveNumber += 1) {
    const response = responses.get(`${gameId}-quick-${moveNumber}`)
    if (response && !topMovesByPosition.has(moveNumber)) {
      topMovesByPosition.set(moveNumber, candidates(response))
    }
    if (response && !roots.has(moveNumber)) {
      try {
        roots.set(moveNumber, root(response))
      } catch {
        // Keep the quick graph resilient: one invalid branch point should not block the rest.
      }
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

  return evaluations
}
