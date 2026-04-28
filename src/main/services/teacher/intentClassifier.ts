import type { TeacherRunRequest } from '@main/lib/types'

export type TeacherIntent = 'current-move' | 'game-review' | 'batch-review' | 'training-plan' | 'open-ended'

export interface TeacherIntentClassification {
  intent: TeacherIntent
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  matchedSignals: string[]
  requestedGameCount?: number
}

type Signal = {
  intent: TeacherIntent
  weight: number
  pattern: RegExp
  label: string
  requiresGame?: boolean
}

const GAME_COUNT_PATTERN = /(?:最近|近|last|recent|past|latest|直近|최근)\s*(\d{1,2})\s*(?:盘|局|games?|対局|게임)/i

const SIGNALS: Signal[] = [
  {
    intent: 'current-move',
    weight: 6,
    requiresGame: true,
    label: 'explicit-current-move',
    pattern: /当前手|这手|这一手|本手|刚才这手|第\s*\d+\s*手|why\s+(?:this\s+)?move|this\s+move|current\s+(?:move|position)|この手|現在の手|이번\s*수|현재\s*수/i
  },
  {
    intent: 'current-move',
    weight: 5,
    requiresGame: true,
    label: 'local-why',
    pattern: /为什么.*(?:这里|这手|这一手|下这里|不下)|为何.*(?:这里|这手)|怎么.*(?:应对|走|下)|is\s+this\s+(?:good|bad)|bad\s+move|好手|恶手|错手|疑问手/i
  },
  {
    intent: 'current-move',
    weight: 3,
    requiresGame: true,
    label: 'coordinate-mentioned',
    pattern: /\b[A-HJ-T](?:1?\d|2[0-5])\b|坐标|coordinate|point/i
  },
  {
    intent: 'game-review',
    weight: 6,
    requiresGame: true,
    label: 'whole-game-review',
    pattern: /整盘|全盘|整局|本局|这盘|全局|复盘|review\s+(?:this\s+)?game|whole\s+game|full\s+review|この対局|一局全体|이번\s*대국/i
  },
  {
    intent: 'game-review',
    weight: 4,
    requiresGame: true,
    label: 'turning-point',
    pattern: /哪里.*(?:崩|输|亏|转折)|为什么.*(?:输了|崩了|被逆转)|胜负手|转折点|turning\s+point|where\s+did\s+I\s+lose|collapse/i
  },
  {
    intent: 'batch-review',
    weight: 7,
    label: 'multi-game-profile',
    pattern: /最近|近\s*\d+\s*盘|多盘|批量|常犯|画像|弱点|习惯|趋势|情况|\d+\s*盘|十盘|last\s+\d+\s+games|recent\s+games|my\s+(?:weakness|weaknesses|habits)|profile|trend|直近|複数|最近\s*\d+\s*局|최근|여러\s*판/i
  },
  {
    intent: 'batch-review',
    weight: 5,
    label: 'rank-gap',
    pattern: /和.*(?:差距|区别)|离.*(?:段|级)|提升到|升段|compare|gap|rank\s+up|level\s+up/i
  },
  {
    intent: 'training-plan',
    weight: 7,
    label: 'training-plan',
    pattern: /训练|计划|一周|每日|每天|练习|题目|作业|怎么练|训练计划|drill|practice|training\s+plan|homework|exercise|一週間|練習|훈련|연습|계획/i
  },
  {
    intent: 'training-plan',
    weight: 4,
    label: 'learning-goal',
    pattern: /提高|提升|进步|涨棋|变强|improve|study|learn|強くな|실력/i
  }
]

function requestedGameCount(prompt: string): number | undefined {
  const direct = prompt.match(GAME_COUNT_PATTERN)
  if (direct?.[1]) return Number(direct[1])
  if (/十盘|10\s*盘|ten\s+games|最近十局|최근\s*10\s*판/i.test(prompt)) return 10
  return undefined
}

function confidenceFrom(score: number, runnerUp: number): TeacherIntentClassification['confidence'] {
  if (score >= 7 && score - runnerUp >= 3) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

export function classifyTeacherIntent(request: TeacherRunRequest): TeacherIntentClassification {
  if (request.mode === 'current-move') {
    return {
      intent: 'current-move',
      confidence: 'high',
      rationale: 'front-end requested current-move mode',
      matchedSignals: ['mode=current-move']
    }
  }

  const prompt = (request.prompt ?? '').trim()
  if (!prompt) {
    return {
      intent: request.gameId ? 'game-review' : 'open-ended',
      confidence: 'low',
      rationale: 'empty prompt',
      matchedSignals: []
    }
  }

  const scores: Record<TeacherIntent, number> = {
    'current-move': 0,
    'game-review': 0,
    'batch-review': 0,
    'training-plan': 0,
    'open-ended': 0
  }
  const labels: Record<TeacherIntent, string[]> = {
    'current-move': [],
    'game-review': [],
    'batch-review': [],
    'training-plan': [],
    'open-ended': []
  }

  for (const signal of SIGNALS) {
    if (signal.requiresGame && !request.gameId) continue
    if (signal.pattern.test(prompt)) {
      scores[signal.intent] += signal.weight
      labels[signal.intent].push(signal.label)
    }
  }

  if (request.gameId && /帮我看|看看|分析一下|讲一下|help\s+me\s+(?:review|analyze)|analyse|analyze|review/i.test(prompt)) {
    scores['game-review'] += 2
    labels['game-review'].push('selected-game-general-review')
  }

  // “最近十盘 + 给训练计划” should route to a plan, not only a report.
  if (scores['training-plan'] >= 7 && scores['batch-review'] >= 5) {
    scores['training-plan'] += 2
    labels['training-plan'].push('training-overrides-profile-summary')
  }

  const ordered = (Object.entries(scores) as Array<[TeacherIntent, number]>).sort((a, b) => b[1] - a[1])
  const [winner, score] = ordered[0]
  const runnerUp = ordered[1]?.[1] ?? 0
  const count = requestedGameCount(prompt)

  if (score <= 0) {
    return {
      intent: request.gameId ? 'game-review' : 'open-ended',
      confidence: 'low',
      rationale: request.gameId ? 'no strong signal; selected game is available' : 'no strong signal and no selected game',
      matchedSignals: [],
      requestedGameCount: count
    }
  }

  return {
    intent: winner,
    confidence: confidenceFrom(score, runnerUp),
    rationale: `matched ${labels[winner].join(', ') || 'implicit'}; score=${score}; runnerUp=${runnerUp}`,
    matchedSignals: labels[winner],
    requestedGameCount: count
  }
}
