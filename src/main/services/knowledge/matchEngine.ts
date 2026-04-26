import type {
  CoachUserLevel,
  GameMove,
  KnowledgeMatch,
  KnowledgeMatchConfidence,
  KnowledgeMatchType,
  RecommendedProblem
} from '@main/lib/types'
import {
  loadKnowledgeTrainingLibrary,
  type JosekiLine,
  type KnowledgeTrainingLibrary,
  type LifeDeathProblem,
  type TesujiProblem,
  type TrainingRegion
} from './training'
import {
  formatPatternForPrompt,
  loadKnowledgePatternCards,
  searchKnowledgePatterns,
  type PatternPhase,
  type PatternRegion
} from './patterns'

export interface BoardSnapshotStone {
  color: 'B' | 'W'
  point: string
}

export interface LocalWindow {
  anchor: string
  stones: BoardSnapshotStone[]
}

export interface KnowledgeMatchQuery {
  text?: string
  moveNumber: number
  totalMoves: number
  boardSize: number
  recentMoves: GameMove[]
  userLevel: CoachUserLevel
  studentLevel?: CoachUserLevel
  playerColor?: 'B' | 'W'
  lossScore?: number
  judgement?: string
  contextTags?: string[]
  playedMove?: string
  candidateMoves?: string[]
  principalVariation?: string[]
  boardSnapshot?: BoardSnapshotStone[]
  localWindows?: LocalWindow[]
  maxResults?: number
}

interface QueryFeatures {
  phase: PatternPhase
  region: TrainingRegion
  tokens: Set<string>
  moveFeatures: Set<string>
  candidateFeatures: Set<string>
  pvFeatures: Set<string>
  allPoints: Set<string>
}

type ProblemEntry = LifeDeathProblem | TesujiProblem

const TOKEN_SPLIT = /[，。！？、；：,.!?;:()\[\]【】\s/_-]+/

function phaseFromMove(moveNumber: number, totalMoves: number): PatternPhase {
  const ratio = totalMoves > 0 ? moveNumber / totalMoves : 0
  if (moveNumber <= 40 || ratio <= 0.2) return 'opening'
  if (ratio <= 0.72) return 'middlegame'
  return 'endgame'
}

function normalizeTokens(values: Array<string | undefined>): string[] {
  return values
    .flatMap((value) => String(value ?? '').split(TOKEN_SPLIT))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function gtpToPoint(point: string, boardSize: number): { row: number; col: number } | null {
  const match = point.trim().toUpperCase().match(/^([A-HJ-Z])(\d{1,2})$/)
  if (!match) return null
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'
  const col = letters.indexOf(match[1])
  const number = Number(match[2])
  if (col < 0 || col >= boardSize || number < 1 || number > boardSize) return null
  return { col, row: boardSize - number }
}

function addPointFeatures(features: Set<string>, row: number, col: number, boardSize: number): void {
  const x = Math.min(col, boardSize - 1 - col)
  const y = Math.min(row, boardSize - 1 - row)
  const minEdge = Math.min(x, y)
  const maxEdge = Math.max(x, y)

  if (x <= 5 && y <= 5) features.add('corner')
  else if (minEdge <= 3) features.add('side')
  else features.add('center')

  if (minEdge === 0) features.add('first-line')
  if (minEdge === 1) features.add('second-line')
  if (minEdge === 2) features.add('third-line')
  if (minEdge === 3) features.add('fourth-line')
  if (x === 3 && y === 3) features.add('4-4')
  if (x === 2 && y === 2) features.add('3-3')
  if ((x === 2 && y === 3) || (x === 3 && y === 2)) features.add('3-4')
  if (minEdge <= 3 && maxEdge >= 4 && maxEdge <= 6) features.add('approach')
  if (minEdge <= 2 && maxEdge <= 5) features.add('eye-shape')
}

function addFeaturesFromGtp(points: string[] | undefined, boardSize: number): Set<string> {
  const features = new Set<string>()
  for (const point of points ?? []) {
    const parsed = gtpToPoint(point, boardSize)
    if (parsed) {
      addPointFeatures(features, parsed.row, parsed.col, boardSize)
    }
  }
  return features
}

function addFeaturesFromMoves(moves: GameMove[], boardSize: number): Set<string> {
  const features = new Set<string>()
  for (const move of moves) {
    if (move.row !== null && move.col !== null) {
      addPointFeatures(features, move.row, move.col, boardSize)
    } else if (move.gtp) {
      for (const feature of addFeaturesFromGtp([move.gtp], boardSize)) features.add(feature)
    }
  }
  if (moves.length >= 2) {
    const last = moves[moves.length - 1]
    const previous = moves[moves.length - 2]
    const lastPoint = last.row !== null && last.col !== null ? { row: last.row, col: last.col } : gtpToPoint(last.gtp, boardSize)
    const prevPoint = previous.row !== null && previous.col !== null ? { row: previous.row, col: previous.col } : gtpToPoint(previous.gtp, boardSize)
    if (lastPoint && prevPoint) {
      const dx = Math.abs(lastPoint.col - prevPoint.col)
      const dy = Math.abs(lastPoint.row - prevPoint.row)
      if (dx + dy === 1) features.add('contact')
      if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) features.add('knight-move')
      if ((dx === 0 && dy === 2) || (dx === 2 && dy === 0)) features.add('jump')
    }
  }
  return features
}

