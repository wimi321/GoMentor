import type { JosekiCorner, JosekiMoveLike, JosekiPatternCard, JosekiRecognitionQuery } from './josekiRecognizer'

export type JosekiTrieConfidence = 'strong' | 'medium' | 'weak'

export interface JosekiTrieMatch {
  cardId: string
  family: string
  corner: JosekiCorner
  prefixLength: number
  relativeHits: number
  colorHits: number
  tenukiCount: number
  exactOrderMatch: boolean
  colorConsistent: boolean
  kataGoSupportsContinuation: boolean
  confidence: JosekiTrieConfidence
  score: number
  safeWording: '明确属于该定式族' | '像该定式分支' | 'SGF 树有此前缀，但本局未必该继续'
  evidence: string[]
}

interface SequenceToken {
  color?: 'B' | 'W'
  relative: string
}

interface CornerMoveToken extends SequenceToken {
  rawMove: string
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

function colorFromMove(move: JosekiMoveLike, fallbackIndex: number): 'B' | 'W' | undefined {
  const raw = (move as { color?: unknown }).color
  if (raw === 'B' || raw === 'W') return raw
  if (raw === 'b' || raw === 'black') return 'B'
  if (raw === 'w' || raw === 'white') return 'W'
  // SGF mainline alternates, but once handicap/setup appears this can be wrong.
  // Treat it only as a weak fallback so color consistency does not overclaim.
  return fallbackIndex % 2 === 0 ? 'B' : 'W'
}

function parseSequenceTokens(value: string): SequenceToken[] {
  const tokens: SequenceToken[] = []
  const regex = /\b([BW])?\s*(\d{1,2}-\d{1,2})\b/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(value))) {
    tokens.push({
      color: match[1] === 'B' || match[1] === 'W' ? match[1] : undefined,
      relative: match[2]
    })
  }
  return tokens
}

function cardSequences(card: JosekiPatternCard): SequenceToken[][] {
  const fromVariations = (card.variations ?? [])
    .map(parseSequenceTokens)
    .filter((tokens) => tokens.length >= 2)
  const required = (card.requiredRelativeStones ?? []).map((relative) => ({ relative }))
  return fromVariations.length ? fromVariations : required.length >= 2 ? [required] : []
}

function queryCornerSequences(query: JosekiRecognitionQuery): Record<JosekiCorner, CornerMoveToken[]> {
  const result: Record<JosekiCorner, CornerMoveToken[]> = { SW: [], SE: [], NW: [], NE: [] }
  const recent = (query.recentMoves ?? []).slice(-60)
  recent.forEach((move, index) => {
    const point = pointFromMove(move, query.boardSize)
    if (!point) return
    const corner = cornerOf(point, query.boardSize)
    result[corner].push({
      color: colorFromMove(move, index),
      relative: relativePoint(point, query.boardSize),
      rawMove: point.gtp ?? `${relativePoint(point, query.boardSize)}@${corner}`
    })
  })
  return result
}

function normalizeRelativeMoves(values: Array<string | undefined>, boardSize: number): Set<string> {
  const result = new Set<string>()
  for (const move of values) {
    const point = pointFromGtp(move, boardSize)
    if (point) result.add(relativePoint(point, boardSize))
  }
  return result
}

function scoreSequence(cardTokens: SequenceToken[], queryTokens: CornerMoveToken[]): {
  prefixLength: number
  relativeHits: number
  colorHits: number
  tenukiCount: number
  exactOrderMatch: boolean
  colorConsistent: boolean
} {
  let prefixLength = 0
  let colorHits = 0
  for (let index = 0; index < Math.min(cardTokens.length, queryTokens.length); index += 1) {
    const expected = cardTokens[index]
    const actual = queryTokens[index]
    if (expected.relative !== actual.relative) break
    prefixLength += 1
    if (!expected.color || !actual.color || expected.color === actual.color) colorHits += 1
  }
  const queryRelativeSet = new Set(queryTokens.map((token) => token.relative))
  const relativeHits = cardTokens.filter((token) => queryRelativeSet.has(token.relative)).length
  const tenukiCount = Math.max(0, queryTokens.length - prefixLength)
  return {
    prefixLength,
    relativeHits,
    colorHits,
    tenukiCount,
    exactOrderMatch: prefixLength >= Math.min(cardTokens.length, queryTokens.length, 4),
    colorConsistent: prefixLength === 0 ? false : colorHits >= Math.max(1, Math.floor(prefixLength * 0.75))
  }
}

