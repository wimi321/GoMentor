import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoachUserLevel, GameMove, KnowledgeMatch, KnowledgePacket } from '@main/lib/types'
import {
  formatPatternForPrompt,
  loadKnowledgePatternCards,
  searchKnowledgePatterns,
  type PatternRegion,
  type PatternSearchMatch
} from './knowledge/patterns'
import { formatKnowledgeMatchForPrompt, searchKnowledgeMatchEngine, type BoardSnapshotStone, type LocalWindow } from './knowledge/matchEngine'
import { recognizedShapesToKnowledgePackets, recognizeShapes } from './knowledge/shapeRecognitionEngine'

interface KnowledgeEntry {
  id: string
  file: string
  category: string
  phase: 'opening' | 'middle' | 'endgame' | 'any'
  levels: CoachUserLevel[]
  tags: string[]
  regions: Array<'corner' | 'side' | 'center' | 'any'>
  content?: string
}

interface P0KnowledgeCard {
  id: string
  title: string
  kind: string
  phase: Array<'opening' | 'middlegame' | 'endgame'>
  errorTypes: string[]
  tags: string[]
  katagoSignals: string[]
  boardSignals: string[]
  summary: string
  coachShort: string
  coachLong: string
  drill: string
}

export interface KnowledgeQuery {
  text?: string
  moveNumber: number
  totalMoves: number
  boardSize: number
  recentMoves: GameMove[]
  userLevel: CoachUserLevel
  studentLevel?: CoachUserLevel
  playerColor?: 'B' | 'W'
  boardSnapshot?: BoardSnapshotStone[]
  localWindows?: LocalWindow[]
  lossScore?: number
  judgement?: string
  contextTags?: string[]
  playedMove?: string
  candidateMoves?: string[]
  principalVariation?: string[]
  maxResults?: number
}

let cachedDataRoot = ''
let cachedEntries: KnowledgeEntry[] | null = null
let cachedP0Cards: P0KnowledgeCard[] | null = null

function dataRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'data')
  }
  return join(process.cwd(), 'data')
}

function loadEntries(): KnowledgeEntry[] {
  const root = dataRoot()
  if (cachedEntries && cachedDataRoot === root) {
    return cachedEntries
  }

  const indexPath = join(root, 'knowledge', 'index.json')
  if (!existsSync(indexPath)) {
    cachedDataRoot = root
    cachedEntries = []
    return cachedEntries
  }

  try {
    const entries = JSON.parse(readFileSync(indexPath, 'utf8')) as KnowledgeEntry[]
    for (const entry of entries) {
      const filePath = join(root, 'knowledge', entry.file)
      if (existsSync(filePath)) {
        entry.content = readFileSync(filePath, 'utf8')
      }
    }
    cachedDataRoot = root
    cachedEntries = entries
    return entries
  } catch {
    cachedDataRoot = root
    cachedEntries = []
    return cachedEntries
  }
}

function loadP0Cards(root: string): P0KnowledgeCard[] {
  if (cachedP0Cards) {
    return cachedP0Cards
  }
  const cardsPath = join(root, 'knowledge', 'p0-cards.json')
  if (!existsSync(cardsPath)) {
    cachedP0Cards = []
    return cachedP0Cards
  }
  try {
    cachedP0Cards = JSON.parse(readFileSync(cardsPath, 'utf8')) as P0KnowledgeCard[]
  } catch {
    cachedP0Cards = []
  }
  return cachedP0Cards
}

export function detectGamePhase(moveNumber: number, totalMoves: number): 'opening' | 'middle' | 'endgame' {
  const ratio = totalMoves > 0 ? moveNumber / totalMoves : 0
  if (moveNumber <= 40 || ratio <= 0.2) {
    return 'opening'
  }
  if (ratio <= 0.72) {
    return 'middle'
  }
  return 'endgame'
}

function p0Phase(phase: ReturnType<typeof detectGamePhase>): 'opening' | 'middlegame' | 'endgame' {
  return phase === 'middle' ? 'middlegame' : phase
}

function patternRegion(region: ReturnType<typeof detectBoardRegion>): PatternRegion {
  return region
}

function detectBoardRegion(recentMoves: GameMove[], boardSize: number): 'corner' | 'side' | 'center' {
  if (recentMoves.length === 0) {
    return 'center'
  }

  let corner = 0
  let side = 0
  let center = 0

  for (const move of recentMoves.slice(-5)) {
    if (move.row === null || move.col === null) {
      continue
    }
    const distX = Math.min(move.col, boardSize - 1 - move.col)
    const distY = Math.min(move.row, boardSize - 1 - move.row)
    const minDist = Math.min(distX, distY)
    if (distX <= 4 && distY <= 4) {
      corner += 1
    } else if (minDist <= 3) {
      side += 1
    } else {
      center += 1
    }
  }

  if (corner >= side && corner >= center) {
    return 'corner'
  }
  if (side >= center) {
    return 'side'
  }
  return 'center'
}