function detectRegion(query: KnowledgeMatchQuery): TrainingRegion {
  const points = [
    query.playedMove,
    ...(query.candidateMoves ?? []).slice(0, 3),
    ...(query.principalVariation ?? []).slice(0, 5),
    ...query.recentMoves.map((move) => move.gtp)
  ].filter(Boolean) as string[]
  let corner = 0
  let side = 0
  let center = 0
  for (const point of points) {
    const parsed = gtpToPoint(point, query.boardSize)
    if (!parsed) continue
    const x = Math.min(parsed.col, query.boardSize - 1 - parsed.col)
    const y = Math.min(parsed.row, query.boardSize - 1 - parsed.row)
    if (x <= 5 && y <= 5) corner += 1
    else if (Math.min(x, y) <= 3) side += 1
    else center += 1
  }
  if (corner >= side && corner >= center) return 'corner'
  if (side >= center) return 'side'
  return 'center'
}

function buildFeatures(query: KnowledgeMatchQuery): QueryFeatures {
  const moveFeatures = new Set([
    ...addFeaturesFromMoves(query.recentMoves.slice(-10), query.boardSize),
    ...addFeaturesFromGtp(query.playedMove ? [query.playedMove] : [], query.boardSize)
  ])
  const candidateFeatures = addFeaturesFromGtp(query.candidateMoves, query.boardSize)
  const pvFeatures = addFeaturesFromGtp(query.principalVariation, query.boardSize)
  const tokens = new Set(normalizeTokens([
    query.text,
    query.judgement,
    ...(query.contextTags ?? [])
  ]))
  const allPoints = new Set([
    query.playedMove,
    ...(query.candidateMoves ?? []),
    ...(query.principalVariation ?? []),
    ...query.recentMoves.map((move) => move.gtp),
    ...(query.boardSnapshot ?? []).map((stone) => stone.point),
    ...(query.localWindows ?? []).flatMap((window) => [window.anchor, ...window.stones.map((stone) => stone.point)])
  ].filter(Boolean) as string[])

  return {
    phase: phaseFromMove(query.moveNumber, query.totalMoves),
    region: detectRegion(query),
    tokens,
    moveFeatures,
    candidateFeatures,
    pvFeatures,
    allPoints
  }
}

function addOverlapScore(values: string[], tokens: Set<string>, weight: number, reasons: string[], prefix: string): number {
  let score = 0
  for (const value of values) {
    const normalized = value.toLowerCase()
    if (tokens.has(normalized) || [...tokens].some((token) => normalized.includes(token) || token.includes(normalized))) {
      score += weight
      reasons.push(`${prefix}:${value}`)
    }
  }
  return score
}