function confidenceFrom(score: number, exactOrderMatch: boolean, colorConsistent: boolean): JosekiTrieConfidence {
  if (score >= 22 && exactOrderMatch && colorConsistent) return 'strong'
  if (score >= 13) return 'medium'
  return 'weak'
}

function wordingFor(confidence: JosekiTrieConfidence, exactOrderMatch: boolean, kataGoSupportsContinuation: boolean): JosekiTrieMatch['safeWording'] {
  if (confidence === 'strong' && exactOrderMatch && kataGoSupportsContinuation) return '明确属于该定式族'
  if (confidence !== 'weak' && exactOrderMatch) return '像该定式分支'
  return 'SGF 树有此前缀，但本局未必该继续'
}

export function recognizeJosekiTrie(cards: JosekiPatternCard[], query: JosekiRecognitionQuery): JosekiTrieMatch[] {
  if (query.boardSize !== 19 || cards.length === 0) return []
  const byCorner = queryCornerSequences(query)
  const continuationRelatives = normalizeRelativeMoves(
    [query.actualMove, query.bestMove, ...(query.candidateMoves ?? []), ...(query.principalVariation ?? [])],
    query.boardSize
  )
  const matches: JosekiTrieMatch[] = []
  for (const card of cards) {
    const sequences = cardSequences(card)
    if (!sequences.length) continue
    for (const corner of Object.keys(byCorner) as JosekiCorner[]) {
      const queryTokens = byCorner[corner]
      if (queryTokens.length < 2) continue
      for (const sequence of sequences) {
        const scored = scoreSequence(sequence, queryTokens)
        if (scored.prefixLength < 2 && scored.relativeHits < 3) continue
        const nextToken = sequence[scored.prefixLength]
        const kataGoSupportsContinuation = Boolean(nextToken && continuationRelatives.has(nextToken.relative))
        const score =
          scored.prefixLength * 5 +
          scored.colorHits * 2 +
          scored.relativeHits * 2 +
          (kataGoSupportsContinuation ? 5 : 0) -
          Math.min(6, scored.tenukiCount)
        if (score < 8) continue
        const confidence = confidenceFrom(score, scored.exactOrderMatch, scored.colorConsistent)
        matches.push({
          cardId: card.id,
          family: card.family,
          corner,
          prefixLength: scored.prefixLength,
          relativeHits: scored.relativeHits,
          colorHits: scored.colorHits,
          tenukiCount: scored.tenukiCount,
          exactOrderMatch: scored.exactOrderMatch,
          colorConsistent: scored.colorConsistent,
          kataGoSupportsContinuation,
          confidence,
          score: Math.round(score * 10) / 10,
          safeWording: wordingFor(confidence, scored.exactOrderMatch, kataGoSupportsContinuation),
          evidence: [
            `sequencePrefix=${scored.prefixLength}`,
            `relativeHits=${scored.relativeHits}`,
            `colorHits=${scored.colorHits}`,
            `tenukiCount=${scored.tenukiCount}`,
            `kataGoSupportsContinuation=${kataGoSupportsContinuation}`
          ]
        })
      }
    }
  }
  return matches
    .sort((a, b) => b.score - a.score || b.prefixLength - a.prefixLength || a.cardId.localeCompare(b.cardId))
    .slice(0, query.maxResults ?? 8)
}

export function josekiTrieMatchSummary(match: JosekiTrieMatch): string {
  return `${match.safeWording}：prefix=${match.prefixLength}，颜色一致=${match.colorConsistent ? '是' : '否'}，KataGo续手支持=${match.kataGoSupportsContinuation ? '是' : '否'}。`
}