function extractTitle(content: string): string {
  return content.match(/^#\s+(.+)/m)?.[1]?.trim() ?? ''
}

function plainSummary(content: string, maxChars = 180): string {
  const text = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('>'))
    .map((line) => line.replace(/^[-*]\s+/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

function selectedBody(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content
  }
  const cut = content.lastIndexOf('\n', maxChars)
  return `${content.slice(0, cut > maxChars * 0.45 ? cut : maxChars)}\n...`
}

export function searchKnowledge(query: KnowledgeQuery): KnowledgePacket[] {
  const root = dataRoot()
  const entries = loadEntries()
  const phase = detectGamePhase(query.moveNumber, query.totalMoves)
  const region = detectBoardRegion(query.recentMoves, query.boardSize)
  const scored: Array<{ entry: KnowledgeEntry; score: number }> = []
  const p0Scored: Array<{ card: P0KnowledgeCard; score: number }> = []
  const patternScored: PatternSearchMatch[] = searchKnowledgePatterns(loadKnowledgePatternCards(root), {
    userLevel: query.userLevel,
    phase: p0Phase(phase),
    region: patternRegion(region),
    boardSize: query.boardSize,
    moveNumber: query.moveNumber,
    recentMoves: query.recentMoves,
    contextTags: query.contextTags,
    text: query.text,
    playedMove: query.playedMove,
    candidateMoves: query.candidateMoves,
    principalVariation: query.principalVariation,
    lossScore: query.lossScore,
    judgement: query.judgement
  })
  const knowledgeMatches = searchKnowledgeMatches({
    ...query,
    maxResults: 6
  })
  const recognizedShapes = recognizeShapes(query)

  for (const entry of entries) {
    if (!entry.content || !entry.levels.includes(query.userLevel)) {
      continue
    }

    let score = 0
    if (entry.phase === phase) {
      score += 4
    } else if (entry.phase === 'any') {
      score += 1
    }

    if (entry.regions.includes(region)) {
      score += 3
    } else if (entry.regions.includes('any')) {
      score += 1
    }

    if ((query.lossScore ?? 0) >= 3 && ['tesuji', 'life-death', 'ko', 'strategy'].includes(entry.category)) {
      score += 2
    }

    if (query.judgement === 'blunder' && ['life-death', 'tesuji', 'strategy'].includes(entry.category)) {
      score += 2
    }

    for (const tag of query.contextTags ?? []) {
      if (entry.tags.includes(tag)) {
        score += 2
      }
    }

    if (phase === 'opening' && entry.tags.some((tag) => ['布局', '定式', '大场', '方向'].includes(tag))) {
      score += 2
    }
    if (phase === 'middle' && ['strategy', 'tesuji', 'shapes'].includes(entry.category)) {
      score += 1
    }
    if (phase === 'endgame' && (entry.category === 'endgame' || entry.tags.includes('收官'))) {
      score += 3
    }

    if (score > 0) {
      scored.push({ entry, score })
    }
  }

  const contextTags = new Set((query.contextTags ?? []).map((tag) => tag.toLowerCase()))
  const p0WantedPhase = p0Phase(phase)
  for (const card of loadP0Cards(root)) {
    let score = 0
    if (card.phase.includes(p0WantedPhase)) {
      score += 4
    }
    for (const tag of card.tags) {
      if (contextTags.has(tag.toLowerCase())) {
        score += 3
      }
    }
    for (const errorType of card.errorTypes) {
      if ([...contextTags].some((tag) => tag.includes(errorType.toLowerCase()) || errorType.toLowerCase().includes(tag))) {
        score += 3
      }
    }
    if ((query.lossScore ?? 0) >= 3 && ['mistake', 'blunder'].includes(String(query.judgement))) {
      score += card.kind === 'error_type' || card.kind === 'review_method' ? 2 : 1
    }
    if (region !== 'center' && card.boardSignals.some((signal) => signal.includes(region))) {
      score += 1
    }
    if (score > 0) {
      p0Scored.push({ card, score })
    }
  }

  const markdownPackets = scored.map(({ entry, score }) => ({
    id: entry.id,
    title: extractTitle(entry.content!) || entry.id,
    category: entry.category,
    phase: entry.phase,
    tags: entry.tags,
    summary: plainSummary(entry.content!),
    selectedBody: selectedBody(entry.content!, 900),
    score
  }))

  const p0Packets = p0Scored.map(({ card, score }) => ({
    id: card.id,
    title: card.title,
    category: card.kind,
    phase: card.phase.join(','),
    tags: [...new Set([...card.tags, ...card.errorTypes])],
    summary: card.summary,
    selectedBody: [card.coachShort, card.coachLong, `训练: ${card.drill}`].join('\n'),
    score
  }))

  const patternPackets = patternScored.map((match) => ({
    id: match.card.id,
    title: match.card.title,
    category: match.card.category,
    phase: match.card.phase.join(','),
    tags: [...new Set([...match.card.tags, match.card.patternType, match.confidence])],
    summary: match.card.teaching.recognition,
    selectedBody: formatPatternForPrompt(match),
    score: match.score
  }))
  const matchPackets = knowledgeMatches
    .filter((match) => match.confidence !== 'weak')
    .map((match) => ({
      id: match.id,
      title: match.title,
      category: match.matchType,
      phase: phase,
      tags: [...new Set([match.matchType, match.confidence, ...match.teachingPayload.keyVariations.slice(0, 2)])],
      summary: match.teachingPayload.recognition,
      selectedBody: formatKnowledgeMatchForPrompt(match),
      score: match.score + 5
    }))

  const shapePackets = recognizedShapesToKnowledgePackets(recognizedShapes)

  return [...shapePackets, ...markdownPackets, ...p0Packets, ...patternPackets, ...matchPackets]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, query.maxResults ?? 4)
}

export function searchKnowledgeMatches(query: KnowledgeQuery): KnowledgeMatch[] {
  return searchKnowledgeMatchEngine(dataRoot(), query)
}
