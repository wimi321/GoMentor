export interface KataGoShapeFeatureInput {
  boardSize: number
  moveNumber: number
  totalMoves: number
  playedMove?: string
  candidateMoves?: string[]
  principalVariation?: string[]
  lossScore?: number
  judgement?: string
}

export interface KataGoShapeFeature {
  id: string
  shapeType: string
  confidence: 'strong' | 'medium' | 'weak'
  score: number
  evidence: string[]
  counterEvidence: string[]
  recognition: string
  wrongThinking: string
  correctThinking: string
  drillPrompt: string
  relatedMoves: string[]
}

const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function coord(move: string | undefined, boardSize: number): { row: number; col: number } | null {
  if (!move) return null
  const match = move.trim().toUpperCase().match(/^([A-HJ-Z])(\d{1,2})$/)
  if (!match) return null
  const col = GTP_COLUMNS.slice(0, boardSize).indexOf(match[1])
  const number = Number(match[2])
  if (col < 0 || number < 1 || number > boardSize) return null
  return { row: boardSize - number, col }
}

function distance(left: { row: number; col: number } | null, right: { row: number; col: number } | null): number {
  if (!left || !right) return 99
  return Math.max(Math.abs(left.row - right.row), Math.abs(left.col - right.col))
}

function phase(input: KataGoShapeFeatureInput): 'opening' | 'middlegame' | 'endgame' {
  const ratio = input.totalMoves > 0 ? input.moveNumber / input.totalMoves : 0
  if (input.moveNumber <= 40 || ratio <= 0.2) return 'opening'
  if (ratio <= 0.72) return 'middlegame'
  return 'endgame'
}

function uniq(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).slice(0, 10)
}

export function extractKataGoShapeFeatures(input: KataGoShapeFeatureInput): KataGoShapeFeature[] {
  const actual = input.playedMove
  const best = input.candidateMoves?.[0]
  const actualPoint = coord(actual, input.boardSize)
  const bestPoint = coord(best, input.boardSize)
  const localDistance = distance(actualPoint, bestPoint)
  const scoreLoss = input.lossScore ?? 0
  const gamePhase = phase(input)
  const relatedMoves = uniq([actual, best, ...(input.principalVariation ?? []).slice(0, 6)])
  const features: KataGoShapeFeature[] = []

  if (scoreLoss >= 1.5 && localDistance <= 2 && gamePhase !== 'opening') {
    features.push({
      id: 'katago-local-candidate-shape-detail',
      shapeType: 'local_shape_detail',
      confidence: scoreLoss >= 4 ? 'strong' : 'medium',
      score: 18 + Math.min(8, scoreLoss * 2),
      evidence: [`actual/best distance=${localDistance}`, `scoreLoss=${scoreLoss.toFixed(1)}`, `phase=${gamePhase}`],
      counterEvidence: [],
      recognition: '实战手和首选手在同一局部，KataGo 认为差别主要来自棋形、气数、先后手或次序。',
      wrongThinking: '只看这里都能下，没有比较哪一手更补形、更先手或更限制对方。',
      correctThinking: '同一区域的两个候选先比较气数、连接、断点、眼形和对方最强应手。',
      drillPrompt: '遮住 AI 首选，只在这个局部列两个候选，判断哪手更先手、形更完整。',
      relatedMoves
    })
  }

  if (scoreLoss >= 1.5 && localDistance >= 6) {
    features.push({
      id: 'katago-global-vs-local-shape-choice',
      shapeType: 'local_vs_global_shape',
      confidence: scoreLoss >= 4 ? 'strong' : 'medium',
      score: 16 + Math.min(8, scoreLoss * 1.5),
      evidence: [`actual/best distance=${localDistance}`, `scoreLoss=${scoreLoss.toFixed(1)}`, `phase=${gamePhase}`],
      counterEvidence: [],
      recognition: '实战手和首选手相距很远，问题更像是全局方向、急所/大场或攻击收益，而不是单点棋形。',
      wrongThinking: '把局部形状看得太重，忽略了另一侧更急的攻防或实地转换。',
      correctThinking: '先判断哪边如果不处理会立刻变差，再判断局部补形是否真的有先手价值。',
      drillPrompt: '把棋盘分成四个区域，先选最急区域，再回头比较局部形状。',
      relatedMoves
    })
  }

  if ((input.principalVariation?.length ?? 0) >= 6 && scoreLoss >= 1) {
    features.push({
      id: 'katago-pv-supported-shape-line',
      shapeType: 'pv_supported_shape',
      confidence: (input.principalVariation?.length ?? 0) >= 8 ? 'medium' : 'weak',
      score: 12 + Math.min(6, input.principalVariation?.length ?? 0),
      evidence: [`pvLength=${input.principalVariation?.length ?? 0}`, `scoreLoss=${scoreLoss.toFixed(1)}`],
      counterEvidence: [],
      recognition: 'KataGo 给出了较长 PV，说明这个棋形判断要结合后续应手，不宜只讲第一感。',
      wrongThinking: '只看推荐点，不摆对方最强应手，容易把手筋或补形讲错。',
      correctThinking: '讲棋形时至少沿 PV 摆到双方各 2-3 手，确认收益来自哪里。',
      drillPrompt: '复盘时先摆首选 PV 前 6 手，再用一句话说出这条线的收益。',
      relatedMoves
    })
  }

  return features
}