function featureOverlap(values: string[], features: Set<string>, weight: number, reasons: string[], prefix: string): number {
  let score = 0
  for (const value of values) {
    const normalized = value.toLowerCase()
    if (features.has(normalized) || [...features].some((feature) => normalized.includes(feature) || feature.includes(normalized))) {
      score += weight
      reasons.push(`${prefix}:${value}`)
    }
  }
  return score
}

function sequenceOverlap(sequence: string[], points: Set<string>, reasons: string[]): number {
  let overlap = 0
  for (const point of sequence) {
    if (points.has(point)) {
      overlap += 1
    }
  }
  if (overlap > 0) {
    reasons.push(`sequence-overlap:${overlap}`)
  }
  return overlap
}

function confidence(score: number, exactish = false): KnowledgeMatchConfidence {
  if (exactish && score >= 28) return 'exact'
  if (score >= 21) return 'strong'
  if (score >= 12) return 'partial'
  return 'weak'
}

function applicabilityFor(confidenceValue: KnowledgeMatchConfidence, type: KnowledgeMatchType): string {
  if (confidenceValue === 'exact') return '本局局部手顺、候选点和区域都高度一致，可以作为同型讲解。'
  if (confidenceValue === 'strong') return '本局棋形和 KataGo 候选点相近，可以作为强相关型讲解，但仍要看全局厚薄。'
  if (confidenceValue === 'partial') return `本局只是像这个${type === 'joseki' ? '定式' : '棋形'}，老师应说“像这个型”，不能硬套结论。`
  return '弱相关，只适合作为备用训练建议，不应进入主讲。'
}

function problemSummary(problem: ProblemEntry, problemType: RecommendedProblem['problemType']): RecommendedProblem {
  const correct = problem.correctMoves[0]
  const teaching = problemType === 'life_death'
    ? (problem as LifeDeathProblem).teaching.firstFeeling
    : (problem as TesujiProblem).teaching.firstHint
  return {
    id: problem.id,
    title: problem.title,
    problemType,
    difficulty: problem.difficulty,
    objective: problem.objective,
    firstHint: teaching,
    answerSummary: correct ? `${correct.move}: ${correct.explanation ?? '第一手占急所。'}` : '先找急所。',
    tags: problem.tags
  }
}

function relatedProblemsForTags(
  library: KnowledgeTrainingLibrary,
  tags: string[],
  limit = 3
): RecommendedProblem[] {
  const tokenSet = new Set(tags.map((tag) => tag.toLowerCase()))
  const candidates: Array<{ problem: ProblemEntry; type: RecommendedProblem['problemType']; score: number }> = [
    ...library.lifeDeathProblems.map((problem) => ({ problem, type: 'life_death' as const, score: addOverlapScore(problem.tags, tokenSet, 2, [], 'tag') })),
    ...library.tesujiProblems.map((problem) => ({ problem, type: 'tesuji' as const, score: addOverlapScore(problem.tags, tokenSet, 2, [], 'tag') }))
  ]
  return candidates
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.problem.title.localeCompare(b.problem.title))
    .slice(0, limit)
    .map((item) => problemSummary(item.problem, item.type))
}

