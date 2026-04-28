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
  explicitTokens: Set<string>
  intentTypes: Set<KnowledgeMatchType>
  explicitIntentTypes: Set<KnowledgeMatchType>
  moveFeatures: Set<string>
  candidateFeatures: Set<string>
  pvFeatures: Set<string>
  allPoints: Set<string>
}

type ProblemEntry = LifeDeathProblem | TesujiProblem
type RelativeTransform = (dx: number, dy: number) => [number, number]

interface RelativeStone {
  dx: number
  dy: number
  color: 'B' | 'W'
}

interface GeometryMatchResult {
  score: number
  ratio: number
  matched: number
  expected: number
  libertyScore: number
  transform: string
  colorMode: 'same-color' | 'color-swapped'
  queryAnchor: string
  problemAnchor: string
}

interface AnchorLibertyProfile {
  adjacent: Record<'B' | 'W' | 'empty' | 'edge', number>
  groups: Record<'B' | 'W', number>
  minLiberties: Partial<Record<'B' | 'W', number>>
}

const TOKEN_SPLIT = /[，。！？、；：,.!?;:()\[\]【】\s/_-]+/
const LOCAL_SHAPE_RADIUS = 4
const CONFIDENCE_RANK: Record<KnowledgeMatchConfidence, number> = {
  exact: 4,
  strong: 3,
  partial: 2,
  weak: 1
}

const INTENT_KEYWORDS: Record<Exclude<KnowledgeMatchType, 'shape' | 'concept'>, string[]> = {
  joseki: [
    '定式',
    'joseki',
    '星位',
    '小目',
    '点三三',
    '三三',
    '挂角',
    '守角',
    '夹攻',
    '低挂',
    '高挂',
    '大雪崩',
    '雪崩',
    '大斜',
    '太斜',
    '双飞燕',
    '妖刀',
    '托退',
    '中国流',
    '三连星',
    '小林流',
    '布局',
    '开局'
  ],
  life_death: [
    '死活',
    '做活',
    '杀棋',
    '活棋',
    '真眼',
    '假眼',
    '眼形',
    '急所',
    '对杀',
    '劫活',
    '双活',
    '曲四',
    '刀把五',
    '梅花六',
    '葡萄六',
    '板六',
    '金鸡独立',
    '直三',
    '弯三',
    '中手',
    '破眼',
    '扑入'
  ],
  tesuji: [
    '手筋',
    '倒扑',
    '吃回',
    '接不归',
    '老鼠偷油',
    '征子',
    '枷',
    '滚打包收',
    '挖',
    '扭十字',
    '断',
    '窥',
    '扳头',
    '双打',
    '弃子',
    '扑'
  ]
}

const BROAD_TRAINING_TAGS = new Set([
  '角部',
  '边上',
  '中腹',
  '中心',
  '定式',
  '布局',
  '方向',
  '大场',
  '变化',
  '价值判断',
  '局部轻重',
  '先手价值',
  '实地',
  '外势',
  '问题手',
  '急所',
  '死活',
  '手筋',
  '形',
  '形状',
  '先手',
  '后手',
  'ai定式'
])

const LOCAL_SHAPE_TRANSFORMS: Array<{ name: string; apply: RelativeTransform }> = [
  { name: 'identity', apply: (dx, dy) => [dx, dy] },
  { name: 'rotate90', apply: (dx, dy) => [-dy, dx] },
  { name: 'rotate180', apply: (dx, dy) => [-dx, -dy] },
  { name: 'rotate270', apply: (dx, dy) => [dy, -dx] },
  { name: 'mirror-x', apply: (dx, dy) => [-dx, dy] },
  { name: 'mirror-y', apply: (dx, dy) => [dx, -dy] },
  { name: 'mirror-main-diagonal', apply: (dx, dy) => [dy, dx] },
  { name: 'mirror-anti-diagonal', apply: (dx, dy) => [-dy, -dx] }
]

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
  const explicitTokens = new Set(normalizeTokens([query.text]))
  const tokens = new Set(normalizeTokens([
    query.text,
    query.judgement,
    ...(query.contextTags ?? [])
  ]))
  const moveFeatures = new Set([
    ...addFeaturesFromMoves(query.recentMoves.slice(-10), query.boardSize),
    ...addFeaturesFromGtp(query.playedMove ? [query.playedMove] : [], query.boardSize)
  ])
  const candidateFeatures = addFeaturesFromGtp(query.candidateMoves, query.boardSize)
  const pvFeatures = addFeaturesFromGtp(query.principalVariation, query.boardSize)
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
    explicitTokens,
    intentTypes: detectIntentTypes(tokens),
    explicitIntentTypes: detectIntentTypes(explicitTokens),
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
    if (tokenSetHas(tokens, normalized)) {
      score += weight
      reasons.push(`${prefix}:${value}`)
    }
  }
  return score
}

