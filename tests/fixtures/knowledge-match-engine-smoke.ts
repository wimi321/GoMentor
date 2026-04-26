import { searchKnowledgeMatchEngine, recommendedProblemsFromMatches } from '../../src/main/services/knowledge/matchEngine'
import { fileURLToPath } from 'node:url'

const dataRoot = fileURLToPath(new URL('../../data', import.meta.url))
const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function move(moveNumber: number, color: 'B' | 'W', gtp: string) {
  return {
    moveNumber,
    color,
    point: gtp,
    row: 19 - Number(gtp.slice(1)),
    col: letters.indexOf(gtp[0]),
    gtp,
    pass: false
  }
}

function summarize(query: Parameters<typeof searchKnowledgeMatchEngine>[1]) {
  const matches = searchKnowledgeMatchEngine(dataRoot, query)
  return {
    matches: matches.slice(0, 8).map((match) => ({
      id: match.id,
      matchType: match.matchType,
      title: match.title,
      confidence: match.confidence,
      score: match.score,
      reason: match.reason
    })),
    recommendedProblems: recommendedProblemsFromMatches(matches, 3).map((problem) => ({
      id: problem.id,
      title: problem.title,
      problemType: problem.problemType
    }))
  }
}

const star33 = summarize({
  text: '分析点三三定式，看看这手是不是合适',
  moveNumber: 18,
  totalMoves: 180,
  boardSize: 19,
  recentMoves: [move(1, 'B', 'Q16'), move(2, 'W', 'R17'), move(3, 'B', 'R16'), move(4, 'W', 'Q17')],
  userLevel: 'intermediate',
  studentLevel: 'intermediate',
  playerColor: 'W',
  lossScore: 1.2,
  judgement: 'ok',
  contextTags: ['角部', '定式', '变化'],
  playedMove: 'Q17',
  candidateMoves: ['R16', 'Q17', 'P14'],
  principalVariation: ['Q16', 'R17', 'R16', 'Q17', 'P14'],
  maxResults: 8
})

const trueFalseEye = summarize({
  text: '这块棋的真眼假眼和急所在哪里',
  moveNumber: 96,
  totalMoves: 190,
  boardSize: 19,
  recentMoves: [move(91, 'B', 'D2'), move(92, 'W', 'E2'), move(93, 'B', 'C3'), move(94, 'W', 'D3')],
  userLevel: 'intermediate',
  studentLevel: 'intermediate',
  playerColor: 'W',
  lossScore: 5.8,
  judgement: 'mistake',
  contextTags: ['问题手', '急所', '价值判断'],
  playedMove: 'E2',
  candidateMoves: ['E2', 'D1', 'C2'],
  principalVariation: ['E2', 'D1', 'C2', 'E1'],
  maxResults: 8
})

const snapback = summarize({
  text: '这里有没有倒扑或者吃回的手筋',
  moveNumber: 76,
  totalMoves: 170,
  boardSize: 19,
  recentMoves: [move(72, 'B', 'C16'), move(73, 'W', 'D16'), move(74, 'B', 'C17'), move(75, 'W', 'D17')],
  userLevel: 'intermediate',
  studentLevel: 'intermediate',
  playerColor: 'B',
  lossScore: 4.1,
  judgement: 'mistake',
  contextTags: ['问题手', '急所'],
  playedMove: 'C16',
  candidateMoves: ['C16', 'D17', 'E17'],
  principalVariation: ['C16', 'D17', 'C15'],
  maxResults: 8
})

const avalanche = summarize({
  text: '这个小目大雪崩定式怎么选择',
  moveNumber: 22,
  totalMoves: 180,
  boardSize: 19,
  recentMoves: [move(1, 'B', 'Q4'), move(2, 'W', 'R6'), move(3, 'B', 'Q6'), move(4, 'W', 'P6')],
  userLevel: 'advanced',
  studentLevel: 'advanced',
  playerColor: 'B',
  lossScore: 1.8,
  judgement: 'ok',
  contextTags: ['小目', '大雪崩', '定式'],
  playedMove: 'Q6',
  candidateMoves: ['Q4', 'R6', 'Q6', 'P6', 'R5'],
  principalVariation: ['Q4', 'R6', 'Q6', 'P6', 'R5'],
  maxResults: 8
})

const plumSix = summarize({
  text: '这里是不是梅花六死活，急所在哪里',
  moveNumber: 112,
  totalMoves: 210,
  boardSize: 19,
  recentMoves: [move(108, 'B', 'C2'), move(109, 'W', 'B2'), move(110, 'B', 'C3'), move(111, 'W', 'D2')],
  userLevel: 'intermediate',
  studentLevel: 'intermediate',
  playerColor: 'B',
  lossScore: 6.4,
  judgement: 'mistake',
  contextTags: ['死活', '梅花六', '急所'],
  playedMove: 'C2',
  candidateMoves: ['C2', 'E2', 'D1'],
  principalVariation: ['C2', 'E2', 'D1'],
  maxResults: 8
})

const connectAndDie = summarize({
  text: '这里有没有接不归的手筋',
  moveNumber: 84,
  totalMoves: 180,
  boardSize: 19,
  recentMoves: [move(80, 'B', 'C3'), move(81, 'W', 'D3'), move(82, 'B', 'E3'), move(83, 'W', 'D4')],
  userLevel: 'intermediate',
  studentLevel: 'intermediate',
  playerColor: 'B',
  lossScore: 4.8,
  judgement: 'mistake',
  contextTags: ['手筋', '接不归', '气紧'],
  playedMove: 'D2',
  candidateMoves: ['D2', 'F3', 'C4'],
  principalVariation: ['D2', 'F3', 'C4'],
  maxResults: 8
})

console.log(JSON.stringify({ star33, trueFalseEye, snapback, avalanche, plumSix, connectAndDie }))
