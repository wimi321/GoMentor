import type {
  GameMove,
  GameRecord,
  KataGoMoveAnalysis,
  LibraryGame,
  ReleaseReadinessFlags,
  StudentProfile,
  TeacherRunResult,
  TeacherToolLog
} from '@main/lib/types'
import type { KeyMoveSummary } from '../board/KeyMoveNavigator'

const now = '2026-04-25T10:30:00.000Z'

function move(moveNumber: number, color: 'B' | 'W', gtp: string): GameMove {
  return {
    moveNumber,
    color,
    point: gtp,
    row: null,
    col: null,
    gtp,
    pass: false
  }
}

export const galleryGame: LibraryGame = {
  id: 'gallery-game-01',
  title: 'Sprint 7 UI Gallery',
  event: 'KataSensei Demo',
  black: '小明',
  white: 'AI老师示例',
  result: 'B+R',
  date: '2026-04-25',
  source: 'fox',
  sourceLabel: 'Fox',
  filePath: '/mock/gallery.sgf',
  createdAt: now
}

export const galleryRecord: GameRecord = {
  game: galleryGame,
  boardSize: 19,
  komi: '7.5',
  handicap: '',
  moves: [
    move(1, 'B', 'D4'),
    move(2, 'W', 'Q16'),
    move(3, 'B', 'Q4'),
    move(4, 'W', 'D16'),
    move(5, 'B', 'C14'),
    move(6, 'W', 'C17'),
    move(7, 'B', 'F16'),
    move(8, 'W', 'D10'),
    move(9, 'B', 'R14'),
    move(10, 'W', 'O17'),
    move(11, 'B', 'R6'),
    move(12, 'W', 'N4'),
    move(13, 'B', 'P3'),
    move(14, 'W', 'M3'),
    move(15, 'B', 'K4'),
    move(16, 'W', 'C6'),
    move(17, 'B', 'D6'),
    move(18, 'W', 'C5'),
    move(19, 'B', 'E6'),
    move(20, 'W', 'F3'),
    move(21, 'B', 'Q10'),
    move(22, 'W', 'N16'),
    move(23, 'B', 'K16'),
    move(24, 'W', 'J17')
  ]
}

export const galleryAnalysis: KataGoMoveAnalysis = {
  gameId: galleryGame.id,
  moveNumber: 24,
  boardSize: 19,
  currentMove: galleryRecord.moves[23],
  before: {
    winrate: 0.56,
    scoreLead: 3.1,
    topMoves: [
      { move: 'Q10', winrate: 0.61, scoreLead: 4.8, visits: 1824, order: 1, prior: 0.21, pv: ['Q10', 'Q8', 'O10'] },
      { move: 'K16', winrate: 0.57, scoreLead: 3.6, visits: 1096, order: 2, prior: 0.16, pv: ['K16', 'N17', 'J14'] },
      { move: 'C10', winrate: 0.53, scoreLead: 1.5, visits: 684, order: 3, prior: 0.11, pv: ['C10', 'D8'] },
      { move: 'R9', winrate: 0.49, scoreLead: -0.5, visits: 276, order: 4, prior: 0.08, pv: ['R9', 'Q8'] },
      { move: 'H3', winrate: 0.47, scoreLead: -1.1, visits: 164, order: 5, prior: 0.05, pv: ['H3', 'J3'] }
    ]
  },
  after: {
    winrate: 0.43,
    scoreLead: -1.8,
    topMoves: [
      { move: 'Q10', winrate: 0.60, scoreLead: 4.4, visits: 2410, order: 1, prior: 0.19, pv: ['Q10', 'Q8', 'O10'] },
      { move: 'K16', winrate: 0.55, scoreLead: 2.7, visits: 1488, order: 2, prior: 0.14, pv: ['K16', 'N17'] },
      { move: 'R9', winrate: 0.51, scoreLead: 0.2, visits: 744, order: 3, prior: 0.1, pv: ['R9', 'Q8'] },
      { move: 'C10', winrate: 0.48, scoreLead: -0.7, visits: 386, order: 4, prior: 0.07, pv: ['C10', 'D8'] }
    ]
  },
  playedMove: {
    move: 'J17',
    winrate: 0.43,
    scoreLead: -1.8,
    winrateLoss: 13,
    scoreLoss: 4.9
  },
  judgement: 'mistake'
}

export const galleryEvaluations: KataGoMoveAnalysis[] = Array.from({ length: 72 }, (_, index) => {
  const moveNumber = index + 1
  const drift = Math.sin(moveNumber / 6) * 0.09 + Math.cos(moveNumber / 13) * 0.05
  const mistake = moveNumber === 24 ? -0.13 : moveNumber === 45 ? 0.11 : moveNumber === 61 ? -0.18 : 0
  const winrate = Math.max(0.08, Math.min(0.92, 0.52 + drift + mistake))
  const loss = moveNumber === 24 ? 0.13 : moveNumber === 45 ? 0.09 : moveNumber === 61 ? 0.18 : Math.max(0, Math.sin(moveNumber) * 0.018)
  return {
    ...galleryAnalysis,
    moveNumber,
    currentMove: galleryRecord.moves[(moveNumber - 1) % galleryRecord.moves.length],
    before: {
      ...galleryAnalysis.before,
      winrate: Math.max(0.08, Math.min(0.92, winrate + loss)),
      scoreLead: (winrate - 0.5) * 18
    },
    after: {
      ...galleryAnalysis.after,
      winrate,
      scoreLead: (winrate - 0.5) * 18
    },
    playedMove: {
      move: galleryRecord.moves[(moveNumber - 1) % galleryRecord.moves.length]?.gtp ?? 'D4',
      winrate,
      scoreLead: (winrate - 0.5) * 18,
      winrateLoss: loss * 100,
      scoreLoss: loss * 22
    },
    judgement: loss >= 0.16 ? 'blunder' : loss >= 0.08 ? 'mistake' : loss >= 0.04 ? 'inaccuracy' : 'good_move'
  }
})