function tokenSetHas(tokens: Set<string>, value: string): boolean {
  const normalized = value.toLowerCase()
  return tokens.has(normalized) || [...tokens].some((token) => normalized.includes(token) || token.includes(normalized))
}

function hasSpecificTextHit(values: string[], tokens: Set<string>): boolean {
  return values
    .filter((value) => !BROAD_TRAINING_TAGS.has(value.toLowerCase()))
    .some((value) => tokenSetHas(tokens, value))
}

function detectIntentTypes(tokens: Set<string>): Set<KnowledgeMatchType> {
  const intentTypes = new Set<KnowledgeMatchType>()
  for (const [type, keywords] of Object.entries(INTENT_KEYWORDS) as Array<[Exclude<KnowledgeMatchType, 'shape' | 'concept'>, string[]]>) {
    if (keywords.some((keyword) => tokenSetHas(tokens, keyword))) {
      intentTypes.add(type)
    }
  }
  return intentTypes
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

function uniqueValidPoints(points: Array<string | undefined>, boardSize: number): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const point of points) {
    if (!point || seen.has(point)) continue
    if (!gtpToPoint(point, boardSize)) continue
    seen.add(point)
    values.push(point)
  }
  return values
}

function stonesNearAnchor(stones: BoardSnapshotStone[], anchor: string, boardSize: number): RelativeStone[] {
  const anchorPoint = gtpToPoint(anchor, boardSize)
  if (!anchorPoint) return []
  const seen = new Set<string>()
  const relatives: RelativeStone[] = []
  for (const stone of stones) {
    const point = gtpToPoint(stone.point, boardSize)
    if (!point) continue
    const dx = point.col - anchorPoint.col
    const dy = point.row - anchorPoint.row
    if (dx === 0 && dy === 0) continue
    if (Math.max(Math.abs(dx), Math.abs(dy)) > LOCAL_SHAPE_RADIUS) continue
    const key = `${stone.color}:${dx}:${dy}`
    if (seen.has(key)) continue
    seen.add(key)
    relatives.push({ dx, dy, color: stone.color })
  }
  return relatives
}

function stoneKey(stone: RelativeStone, transform: RelativeTransform, swapColors: boolean): string {
  const [dx, dy] = transform(stone.dx, stone.dy)
  const color = swapColors ? (stone.color === 'B' ? 'W' : 'B') : stone.color
  return `${color}:${dx}:${dy}`
}

function queryStonesForAnchor(query: KnowledgeMatchQuery, anchor: string): BoardSnapshotStone[] {
  const localWindow = (query.localWindows ?? []).find((window) => window.anchor === anchor)
  if (localWindow && localWindow.stones.length > 0) {
    return localWindow.stones
  }
  return query.boardSnapshot ?? []
}

function boardKey(row: number, col: number): string {
  return `${row},${col}`
}

function localBoard(stones: BoardSnapshotStone[], boardSize: number): Map<string, 'B' | 'W'> {
  const board = new Map<string, 'B' | 'W'>()
  for (const stone of stones) {
    const point = gtpToPoint(stone.point, boardSize)
    if (point) {
      board.set(boardKey(point.row, point.col), stone.color)
    }
  }
  return board
}

