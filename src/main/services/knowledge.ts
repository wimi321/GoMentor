import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoachUserLevel, GameMove, KnowledgePacket } from '@main/lib/types'

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

export interface KnowledgeQuery {
  moveNumber: number
  totalMoves: number
  boardSize: number
  recentMoves: GameMove[]
  userLevel: CoachUserLevel
  lossScore?: number
  judgement?: string
  contextTags?: string[]
  maxResults?: number
}

let cachedDataRoot = ''
let cachedEntries: KnowledgeEntry[] | null = null

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
  const entries = loadEntries()
  const phase = detectGamePhase(query.moveNumber, query.totalMoves)
  const region = detectBoardRegion(query.recentMoves, query.boardSize)
  const scored: Array<{ entry: KnowledgeEntry; score: number }> = []

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

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, query.maxResults ?? 5).map(({ entry, score }) => ({
    id: entry.id,
    title: extractTitle(entry.content!) || entry.id,
    category: entry.category,
    phase: entry.phase,
    tags: entry.tags,
    summary: plainSummary(entry.content!),
    selectedBody: selectedBody(entry.content!, 900),
    score
  }))
}
