import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { KataGoMoveAnalysis, KnowledgeMatch, KnowledgePacket } from '@main/lib/types'
import { recognizeJosekiPatterns, type RecognizedJosekiPattern } from './josekiRecognizer'

export type MotifConfidence = 'strong' | 'medium' | 'weak'
export type MotifPhase = 'opening' | 'middlegame' | 'endgame' | 'any'
export type MotifRegion = 'corner' | 'side' | 'center' | 'any'

export interface RecognizedTeachingMotif {
  id: string
  title: string
  motifType: string
  category: string
  phase: MotifPhase[]
  region: MotifRegion
  confidence: MotifConfidence
  score: number
  evidence: string[]
  whyMatched: string
  recognition: string
  wrongThinking: string
  correctThinking: string
  drillPrompt: string
  source: 'elite-card' | 'heuristic' | 'knowledge-match' | 'joseki-card'
  sourceRefs?: string[]
  sourceQuality?: string
  expectedNextMoves?: Array<{ move: string; label: string; condition?: string }>
  variationCount?: number
  josekiFamily?: string
  relatedMoves: string[]
  tags: string[]
}

interface RecentMoveLike {
  row: number | null
  col: number | null
  gtp?: string | null
}

interface MotifRecognizerQuery {
  text?: string
  moveNumber: number
  totalMoves: number
  boardSize: number
  recentMoves?: RecentMoveLike[]
  userLevel?: string
  playerColor?: 'B' | 'W'
  lossScore?: number
  judgement?: string
  contextTags?: string[]
  playedMove?: string
  candidateMoves?: string[]
  principalVariation?: string[]
  maxResults?: number
}

interface ElitePatternCard {
  id: string
  title: string
  category: string
  patternType: string
  scope: string
  phase: MotifPhase[]
  regions: MotifRegion[]
  levels: string[]
  tags: string[]
  aliases: string[]
  triggerSignals: string[]
  negativeSignals?: string[]
  katagoSignals: string[]
  recognition: string
  wrongThinking: string
  correctThinking: string
  coachLines: string[]
  drillPrompt: string
  confidenceBoost?: number
  sourceRefs?: string[]
  sourceQuality?: string
}

let cachedCardsRoot = ''
let cachedCards: ElitePatternCard[] | null = null

function dataRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'data')
  return join(process.cwd(), 'data')
}

function loadEliteCards(root = dataRoot()): ElitePatternCard[] {
  if (cachedCards && cachedCardsRoot === root) return cachedCards
  const filenames = [
    'elite-pattern-cards.json',
    'elite-pattern-cards-v4.json',
    'elite-pattern-cards-v6.json',
    'elite-pattern-cards-v7.json',
    'elite-pattern-cards-v8.json',
    'elite-pattern-cards-v9.json',
    'elite-pattern-cards-v10.json',
    'elite-pattern-cards-v11.json'
  ]
  const loaded: ElitePatternCard[] = []
  for (const filename of filenames) {
    const path = join(root, 'knowledge', filename)
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as ElitePatternCard[]
      if (Array.isArray(parsed)) loaded.push(...parsed)
    } catch {
      // Ignore malformed optional packs; the source registry can surface QA issues separately.
    }
  }
  cachedCardsRoot = root
  cachedCards = loaded
  return cachedCards
}

function phaseFrom(moveNumber: number, totalMoves: number): MotifPhase {
  const ratio = totalMoves > 0 ? moveNumber / totalMoves : 0
  if (moveNumber <= 40 || ratio <= 0.2) return 'opening'
  if (ratio <= 0.72) return 'middlegame'
  return 'endgame'
}

function normalizeMove(move: string | undefined | null): string | undefined {
  if (!move) return undefined
  const trimmed = move.trim().toUpperCase()
  if (!trimmed || trimmed === 'PASS') return undefined
  return trimmed
}