function neighbors(row: number, col: number, boardSize: number): Array<{ row: number; col: number }> {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 }
  ].filter((point) => point.row >= 0 && point.col >= 0 && point.row < boardSize && point.col < boardSize)
}

function collectLocalGroup(board: Map<string, 'B' | 'W'>, row: number, col: number, boardSize: number): Array<{ row: number; col: number }> {
  const color = board.get(boardKey(row, col))
  if (!color) return []
  const seen = new Set<string>()
  const group: Array<{ row: number; col: number }> = []
  const stack = [{ row, col }]
  while (stack.length > 0) {
    const current = stack.pop()!
    const key = boardKey(current.row, current.col)
    if (seen.has(key) || board.get(key) !== color) continue
    seen.add(key)
    group.push(current)
    for (const next of neighbors(current.row, current.col, boardSize)) {
      if (board.get(boardKey(next.row, next.col)) === color) {
        stack.push(next)
      }
    }
  }
  return group
}

function localLibertyCount(board: Map<string, 'B' | 'W'>, group: Array<{ row: number; col: number }>, boardSize: number): number {
  const liberties = new Set<string>()
  for (const stone of group) {
    for (const next of neighbors(stone.row, stone.col, boardSize)) {
      const key = boardKey(next.row, next.col)
      if (!board.has(key)) {
        liberties.add(key)
      }
    }
  }
  return liberties.size
}

function anchorLibertyProfile(stones: BoardSnapshotStone[], anchor: string, boardSize: number): AnchorLibertyProfile | null {
  const anchorPoint = gtpToPoint(anchor, boardSize)
  if (!anchorPoint) return null
  const board = localBoard(stones, boardSize)
  if (board.has(boardKey(anchorPoint.row, anchorPoint.col))) {
    return null
  }

  const profile: AnchorLibertyProfile = {
    adjacent: { B: 0, W: 0, empty: 0, edge: 4 },
    groups: { B: 0, W: 0 },
    minLiberties: {}
  }
  const visitedGroups = new Set<string>()
  const validNeighbors = neighbors(anchorPoint.row, anchorPoint.col, boardSize)
  profile.adjacent.edge = 4 - validNeighbors.length

  for (const next of validNeighbors) {
    const key = boardKey(next.row, next.col)
    const color = board.get(key)
    if (!color) {
      profile.adjacent.empty += 1
      continue
    }

    profile.adjacent[color] += 1
    const group = collectLocalGroup(board, next.row, next.col, boardSize)
    const groupKey = group.map((stone) => boardKey(stone.row, stone.col)).sort().join('|')
    if (visitedGroups.has(groupKey)) continue
    visitedGroups.add(groupKey)
    profile.groups[color] += 1
    const liberties = localLibertyCount(board, group, boardSize)
    profile.minLiberties[color] = Math.min(profile.minLiberties[color] ?? liberties, liberties)
  }

  return profile
}

function swappedColor(color: 'B' | 'W'): 'B' | 'W' {
  return color === 'B' ? 'W' : 'B'
}

function profileValue(profile: AnchorLibertyProfile, color: 'B' | 'W', field: 'adjacent' | 'groups' | 'minLiberties', swapColors: boolean): number | undefined {
  const sourceColor = swapColors ? swappedColor(color) : color
  return field === 'minLiberties' ? profile.minLiberties[sourceColor] : profile[field][sourceColor]
}

function closeCountScore(queryValue: number | undefined, expectedValue: number | undefined, exactScore: number, nearScore: number): number {
  const queryCount = queryValue ?? 0
  const expectedCount = expectedValue ?? 0
  if (queryCount === expectedCount) return exactScore
  if (Math.abs(queryCount - expectedCount) <= 1) return nearScore
  return 0
}

