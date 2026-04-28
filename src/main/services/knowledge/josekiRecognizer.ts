import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBundledJosekiSgfCards } from './josekiSgfDatabase'

export type JosekiConfidence = 'strong' | 'medium' | 'weak'
export type JosekiCorner = 'SW' | 'SE' | 'NW' | 'NE'

export interface JosekiMoveLike {
  row?: number | null
  col?: number | null
  gtp?: string | null
}

export interface JosekiNextMove {
  relativeMove: string
  gtpMove?: string
  label: string
  condition?: string
}

export interface JosekiPatternCard {
  id: string
  name: string
  family: string
  boardSize?: number
  sourceRefs?: string[]
  sourceQuality?: string
  requiredRelativeStones: string[]
  sequenceSignals: string[]
  variationCount: number
  commonNextMoves: JosekiNextMove[]
  variations: string[]
  recognition: string
  wrongThinking: string
  correctThinking: string
  drillPrompt: string
}

export interface RecognizedJosekiPattern {
  id: string
  name: string
  family: string
  confidence: JosekiConfidence
  score: number
  matchedCorner: JosekiCorner
  matchedRelativeStones: string[]
  evidence: string[]
  sourceRefs: string[]
  sourceQuality: string
  variationCount: number
  commonNextMoves: JosekiNextMove[]
  variations: string[]
  recognition: string
  wrongThinking: string
  correctThinking: string
  drillPrompt: string
}

export interface JosekiRecognitionQuery {
  boardSize: number
  moveNumber: number
  recentMoves?: JosekiMoveLike[]
  candidateMoves?: string[]
  principalVariation?: string[]
  actualMove?: string
  bestMove?: string
  text?: string
  maxResults?: number
}

let cachedRoot = ''
let cachedCards: JosekiPatternCard[] | null = null

function dataRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'data')
  return join(process.cwd(), 'data')
}

function loadJosekiCards(root = dataRoot()): JosekiPatternCard[] {
  if (cachedCards && cachedRoot === root) return cachedCards
  const path = join(root, 'knowledge', 'joseki-pattern-cards.json')
  const curatedCards = (() => {
    if (!existsSync(path)) return [] as JosekiPatternCard[]
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as JosekiPatternCard[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return [] as JosekiPatternCard[]
    }
  })()
  const bundledSgfCards = loadBundledJosekiSgfCards(root)
  const seen = new Set<string>()
  cachedCards = [...curatedCards, ...bundledSgfCards].filter((card) => {
    if (seen.has(card.id)) return false
    seen.add(card.id)
    return true
  })
  cachedRoot = root
  return cachedCards
}

const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function normalizeMove(move: string | undefined | null): string | undefined {
  if (!move) return undefined
  const trimmed = move.trim().toUpperCase()
  if (!trimmed || trimmed === 'PASS') return undefined
  return trimmed
}

function pointFromGtp(move: string | undefined | null, boardSize: number): { x: number; y: number; gtp: string } | undefined {
  const normalized = normalizeMove(move)
  if (!normalized) return undefined
  const match = normalized.match(/^([A-HJ-Z])(\d{1,2})$/)
  if (!match) return undefined
  const x = GTP_COLUMNS.slice(0, boardSize).indexOf(match[1])
  const y = Number(match[2]) - 1
  if (x < 0 || y < 0 || y >= boardSize) return undefined
  return { x, y, gtp: normalized }
}

function pointFromMove(move: JosekiMoveLike, boardSize: number): { x: number; y: number; gtp?: string } | undefined {
  const fromGtp = pointFromGtp(move.gtp, boardSize)
  if (fromGtp) return fromGtp
  if (typeof move.col === 'number' && typeof move.row === 'number') {
    const x = move.col
    const y = boardSize - 1 - move.row
    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) return { x, y }
  }
  return undefined
}

function cornerOf(point: { x: number; y: number }, boardSize: number): JosekiCorner {
  const east = point.x >= boardSize / 2
  const north = point.y >= boardSize / 2
  if (!east && !north) return 'SW'
  if (east && !north) return 'SE'
  if (!east && north) return 'NW'
  return 'NE'
}

function relativePoint(point: { x: number; y: number }, boardSize: number): string {
  const rx = Math.min(point.x + 1, boardSize - point.x)
  const ry = Math.min(point.y + 1, boardSize - point.y)
  return `${rx}-${ry}`
}

function gtpFromRelative(relative: string, corner: JosekiCorner, boardSize: number): string | undefined {
  const match = relative.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!match) return undefined
  const rx = Number(match[1])
  const ry = Number(match[2])
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 1 || ry < 1 || rx > boardSize || ry > boardSize) return undefined
  const x = corner === 'SE' || corner === 'NE' ? boardSize - rx : rx - 1
  const y = corner === 'NW' || corner === 'NE' ? boardSize - ry : ry - 1
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return undefined
  return `${GTP_COLUMNS[x]}${y + 1}`
}

