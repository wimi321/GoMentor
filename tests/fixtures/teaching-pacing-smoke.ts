import { buildTeachingPacingAdvice } from '../../src/main/services/teacher/teachingEvidence'
import type { KataGoMoveAnalysis, KnowledgeMatch } from '../../src/main/lib/types'

function analysis(overrides: Partial<KataGoMoveAnalysis>): KataGoMoveAnalysis {
  const base: KataGoMoveAnalysis = {
    gameId: 'demo',
    moveNumber: 24,
    boardSize: 19,
    currentMove: { color: 'B', move: 24, gtp: 'Q17' },
    before: {
      winrate: 52,
      scoreLead: 1.2,
      topMoves: [
        { move: 'R16', winrate: 52, scoreLead: 1.2, visits: 420, order: 0, prior: 18, pv: ['R16', 'Q17', 'Q16', 'R17'] },
        { move: 'Q17', winrate: 50.8, scoreLead: 0.5, visits: 180, order: 1, prior: 14, pv: ['Q17', 'R16', 'R17'] }
      ]
    },
    after: {
      winrate: 50.8,
      scoreLead: 0.5,
      topMoves: []
    },
    playedMove: {
      move: 'Q17',
      winrate: 50.8,
      scoreLead: 0.5,
      visits: 180,
      rank: 2,
      source: 'candidate',
      winrateLoss: 1.2,
      scoreLoss: 0.7
    },
    judgement: 'good_move'
  }
  return { ...base, ...overrides }
}

function match(type: KnowledgeMatch['matchType'], confidence: KnowledgeMatch['confidence'], keyVariations: string[] = []): KnowledgeMatch {
  return {
    id: `${type}-${confidence}`,
    matchType: type,
    title: type,
    confidence,
    score: 100,
    reason: ['fixture'],
    applicability: 'fixture',
    teachingPayload: {
      summary: 'fixture',
      recognition: 'fixture',
      correctIdea: 'fixture',
      keyVariations,
      memoryCue: 'fixture',
      commonMistakes: [],
      drills: [],
      boundary: 'fixture',
      sourceKind: 'common-pattern'
    },
    relatedProblems: []
  }
}

const openingNormal = buildTeachingPacingAdvice(
  analysis({ moveNumber: 18, judgement: 'good_move' }),
  [match('joseki', 'exact')]
)

const josekiBranch = buildTeachingPacingAdvice(
  analysis({ moveNumber: 28, judgement: 'inaccuracy', playedMove: { ...analysis({}).playedMove!, winrateLoss: 3.2, scoreLoss: 1.1 } }),
  [match('joseki', 'partial', ['R16 应对外势', 'Q17 保角'])]
)

const middleFight = buildTeachingPacingAdvice(
  analysis({ moveNumber: 82, judgement: 'mistake', playedMove: { ...analysis({}).playedMove!, winrateLoss: 8.4, scoreLoss: 4.2 } }),
  []
)

const lowEvidence = buildTeachingPacingAdvice(
  analysis({
    before: {
      winrate: 52,
      scoreLead: 1.2,
      topMoves: [
        { move: 'R16', winrate: 52, scoreLead: 1.2, visits: 20, order: 0, prior: 18, pv: ['R16'] }
      ]
    },
    playedMove: { ...analysis({}).playedMove!, visits: 0, source: 'forced', winrateLoss: 2.4, scoreLoss: 1.0 }
  }),
  []
)

console.log(JSON.stringify({
  openingNormal,
  josekiBranch,
  middleFight,
  lowEvidence
}))