function anchorProfileScore(queryProfile: AnchorLibertyProfile, problemProfile: AnchorLibertyProfile, swapColors: boolean): number {
  let score = 0
  score += closeCountScore(queryProfile.adjacent.empty, problemProfile.adjacent.empty, 2, 1)
  score += closeCountScore(queryProfile.adjacent.edge, problemProfile.adjacent.edge, 2, 1)
  for (const color of ['B', 'W'] as const) {
    score += closeCountScore(queryProfile.adjacent[color], profileValue(problemProfile, color, 'adjacent', swapColors), 2, 1)
    score += closeCountScore(queryProfile.groups[color], profileValue(problemProfile, color, 'groups', swapColors), 1, 0)
    const queryLiberties = queryProfile.minLiberties[color]
    const expectedLiberties = profileValue(problemProfile, color, 'minLiberties', swapColors)
    if (queryLiberties !== undefined || expectedLiberties !== undefined) {
      score += closeCountScore(queryLiberties, expectedLiberties, 2, 1)
    }
  }
  return score
}

function localShapeGeometryMatch(problem: ProblemEntry, query: KnowledgeMatchQuery): GeometryMatchResult | null {
  const queryAnchors = uniqueValidPoints([
    query.playedMove,
    ...(query.candidateMoves ?? []).slice(0, 6),
    ...(query.principalVariation ?? []).slice(0, 4),
    ...(query.localWindows ?? []).map((window) => window.anchor)
  ], query.boardSize)
  const problemAnchors = uniqueValidPoints(problem.correctMoves.slice(0, 2).map((move) => move.move), query.boardSize)
  if (queryAnchors.length === 0 || problemAnchors.length === 0) return null

  let best: GeometryMatchResult | null = null
  for (const queryAnchor of queryAnchors) {
    const queryStones = queryStonesForAnchor(query, queryAnchor)
    const queryProfile = anchorLibertyProfile(queryStones, queryAnchor, query.boardSize)
    if (!queryProfile) continue
    const queryRelatives = stonesNearAnchor(queryStones, queryAnchor, query.boardSize)
    if (queryRelatives.length < 3) continue
    const queryKeys = new Set(queryRelatives.map((stone) => stoneKey(stone, (dx, dy) => [dx, dy], false)))

    for (const problemAnchor of problemAnchors) {
      const problemProfile = anchorLibertyProfile(problem.initialStones, problemAnchor, query.boardSize)
      if (!problemProfile) continue
      const problemRelatives = stonesNearAnchor(problem.initialStones, problemAnchor, query.boardSize)
      if (problemRelatives.length < 3) continue

      for (const transform of LOCAL_SHAPE_TRANSFORMS) {
        for (const swapColors of [false, true]) {
          let matched = 0
          const transformedKeys = new Set(problemRelatives.map((stone) => stoneKey(stone, transform.apply, swapColors)))
          for (const key of transformedKeys) {
            if (queryKeys.has(key)) {
              matched += 1
            }
          }
          const expected = transformedKeys.size
          const rawRatio = expected > 0 ? matched / expected : 0
          const libertyScore = anchorProfileScore(queryProfile, problemProfile, swapColors)
          const profileRatio = Math.min(1, libertyScore / 12)
          const ratio = (swapColors ? 0.92 : 1) * (rawRatio * 0.76 + profileRatio * 0.24)
          if (matched < 3 || ratio < 0.55 || libertyScore < 3) continue

          const score = Math.round(ratio * 24) + Math.min(matched, 8) + libertyScore
          const candidate: GeometryMatchResult = {
            score,
            ratio,
            matched,
            expected,
            libertyScore,
            transform: transform.name,
            colorMode: swapColors ? 'color-swapped' : 'same-color',
            queryAnchor,
            problemAnchor
          }
          if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.ratio > best.ratio)) {
            best = candidate
          }
        }
      }
    }
  }

  return best
}

function confidence(score: number, exactish = false): KnowledgeMatchConfidence {
  if (exactish && score >= 28) return 'exact'
  if (score >= 21) return 'strong'
  if (score >= 12) return 'partial'
  return 'weak'
}

function capConfidence(value: KnowledgeMatchConfidence, max: KnowledgeMatchConfidence): KnowledgeMatchConfidence {
  return CONFIDENCE_RANK[value] > CONFIDENCE_RANK[max] ? max : value
}