function josekiMatch(line: JosekiLine, query: KnowledgeMatchQuery, features: QueryFeatures, library: KnowledgeTrainingLibrary): KnowledgeMatch | null {
  let score = 0
  const reasons: string[] = []
  if (line.levels.includes(query.studentLevel ?? query.userLevel)) {
    score += 2
    reasons.push(`level:${query.studentLevel ?? query.userLevel}`)
  }
  if (line.phase.includes(features.phase)) {
    score += 5
    reasons.push(`phase:${features.phase}`)
  }
  if (features.region === 'corner') {
    score += 5
    reasons.push('region:corner')
  }
  score += addOverlapScore([...line.tags, line.title, line.family], features.tokens, 4, reasons, 'text')
  score += featureOverlap(line.normalizedFeatures, new Set([...features.moveFeatures, ...features.candidateFeatures, ...features.pvFeatures]), 4, reasons, 'shape')
  const overlap = sequenceOverlap(line.relativeSequence, features.allPoints, reasons)
  score += overlap * 5
  if ((query.candidateMoves ?? []).includes(line.relativeSequence[1])) {
    score += 5
    reasons.push('katago-candidate-prefix')
  }
  if (query.moveNumber <= 70) {
    score += 2
    reasons.push('opening-timing')
  }
  if (score < 8) return null
  const confidenceValue = confidence(score, overlap >= 3)
  return {
    id: line.id,
    matchType: 'joseki',
    title: line.title,
    confidence: confidenceValue,
    score,
    reason: [...new Set(reasons)].slice(0, 8),
    applicability: applicabilityFor(confidenceValue, 'joseki'),
    teachingPayload: {
      summary: line.katagoEraJudgement,
      recognition: `识别为${line.title}相关局部：看角部手顺、挂角/点三三位置和外势方向。`,
      correctIdea: line.decisionRules.join(' '),
      keyVariations: line.branches.slice(0, 3).map((branch) => `${branch.name}: ${branch.whenToChoose}`),
      memoryCue: '定式先问方向，再问先手，最后才背手顺。',
      commonMistakes: line.commonMistakes,
      drills: line.trainingFocus.map((focus) => `${line.title}专项：${focus}`),
      boundary: applicabilityFor(confidenceValue, 'joseki'),
      sourceKind: line.sourceKind
    },
    relatedProblems: relatedProblemsForTags(library, [...line.tags, ...line.trainingFocus], 3)
  }
}

function problemMatch(
  problem: ProblemEntry,
  type: 'life_death' | 'tesuji',
  query: KnowledgeMatchQuery,
  features: QueryFeatures
): KnowledgeMatch | null {
  let score = 0
  const reasons: string[] = []
  if (problem.region === features.region) {
    score += 5
    reasons.push(`region:${problem.region}`)
  }
  if ((query.lossScore ?? 0) >= 2 || ['mistake', 'blunder'].includes(String(query.judgement))) {
    score += type === 'life_death' ? 4 : 3
    reasons.push('katago-loss')
  }
  score += addOverlapScore([...problem.tags, problem.title, problem.objective], features.tokens, 4, reasons, 'text')
  score += featureOverlap(problem.tags, new Set([...features.moveFeatures, ...features.candidateFeatures, ...features.pvFeatures]), 3, reasons, 'shape')
  const answerOverlap = sequenceOverlap(problem.correctMoves.map((move) => move.move), features.allPoints, reasons)
  score += answerOverlap * 7
  if (type === 'life_death' && features.moveFeatures.has('eye-shape')) {
    score += 5
    reasons.push('eye-shape')
  }
  if (type === 'tesuji' && (features.moveFeatures.has('contact') || features.moveFeatures.has('jump'))) {
    score += 3
    reasons.push('local-tesuji-relation')
  }
  if (score < 8) return null
  const confidenceValue = confidence(score, answerOverlap >= 1 && score >= 24)
  const lifeTeaching = type === 'life_death' ? (problem as LifeDeathProblem).teaching : undefined
  const tesujiTeaching = type === 'tesuji' ? (problem as TesujiProblem).teaching : undefined
  return {
    id: problem.id,
    matchType: type,
    title: problem.title,
    confidence: confidenceValue,
    score,
    reason: [...new Set(reasons)].slice(0, 8),
    applicability: applicabilityFor(confidenceValue, type),
    teachingPayload: {
      summary: problem.objective,
      recognition: lifeTeaching?.recognition ?? tesujiTeaching?.recognition ?? '先识别局部形状和双方气数。',
      correctIdea: lifeTeaching?.explanation ?? tesujiTeaching?.tesujiIdea ?? '先找急所，再读失败手。',
      keyVariations: problem.correctMoves.slice(0, 2).map((move) => `${move.move}: ${move.explanation ?? '正确第一手'}`),
      memoryCue: lifeTeaching?.memoryCue ?? tesujiTeaching?.memoryCue ?? '记住急所和次序。',
      commonMistakes: problem.failureMoves.slice(0, 2).map((move) => `${move.move}: ${move.why ?? '次序错误'}`),
      drills: [`${problem.title}：先看题，不看答案，读清第一手和失败手。`],
      boundary: applicabilityFor(confidenceValue, type),
      sourceKind: problem.sourceKind
    },
    relatedProblems: [problemSummary(problem, type)]
  }
}