export const galleryKeyMoves: KeyMoveSummary[] = [
  {
    moveNumber: 24,
    color: 'W',
    label: 'J17 -> Q10',
    gtp: 'J17',
    reason: '白棋补角过小，黑棋全局大场被放过，胜率损失约 13%。',
    winrateDrop: 0.13,
    scoreLoss: 4.9,
    severity: 'mistake'
  },
  {
    moveNumber: 45,
    color: 'B',
    label: 'C10',
    gtp: 'C10',
    reason: '黑棋在左边强行分断，局部有利但全局效率偏低。',
    winrateDrop: 0.09,
    scoreLoss: 3.2,
    severity: 'mistake'
  },
  {
    moveNumber: 61,
    color: 'W',
    label: 'R9',
    gtp: 'R9',
    reason: '白棋错过先手补强，右边转折后目差迅速扩大。',
    winrateDrop: 0.18,
    scoreLoss: 6.1,
    severity: 'blunder'
  }
]

export const galleryStudent: StudentProfile = {
  id: 'student-gallery',
  studentId: 'student-gallery',
  name: '小明',
  displayName: '小明',
  primaryFoxNickname: 'fox_xiaoming',
  aliases: ['小明', 'fox_xiaoming'],
  createdFrom: 'fox',
  userLevel: 'intermediate',
  gamesReviewed: 18,
  weaknessStats: {
    '大场判断': 7,
    '薄棋处理': 5,
    '先手意识': 4
  },
  recentPatterns: ['中盘抢小官子', '弱棋方向不清', '优势时收束偏急'],
  trainingFocus: ['先找全局最大点', '弱棋先安定再进攻', '复盘每盘 3 个转折点'],
  recentGameIds: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'],
  commonMistakes: [{ tag: '大场判断', count: 7 }],
  trainingThemes: ['全局方向', '攻防次序'],
  typicalMoves: [],
  updatedAt: now,
  createdAt: now,
  lastAnalyzedAt: now
}

const toolLogs: TeacherToolLog[] = [
  {
    id: 'tool-1',
    name: 'katago.analyzePosition',
    label: 'KataGo 当前局面分析',
    status: 'done',
    detail: '已读取第 24 手，首选 Q10，搜索 2410 visits。',
    startedAt: now,
    endedAt: now
  },
  {
    id: 'tool-2',
    name: 'knowledge.searchLocal',
    label: '检索本地教学卡',
    status: 'done',
    detail: '命中「大场优先级」「弱棋方向」等 3 张卡。',
    startedAt: now,
    endedAt: now
  },
  {
    id: 'tool-3',
    name: 'board.captureTeachingImage',
    label: '生成讲解棋盘截图',
    status: 'done',
    detail: '已标注最后一手、首选点和关键手。',
    startedAt: now,
    endedAt: now
  }
]

export const galleryTeacherResult: TeacherRunResult = {
  id: 'teacher-gallery',
  mode: 'current-move',
  title: '第 24 手分析',
  markdown: '白棋这手偏小，主要问题不是局部亏损，而是放过右边全局最大点。',
  toolLogs,
  analysis: galleryAnalysis,
  knowledge: [],
  studentProfile: galleryStudent,
  structured: {
    taskType: 'current-move',
    headline: '这手最大的问题是方向偏小：该抢右边大场，而不是继续补角。',
    summary: '第 24 手白棋 J17 偏保守，KataGo 首选 Q10。它让黑棋获得主动，胜率损失约 13%，目差损失约 4.9 目。',
    keyMistakes: [
      {
        moveNumber: 24,
        color: 'W',
        played: 'J17',
        recommended: 'Q10',
        errorType: '大场判断',
        severity: 'mistake',
        evidence: 'KataGo: Q10 胜率 60%，实战 J17 后黑胜率升高。',
        explanation: '白棋已经基本安定，下一步应该抢全局最大点。继续在角上补棋，效率不够。'
      },
      {
        moveNumber: 45,
        color: 'B',
        played: 'C10',
        recommended: 'K16',
        errorType: '攻击方向',
        severity: 'inaccuracy',
        evidence: '目差损失约 3.2 目。',
        explanation: '攻击不是为了吃棋，而是为了借攻击抢到外势和先手。'
      }
    ],
    correctThinking: ['先问：我这块棋安全吗？', '再问：全局最大点在哪里？', '最后比较：补棋和抢大场谁更急。'],
    drills: ['每天 8 题大场优先级判断。', '复盘最近 3 盘，每盘只标 3 个最大转折点。', '下棋时每 20 手暂停一次，写下当前全局最大点。'],
    followupQuestions: ['为什么 Q10 比补角大？', '这盘还有哪些类似方向问题？', '按我的画像安排一周训练。'],
    markdown: '',
    knowledgeCardIds: ['opening-big-point', 'weak-group-direction'],
    profileUpdates: {
      errorTypes: ['大场判断', '先手意识'],
      patterns: ['优势时继续补小棋'],
      trainingFocus: ['全局方向', '大场优先级']
    }
  }
}

export const galleryReadinessFlags: ReleaseReadinessFlags = {
  automationReady: true,
  assetsReady: true,
  installersReady: true,
  signingReady: false,
  windowsSmokeReady: false,
  visualQaReady: false,
  publicBetaReady: false
}