function pointKey(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`
}

function textHit(text: string, signals: string[]): string[] {
  const lower = text.toLowerCase()
  return signals.filter((signal) => signal && lower.includes(signal.toLowerCase()))
}

function confidenceFrom(score: number): JosekiConfidence {
  if (score >= 16) return 'strong'
  if (score >= 11) return 'medium'
  return 'weak'
}

function scoreCard(
  card: JosekiPatternCard,
  query: JosekiRecognitionQuery,
  corner: JosekiCorner,
  relativeSet: Set<string>,
  moveSet: Set<string>,
  signalText: string
): { score: number; evidence: string[]; nextMoves: JosekiNextMove[] } {
  const evidence: string[] = []
  let score = 0
  const requiredHits = card.requiredRelativeStones.filter((stone) => relativeSet.has(stone))
  if (requiredHits.length) {
    score += requiredHits.length * 4
    evidence.push(`relative stones: ${requiredHits.join(', ')}`)
  }
  if (requiredHits.length === card.requiredRelativeStones.length && card.requiredRelativeStones.length > 1) {
    score += 5
    evidence.push('all required local stones found')
  }

  const signals = textHit(signalText, [card.name, card.family, ...card.sequenceSignals])
  if (signals.length) {
    score += Math.min(6, signals.length * 2)
    evidence.push(`text/signal hits: ${signals.slice(0, 3).join(', ')}`)
  }

  const nextMoves = card.commonNextMoves.map((move) => ({
    ...move,
    gtpMove: move.relativeMove.includes('-') ? gtpFromRelative(move.relativeMove, corner, query.boardSize) : undefined
  }))
  const nextHit = nextMoves.find((move) => move.gtpMove && moveSet.has(move.gtpMove))
  if (nextHit) {
    score += 4
    evidence.push(`candidate/PV matches common next move ${nextHit.gtpMove}`)
  }

  if (query.moveNumber <= 80) score += 2
  else if (query.moveNumber <= 120) score += 1
  else score -= 2

  if (card.requiredRelativeStones.length <= 1 && !signals.length && !nextHit) score -= 4
  return { score, evidence, nextMoves }
}

export function recognizeJosekiPatterns(query: JosekiRecognitionQuery): RecognizedJosekiPattern[] {
  if (query.boardSize !== 19) return []
  const cards = loadJosekiCards()
  if (!cards.length) return []

  const recent = (query.recentMoves ?? []).slice(-40)
  const corners: Record<JosekiCorner, Set<string>> = { SW: new Set(), SE: new Set(), NW: new Set(), NE: new Set() }
  const rawCornerMoves: Record<JosekiCorner, string[]> = { SW: [], SE: [], NW: [], NE: [] }
  const seen = new Set<string>()

  for (const move of recent) {
    const point = pointFromMove(move, query.boardSize)
    if (!point) continue
    const key = pointKey(point)
    if (seen.has(key)) continue
    seen.add(key)
    const corner = cornerOf(point, query.boardSize)
    const relative = relativePoint(point, query.boardSize)
    corners[corner].add(relative)
    rawCornerMoves[corner].push(point.gtp ?? `${relative}@${corner}`)
  }

  const moveSet = new Set(
    [query.actualMove, query.bestMove, ...(query.candidateMoves ?? []), ...(query.principalVariation ?? [])]
      .map((move) => normalizeMove(move))
      .filter(Boolean) as string[]
  )
  const signalText = [query.text, query.candidateMoves?.join(' '), query.principalVariation?.join(' ')].filter(Boolean).join(' | ')
  const results: RecognizedJosekiPattern[] = []

  for (const card of cards) {
    if (card.boardSize && card.boardSize !== query.boardSize) continue
    for (const corner of Object.keys(corners) as JosekiCorner[]) {
      const { score, evidence, nextMoves } = scoreCard(card, query, corner, corners[corner], moveSet, signalText)
      if (score < 9) continue
      results.push({
        id: card.id,
        name: card.name,
        family: card.family,
        confidence: confidenceFrom(score),
        score: Math.round(score * 10) / 10,
        matchedCorner: corner,
        matchedRelativeStones: Array.from(corners[corner]).sort(),
        evidence: [...evidence, `corner=${corner}`, `cornerMoves=${rawCornerMoves[corner].slice(-8).join(', ')}`].slice(0, 8),
        sourceRefs: card.sourceRefs ?? ['gomentor-curated-original'],
        sourceQuality: card.sourceQuality ?? 'curated',
        variationCount: card.variationCount,
        commonNextMoves: nextMoves,
        variations: card.variations,
        recognition: card.recognition,
        wrongThinking: card.wrongThinking,
        correctThinking: card.correctThinking,
        drillPrompt: card.drillPrompt
      })
    }
  }

  return results
    .sort((a, b) => b.score - a.score || b.variationCount - a.variationCount || a.name.localeCompare(b.name))
    .slice(0, query.maxResults ?? 4)
}

export function formatJosekiPatternsForPrompt(patterns: RecognizedJosekiPattern[]): string {
  if (!patterns.length) return '未识别到高置信定式族。不要主动给出定式名称。'
  return patterns
    .slice(0, 4)
    .map((pattern, index) => {
      const nextMoves = pattern.commonNextMoves
        .slice(0, 4)
        .map((move) => `${move.gtpMove ?? move.relativeMove}: ${move.label}${move.condition ? `（${move.condition}）` : ''}`)
        .join('；')
      return [
        `${index + 1}. ${pattern.name} (${pattern.family}, ${pattern.confidence}, score=${pattern.score})`,
        `角落：${pattern.matchedCorner}；变化数量估计：${pattern.variationCount}`,
        `识别依据：${pattern.evidence.join('；')}`,
        `常见下一手/分支：${nextMoves || '需以 KataGo 候选为准'}`,
        `教学说明：${pattern.recognition}`,
        `来源标记：${pattern.sourceRefs.join(', ')}；sourceQuality=${pattern.sourceQuality}`
      ].join('\n')
    })
    .join('\n\n')
}