function pointFromGtp(move: string | undefined | null, boardSize: number): { x: number; y: number; gtp: string } | undefined {
  const normalized = normalizeMove(move)
  if (!normalized) return undefined
  const match = normalized.match(/^([A-HJ-T])(\d{1,2})$/)
  if (!match) return undefined
  const columns = 'ABCDEFGHJKLMNOPQRST'.slice(0, boardSize)
  const x = columns.indexOf(match[1])
  const y = Number(match[2]) - 1
  if (x < 0 || y < 0 || y >= boardSize) return undefined
  return { x, y, gtp: normalized }
}

function regionOf(point: { x: number; y: number } | undefined, boardSize: number): MotifRegion {
  if (!point) return 'any'
  const distX = Math.min(point.x, boardSize - 1 - point.x)
  const distY = Math.min(point.y, boardSize - 1 - point.y)
  const minDist = Math.min(distX, distY)
  if (distX <= 4 && distY <= 4) return 'corner'
  if (minDist <= 3) return 'side'
  return 'center'
}

function distance(a: { x: number; y: number } | undefined, b: { x: number; y: number } | undefined): number {
  if (!a || !b) return 99
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function candidateSpread(analysis: KataGoMoveAnalysis | undefined): number {
  const moves = analysis?.before?.topMoves ?? []
  if (moves.length < 2) return 99
  return Math.abs((moves[0]?.winrate ?? 0) - (moves[1]?.winrate ?? 0))
}

function stringifySignals(parts: Array<unknown>): string {
  return parts
    .flatMap((part) => {
      if (!part) return []
      if (Array.isArray(part)) return part
      if (typeof part === 'object') return Object.values(part as Record<string, unknown>)
      return [part]
    })
    .map((value) => String(value).toLowerCase())
    .join(' | ')
}

function knowledgeSignalText(matches: KnowledgeMatch[], packets: KnowledgePacket[]): string {
  return stringifySignals([
    matches.map((match) => [match.title, match.matchType, match.confidence, match.reason, match.teachingPayload?.recognition, match.teachingPayload?.keyVariations]),
    packets.map((packet) => [packet.title, packet.category, packet.phase, packet.tags, packet.summary])
  ])
}

function confidenceFromScore(score: number): MotifConfidence {
  if (score >= 14) return 'strong'
  if (score >= 8) return 'medium'
  return 'weak'
}

function pushReason(reasons: string[], reason: string, points: number): number {
  reasons.push(reason)
  return points
}

function tokenHit(signalText: string, tokens: string[]): string[] {
  return tokens.filter((token) => token && signalText.includes(token.toLowerCase()))
}

function scoreEliteCard(
  card: ElitePatternCard,
  query: MotifRecognizerQuery,
  analysis: KataGoMoveAnalysis | undefined,
  signalText: string,
  region: MotifRegion,
  phase: MotifPhase,
  localDistance: number
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = card.confidenceBoost ?? 0

  if (card.phase.includes(phase) || card.phase.includes('any')) score += pushReason(reasons, `phase=${phase}`, 2)
  if (card.regions.includes(region) || card.regions.includes('any')) score += pushReason(reasons, `region=${region}`, 2)
  if (!query.userLevel || card.levels.includes(query.userLevel) || card.levels.includes('any')) score += 1

  const tagHits = tokenHit(signalText, [...card.tags, ...card.aliases])
  if (tagHits.length) score += pushReason(reasons, `keyword hits: ${tagHits.slice(0, 4).join(', ')}`, Math.min(7, tagHits.length * 2))

  const triggerHits = tokenHit(signalText, card.triggerSignals)
  if (triggerHits.length) score += pushReason(reasons, `trigger signals: ${triggerHits.slice(0, 4).join(', ')}`, Math.min(8, triggerHits.length * 2.5))

  const kataGoHits = tokenHit(signalText, card.katagoSignals)
  if (kataGoHits.length) score += pushReason(reasons, `KataGo signals: ${kataGoHits.slice(0, 4).join(', ')}`, Math.min(6, kataGoHits.length * 2))

  const negativeHits = tokenHit(signalText, card.negativeSignals ?? [])
  if (negativeHits.length) score -= negativeHits.length * 3

  const loss = analysis?.playedMove?.winrateLoss ?? query.lossScore ?? 0
  const scoreLoss = analysis?.playedMove?.scoreLoss ?? 0
  const judgement = String(query.judgement ?? analysis?.judgement ?? '').toLowerCase()
  if (loss >= 7 || scoreLoss >= 4 || judgement === 'blunder') score += pushReason(reasons, 'large-loss review point', 3)
  else if (loss >= 2.5 || scoreLoss >= 1.5 || judgement === 'mistake') score += pushReason(reasons, 'medium-loss review point', 2)

  if (localDistance <= 2 && ['tesuji', 'life-death', 'shapes'].includes(card.category)) score += pushReason(reasons, 'actual/best move are local alternatives', 2)
  if (localDistance >= 6 && ['strategy', 'opening', 'endgame'].includes(card.category)) score += pushReason(reasons, 'actual/best move indicate whole-board direction', 2)
  if (candidateSpread(analysis) < 1.5 && card.patternType.includes('style')) score += 3

  return { score, reasons }
}

function motifFromCard(card: ElitePatternCard, score: number, reasons: string[], region: MotifRegion, relatedMoves: string[]): RecognizedTeachingMotif {
  return {
    id: card.id,
    title: card.title,
    motifType: card.patternType,
    category: card.category,
    phase: card.phase,
    region,
    confidence: confidenceFromScore(score),
    score: Math.round(score * 10) / 10,
    evidence: reasons.slice(0, 6),
    whyMatched: reasons.slice(0, 4).join('；') || card.recognition,
    recognition: card.recognition,
    wrongThinking: card.wrongThinking,
    correctThinking: card.correctThinking,
    drillPrompt: card.drillPrompt,
    source: 'elite-card',
    sourceRefs: card.sourceRefs,
    sourceQuality: card.sourceQuality,
    relatedMoves,
    tags: card.tags
  }
}

function heuristicMotifs(
  query: MotifRecognizerQuery,
  analysis: KataGoMoveAnalysis | undefined,
  phase: MotifPhase,
  region: MotifRegion,
  actual: string | undefined,
  best: string | undefined,
  localDistance: number
): RecognizedTeachingMotif[] {
  const loss = analysis?.playedMove?.winrateLoss ?? query.lossScore ?? 0
  const scoreLoss = analysis?.playedMove?.scoreLoss ?? 0
  const judgement = String(query.judgement ?? analysis?.judgement ?? '').toLowerCase()
  const relatedMoves = [actual, best, ...(query.principalVariation ?? []).slice(0, 4)].filter(Boolean) as string[]
  const results: RecognizedTeachingMotif[] = []

  function add(partial: Omit<RecognizedTeachingMotif, 'score' | 'phase' | 'region' | 'source' | 'relatedMoves' | 'tags'> & { score: number; tags?: string[] }): void {
    results.push({
      phase: [phase],
      region,
      source: 'heuristic',
      relatedMoves,
      tags: partial.tags ?? [],
      ...partial,
      score: Math.round(partial.score * 10) / 10
    })
  }

  if ((loss >= 2.5 || scoreLoss >= 1.5 || ['mistake', 'blunder'].includes(judgement)) && localDistance >= 6) {
    add({
      id: 'heuristic-urgent-vs-big',
      title: '急所与大场的优先级',
      motifType: 'urgent_vs_big',
      category: 'strategy',
      confidence: loss >= 7 || scoreLoss >= 4 ? 'strong' : 'medium',
      score: 11 + Math.min(5, loss / 2),
      evidence: ['实战手与首选手距离较远', `winrateLoss=${loss.toFixed(1)}`, `scoreLoss=${scoreLoss.toFixed(1)}`],
      whyMatched: '实战和首选不在同一区域，且存在可见损失，优先检查“局部急所 vs 全局大场”。',
      recognition: 'AI 更重视另一区域，说明当前最大问题可能不是具体棋形，而是先后顺序。',
      wrongThinking: '只看眼前一块棋的安全或小空，忽略全局最大压力点。',
      correctThinking: '先问哪边如果不处理会立刻变差，再问下一手是否还能回到大场。',
      drillPrompt: '遮住推荐点，只判断：这一步是该先救急、攻击，还是抢大场？',
      tags: ['急所', '大场', '方向']
    })
  }

  if ((loss >= 3 || scoreLoss >= 2) && localDistance <= 2 && phase !== 'opening') {
    add({
      id: 'heuristic-local-shape-loss',
      title: '局部棋形/读秒下的细节亏损',
      motifType: 'shape_inefficiency',
      category: 'shapes',
      confidence: loss >= 7 ? 'strong' : 'medium',
      score: 10 + Math.min(4, loss / 2),
      evidence: ['实战手和首选手是近距离局部选择', `localDistance=${localDistance}`, `judgement=${judgement || 'unknown'}`],
      whyMatched: '首选手与实战手接近，说明问题多半在棋形效率、次序或局部读法。',
      recognition: '这里不是换区域的问题，而是同一局部里的手筋/形状/先后手差异。',
      wrongThinking: '只想“这里也能下”，没有比较哪一手更先手、更补形、更限制对方。',
      correctThinking: '同一区域先比较：是否打吃方向正确、是否留下断点、是否让对方先手。',
      drillPrompt: '在同一区域给出两个候选，判断哪一个更先手、形更好。',
      tags: ['棋形', '局部', '次序']
    })
  }

  if (phase === 'endgame' && (scoreLoss >= 1 || loss >= 2.5)) {
    add({
      id: 'heuristic-endgame-sente',
      title: '官子先后手与目差',
      motifType: 'endgame_sente',
      category: 'endgame',
      confidence: scoreLoss >= 2 ? 'strong' : 'medium',
      score: 10 + Math.min(5, scoreLoss * 2),
      evidence: [`phase=${phase}`, `scoreLoss=${scoreLoss.toFixed(1)}`, '官子阶段目差更可靠'],
      whyMatched: '官子阶段出现目差损失，应优先检查先手官子、逆收和收束顺序。',
      recognition: '这类错误通常不是“胜率数字”，而是官子价值和先后手次序。',
      wrongThinking: '只看当前能收几目，没看对方下一手是否抢到更大的先手。',
      correctThinking: '先区分先手/后手/逆收，再按双方最大官子排序。',
      drillPrompt: '给三个官子点，先判断哪个是先手，再排序大小。',
      tags: ['官子', '先手', '目差']
    })
  }

  if (phase === 'middlegame' && localDistance >= 4 && (query.principalVariation?.length ?? 0) >= 3) {
    add({
      id: 'heuristic-attack-direction',
      title: '攻击方向与借力',
      motifType: 'attack_direction',
      category: 'strategy',
      confidence: loss >= 4 ? 'medium' : 'weak',
      score: 8 + Math.min(4, loss / 2),
      evidence: ['中盘候选手带出连续 PV', '首选手改变作战方向'],
      whyMatched: '中盘首选线通常反映攻击方向、借力或转换，而不只是单点价值。',
      recognition: 'AI 可能是在借攻击争取外势、先手或转换。',
      wrongThinking: '攻击时只想吃掉对方，不看对方逃跑方向和自己的收益。',
      correctThinking: '攻击前先问：我要把对方赶向哪里？我攻击的同时得到什么？',
      drillPrompt: '选择一个方向压迫孤棋，并说出你想得到的收益。',
      tags: ['攻击', '方向', '转换']
    })
  }

  return results
}

function matchKnowledgeMotifs(matches: KnowledgeMatch[], relatedMoves: string[]): RecognizedTeachingMotif[] {
  return matches
    .filter((match) => match.confidence !== 'weak')
    .slice(0, 4)
    .map((match) => {
      const payload = match.teachingPayload as
        | { recognition?: string; wrongThinking?: string; correctThinking?: string; drillPrompt?: string }
        | undefined
      const evidence = [...(match.reason ?? []), payload?.recognition].filter(Boolean).slice(0, 5) as string[]
      return {
        id: `knowledge-${match.id}`,
        title: match.title,
        motifType: match.matchType,
        category: match.matchType,
        phase: ['any' as MotifPhase],
        region: 'any' as MotifRegion,
        confidence: match.confidence === 'strong' ? 'strong' : 'medium',
        score: Math.round((match.score + (match.confidence === 'strong' ? 5 : 2)) * 10) / 10,
        evidence,
        whyMatched: evidence.slice(0, 3).join('；') || `知识匹配 ${match.title}`,
        recognition: payload?.recognition ?? match.title,
        wrongThinking: payload?.wrongThinking ?? '只看局部结果，没有把棋形和全局目的联系起来。',
        correctThinking: payload?.correctThinking ?? '先确认棋形目的，再比较候选手的先后手和方向。',
        drillPrompt: payload?.drillPrompt ?? '回到这个局面，只问自己：这手的棋形目的是什么？',
        source: 'knowledge-match' as const,
        sourceRefs: ['local-knowledge-match'],
        sourceQuality: 'project-local',
        relatedMoves,
        tags: [match.matchType, match.confidence]
      }
    })
}


function motifsFromJoseki(patterns: RecognizedJosekiPattern[]): RecognizedTeachingMotif[] {
  return patterns.map((pattern) => ({
    id: `joseki-${pattern.id}`,
    title: pattern.name,
    motifType: `joseki:${pattern.family}`,
    category: 'joseki',
    phase: ['opening' as MotifPhase],
    region: 'corner' as MotifRegion,
    confidence: pattern.confidence,
    score: pattern.score + 2,
    evidence: pattern.evidence,
    whyMatched: pattern.evidence.slice(0, 4).join('；') || pattern.recognition,
    recognition: pattern.recognition,
    wrongThinking: pattern.wrongThinking,
    correctThinking: pattern.correctThinking,
    drillPrompt: pattern.drillPrompt,
    source: 'joseki-card' as const,
    sourceRefs: pattern.sourceRefs,
    sourceQuality: pattern.sourceQuality,
    expectedNextMoves: pattern.commonNextMoves.map((move) => ({ move: move.gtpMove ?? move.relativeMove, label: move.label, condition: move.condition })),
    variationCount: pattern.variationCount,
    josekiFamily: pattern.family,
    relatedMoves: pattern.commonNextMoves.map((move) => move.gtpMove ?? move.relativeMove).filter(Boolean),
    tags: ['定式', 'joseki', pattern.family]
  }))
}

function uniqueMotifs(motifs: RecognizedTeachingMotif[]): RecognizedTeachingMotif[] {
  const best = new Map<string, RecognizedTeachingMotif>()
  for (const motif of motifs) {
    const key = motif.motifType
    const current = best.get(key)
    if (!current || motif.score > current.score) best.set(key, motif)
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}

export function recognizeTeachingMotifs(
  query: MotifRecognizerQuery,
  analysis: KataGoMoveAnalysis | undefined,
  knowledgeMatches: KnowledgeMatch[] = [],
  knowledgePackets: KnowledgePacket[] = []
): RecognizedTeachingMotif[] {
  const phase = phaseFrom(query.moveNumber, query.totalMoves)
  const bestMove = normalizeMove(analysis?.before?.topMoves?.[0]?.move ?? query.candidateMoves?.[0])
  const actualMove = normalizeMove(analysis?.playedMove?.move ?? query.playedMove)
  const bestPoint = pointFromGtp(bestMove, query.boardSize)
  const actualPoint = pointFromGtp(actualMove, query.boardSize)
  const region = regionOf(bestPoint ?? actualPoint, query.boardSize)
  const localDistance = distance(bestPoint, actualPoint)
  const relatedMoves = [actualMove, bestMove, ...(query.principalVariation ?? []).slice(0, 6)].filter(Boolean) as string[]

  const phaseSignal = `phase:${phase}`
  const regionSignal = `region:${region}`
  const loss = analysis?.playedMove?.winrateLoss ?? query.lossScore ?? 0
  const scoreLoss = analysis?.playedMove?.scoreLoss ?? 0
  const spread = candidateSpread(analysis)
  const impliedSignals = [
    phaseSignal,
    regionSignal,
    localDistance <= 2 ? 'local_tactical_loss' : 'global_direction_loss',
    localDistance >= 6 ? 'tenuki_or_wrong_side' : '',
    loss >= 7 ? 'high_winrate_loss' : loss >= 2.5 ? 'medium_winrate_loss' : 'small_loss',
    scoreLoss >= 4 ? 'high_score_loss' : scoreLoss >= 1.5 ? 'medium_score_loss' : 'small_score_loss',
    spread < 1.5 ? 'candidate_style_choice' : 'clear_top_candidate',
    String(query.judgement ?? analysis?.judgement ?? '')
  ]
  const signalText = stringifySignals([
    query.text,
    query.contextTags,
    query.candidateMoves,
    query.principalVariation,
    impliedSignals,
    knowledgeSignalText(knowledgeMatches, knowledgePackets)
  ])

  const cardMotifs = loadEliteCards()
    .map((card) => ({ card, ...scoreEliteCard(card, query, analysis, signalText, region, phase, localDistance) }))
    .filter(({ score }) => score >= 8)
    .map(({ card, score, reasons }) => motifFromCard(card, score, reasons, region, relatedMoves))

  const josekiMotifs = motifsFromJoseki(
    recognizeJosekiPatterns({
      boardSize: query.boardSize,
      moveNumber: query.moveNumber,
      recentMoves: query.recentMoves,
      candidateMoves: query.candidateMoves,
      principalVariation: query.principalVariation,
      actualMove,
      bestMove,
      text: query.text,
      maxResults: 4
    })
  )

  const motifs = uniqueMotifs([
    ...josekiMotifs,
    ...cardMotifs,
    ...matchKnowledgeMotifs(knowledgeMatches, relatedMoves),
    ...heuristicMotifs(query, analysis, phase, region, actualMove, bestMove, localDistance)
  ])

  return motifs.slice(0, query.maxResults ?? 8)
}

export function formatRecognizedMotifsForPrompt(motifs: RecognizedTeachingMotif[]): string {
  if (!motifs.length) return '未识别到高置信棋形。请只基于 KataGo 证据讲解。'
  return motifs
    .slice(0, 6)
    .map((motif, index) => {
      return [
        `${index + 1}. ${motif.title} (${motif.motifType}, ${motif.confidence}, score=${motif.score})`,
        `识别依据：${motif.whyMatched}`,
        motif.sourceRefs?.length ? `来源标记：${motif.sourceRefs.join(', ')}；sourceQuality=${motif.sourceQuality ?? 'unknown'}` : '',
        motif.variationCount ? `定式/变化数量估计：${motif.variationCount}` : '',
        motif.expectedNextMoves?.length
          ? `常见下一手：${motif.expectedNextMoves.slice(0, 4).map((move) => `${move.move} ${move.label}${move.condition ? `(${move.condition})` : ''}`).join('；')}`
          : '',
        `人类讲法：${motif.recognition}`,
        `常见误区：${motif.wrongThinking}`,
        `正确思路：${motif.correctThinking}`,
        `小练习：${motif.drillPrompt}`
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
}