function sortMatchScore(match: KnowledgeMatch): number {
  const intentBonus = match.reason.some((reason) => reason.startsWith('explicit-intent:')) ? 8 : 0
  const exactEvidenceBonus = match.reason.some((reason) => reason.startsWith('answer-overlap') || reason.startsWith('sequence-overlap')) ? 4 : 0
  const geometryBonus = match.reason.some((reason) => reason.startsWith('geometry:')) ? 6 : 0
  return CONFIDENCE_RANK[match.confidence] * 1000 + match.score + intentBonus + exactEvidenceBonus + geometryBonus
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
  const tokenSet = new Set(tags.map((tag) => tag.toLowerCase()).filter((tag) => !BROAD_TRAINING_TAGS.has(tag)))
  if (tokenSet.size === 0) {
    return []
  }
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
  const explicitJosekiIntent = features.explicitIntentTypes.has('joseki')
  const explicitTacticalIntent = features.explicitIntentTypes.has('life_death') || features.explicitIntentTypes.has('tesuji')
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
  if (explicitJosekiIntent) {
    score += 10
    reasons.push('explicit-intent:joseki')
  } else if (features.intentTypes.has('joseki')) {
    score += 3
    reasons.push('context-intent:joseki')
  }
  score += addOverlapScore([...line.tags, line.title, line.family], features.tokens, 4, reasons, 'text')
  score += featureOverlap(line.normalizedFeatures, new Set([...features.moveFeatures, ...features.candidateFeatures, ...features.pvFeatures]), 4, reasons, 'shape')
  const overlap = sequenceOverlap(line.relativeSequence, features.allPoints, reasons)
  score += overlap * (features.phase === 'opening' || explicitJosekiIntent ? 5 : 2)
  if ((query.candidateMoves ?? []).includes(line.relativeSequence[1])) {
    score += 5
    reasons.push('katago-candidate-prefix')
  }
  if (query.moveNumber <= 70) {
    score += 2
    reasons.push('opening-timing')
  }
  if (features.phase !== 'opening' && !explicitJosekiIntent) {
    score -= explicitTacticalIntent ? 22 : 10
    reasons.push(explicitTacticalIntent ? 'penalty:tactical-query' : 'penalty:non-opening-joseki-context')
  }
  if (score < 8) return null
  const exactish = overlap >= 3 && (features.phase === 'opening' || explicitJosekiIntent) && !explicitTacticalIntent
  const rawConfidence = confidence(score, exactish)
  const confidenceValue = features.phase !== 'opening' && !explicitJosekiIntent
    ? capConfidence(rawConfidence, 'partial')
    : rawConfidence
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
    relatedProblems: relatedProblemsForTags(library, line.tags, 3)
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
  const explicitTypeIntent = features.explicitIntentTypes.has(type)
  const contextualTypeIntent = features.intentTypes.has(type)
  const explicitJosekiOnly = features.explicitIntentTypes.has('joseki') && !features.explicitIntentTypes.has('life_death') && !features.explicitIntentTypes.has('tesuji')
  if (problem.region === features.region) {
    score += 5
    reasons.push(`region:${problem.region}`)
  }
  if ((query.lossScore ?? 0) >= 2 || ['mistake', 'blunder'].includes(String(query.judgement))) {
    score += type === 'life_death' ? 4 : 3
    reasons.push('katago-loss')
  }
  if (explicitTypeIntent) {
    score += 12
    reasons.push(`explicit-intent:${type}`)
  } else if (contextualTypeIntent) {
    score += 5
    reasons.push(`context-intent:${type}`)
  }
  if (explicitJosekiOnly) {
    score -= 8
    reasons.push('penalty:joseki-query')
  }
  const textValues = [...problem.tags, problem.title, problem.objective]
  const specificTextHit = hasSpecificTextHit(textValues, features.explicitTokens)
  if (specificTextHit) {
    score += 6
    reasons.push(`specific-text:${type}`)
  }
  score += addOverlapScore(textValues, features.tokens, 4, reasons, 'text')
  score += featureOverlap(problem.tags, new Set([...features.moveFeatures, ...features.candidateFeatures, ...features.pvFeatures]), 3, reasons, 'shape')
  const answerOverlap = sequenceOverlap(problem.correctMoves.map((move) => move.move), features.allPoints, reasons)
  score += answerOverlap * 12
  const geometry = localShapeGeometryMatch(problem, query)
  if (geometry) {
    score += geometry.score
    reasons.push(`geometry:${geometry.transform}:${geometry.colorMode}:${geometry.matched}/${geometry.expected}`)
    reasons.push(`liberties:${geometry.libertyScore}`)
    if (geometry.ratio >= 0.72) {
      score += 6
      reasons.push('geometry-strong-local-shape')
    }
  }
  const answerPoints = new Set(problem.correctMoves.map((move) => move.move))
  if (query.playedMove && answerPoints.has(query.playedMove)) {
    score += 5
    reasons.push('answer-played')
  }
  if ((query.candidateMoves ?? []).some((move) => answerPoints.has(move))) {
    score += 7
    reasons.push('answer-candidate')
  }
  if ((query.principalVariation ?? []).some((move) => answerPoints.has(move))) {
    score += 5
    reasons.push('answer-pv')
  }
  if (type === 'life_death' && features.moveFeatures.has('eye-shape')) {
    score += 5
    reasons.push('eye-shape')
  }
  if (type === 'tesuji' && (features.moveFeatures.has('contact') || features.moveFeatures.has('jump'))) {
    score += 3
    reasons.push('local-tesuji-relation')
  }
  if (score < 8) return null
  const exactish = (answerOverlap >= 1 && specificTextHit && (explicitTypeIntent || score >= 24)) || Boolean(geometry && geometry.ratio >= 0.72 && geometry.matched >= 3)
  const confidenceValue = confidence(score, exactish)
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
    .sort((a, b) => sortMatchScore(b) - sortMatchScore(a) || b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, query.maxResults ?? 8)
}