export function searchKnowledgeMatchEngine(dataRoot: string, query: KnowledgeMatchQuery): KnowledgeMatch[] {
  const library = loadKnowledgeTrainingLibrary(dataRoot)
  const features = buildFeatures(query)
  const matches: KnowledgeMatch[] = []

  for (const line of library.josekiLines) {
    const match = josekiMatch(line, query, features, library)
    if (match) matches.push(match)
  }
  for (const problem of library.lifeDeathProblems) {
    const match = problemMatch(problem, 'life_death', query, features)
    if (match) matches.push(match)
  }
  for (const problem of library.tesujiProblems) {
    const match = problemMatch(problem, 'tesuji', query, features)
    if (match) matches.push(match)
  }

  const patternMatches = searchKnowledgePatterns(loadKnowledgePatternCards(dataRoot), {
    userLevel: query.userLevel,
    phase: features.phase,
    region: features.region as PatternRegion,
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
  }).slice(0, 4)

  for (const pattern of patternMatches) {
    const matchType: KnowledgeMatchType = pattern.card.category === 'shape' ? 'shape' : pattern.card.category
    const confidenceValue: KnowledgeMatchConfidence = pattern.confidence === 'high' ? 'strong' : pattern.confidence === 'medium' ? 'partial' : 'weak'
    matches.push({
      id: pattern.card.id,
      matchType,
      title: pattern.card.title,
      confidence: confidenceValue,
      score: pattern.score,
      reason: pattern.reasons,
      applicability: applicabilityFor(confidenceValue, matchType),
      teachingPayload: {
        summary: pattern.card.teaching.correctIdea,
        recognition: pattern.card.teaching.recognition,
        correctIdea: pattern.card.teaching.correctIdea,
        keyVariations: pattern.card.variations.slice(0, 3).map((variation) => `${variation.name}: ${variation.whenToChoose}`),
        memoryCue: pattern.card.teaching.memoryCue,
        commonMistakes: [pattern.card.teaching.commonMistake],
        drills: [pattern.card.teaching.drill],
        boundary: `${applicabilityFor(confidenceValue, matchType)}\n${formatPatternForPrompt(pattern).split('\n').slice(-1)[0] ?? ''}`,
        sourceKind: 'common-pattern'
      },
      relatedProblems: relatedProblemsForTags(library, pattern.card.tags, 2)
    })
  }

  return matches
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, query.maxResults ?? 8)
}

export function recommendedProblemsFromMatches(matches: KnowledgeMatch[], limit = 3): RecommendedProblem[] {
  const seen = new Set<string>()
  const problems: RecommendedProblem[] = []
  for (const match of matches) {
    if (match.confidence === 'weak') {
      continue
    }
    for (const problem of match.relatedProblems) {
      if (!seen.has(problem.id)) {
        seen.add(problem.id)
        problems.push(problem)
      }
      if (problems.length >= limit) {
        return problems
      }
    }
  }
  return problems
}

export function formatKnowledgeMatchForPrompt(match: KnowledgeMatch): string {
  return [
    `匹配类型: ${match.matchType}`,
    `名称: ${match.title}`,
    `置信度: ${match.confidence}`,
    `匹配依据: ${match.reason.join(', ')}`,
    `适用边界: ${match.applicability}`,
    `识别特征: ${match.teachingPayload.recognition}`,
    `正确思路: ${match.teachingPayload.correctIdea}`,
    `常见变化: ${match.teachingPayload.keyVariations.join('；')}`,
    `记忆法: ${match.teachingPayload.memoryCue}`,
    `常见误区: ${match.teachingPayload.commonMistakes.join('；')}`,
    `训练建议: ${match.relatedProblems.map((problem) => `${problem.title}(${problem.difficulty})`).join('、') || match.teachingPayload.drills.join('；')}`,
    '老师使用边界: exact/strong 可以说“这是某某型”；partial 只能说“像某某型”；weak 不进入主讲。'
  ].join('\n')
}