interface RecommendedProblemOptions {
  includeWeakFallback?: boolean
  includeJosekiFallback?: boolean
  includeDrillFallback?: boolean
}

function collectRelatedProblems(
  matches: KnowledgeMatch[],
  limit: number,
  predicate: (match: KnowledgeMatch) => boolean,
  seen: Set<string>,
  problems: RecommendedProblem[]
): boolean {
  for (const match of matches) {
    if (!predicate(match)) continue
    for (const problem of match.relatedProblems) {
      if (!seen.has(problem.id)) {
        seen.add(problem.id)
        problems.push(problem)
      }
      if (problems.length >= limit) return true
    }
  }
  return false
}

export function recommendedProblemsFromMatches(matches: KnowledgeMatch[], limit = 3, options: RecommendedProblemOptions = {}): RecommendedProblem[] {
  const seen = new Set<string>()
  const problems: RecommendedProblem[] = []
  if (collectRelatedProblems(matches, limit, (match) => match.confidence !== 'weak' && match.matchType !== 'joseki', seen, problems)) return problems
  if (options.includeWeakFallback) {
    if (collectRelatedProblems(matches, limit, (match) => match.confidence === 'weak' && match.matchType !== 'joseki', seen, problems)) return problems
  }
  if (options.includeJosekiFallback) {
    if (collectRelatedProblems(matches, limit, (match) => match.matchType === 'joseki', seen, problems)) return problems
  }
  if (options.includeDrillFallback) {
    for (const match of matches) {
      const drill = match.teachingPayload.drills.find(Boolean)
      if (!drill) continue
      const id = `drill-${match.id}`
      if (seen.has(id)) continue
      seen.add(id)
      problems.push({
        id,
        title: `${match.title}：专项训练`,
        problemType: match.matchType === 'life_death' ? 'life_death' : 'tesuji',
        difficulty: match.confidence === 'exact' || match.confidence === 'strong' ? 'standard' : 'review',
        objective: match.teachingPayload.correctIdea || match.teachingPayload.summary,
        firstHint: match.teachingPayload.memoryCue || match.teachingPayload.recognition,
        answerSummary: drill,
        tags: [match.matchType, ...match.reason.slice(0, 4)]
      })
      if (problems.length >= limit) return problems
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
