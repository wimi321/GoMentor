import type { KataGoMoveAnalysis, MoveRangeReviewSummary } from '@main/lib/types'
import { MOVE_RANGE_KEY_MOVE_LIMIT, type ParsedMoveRange, selectKeyMoveNumbers } from '@shared/moveRange'

function round(value: number | undefined, digits = 2): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function summarizeMoveRangeAnalyses(
  analyses: KataGoMoveAnalysis[],
  range: ParsedMoveRange,
  maxKeyMoves = MOVE_RANGE_KEY_MOVE_LIMIT
): MoveRangeReviewSummary {
  const sorted = analyses
    .filter((analysis) => analysis.moveNumber >= range.start && analysis.moveNumber <= range.end)
    .sort((a, b) => a.moveNumber - b.moveNumber)
  const byLoss = [...sorted]
    .filter((analysis) => analysis.playedMove)
    .sort((left, right) =>
      (right.playedMove?.winrateLoss ?? 0) - (left.playedMove?.winrateLoss ?? 0) ||
      (right.playedMove?.scoreLoss ?? 0) - (left.playedMove?.scoreLoss ?? 0) ||
      left.moveNumber - right.moveNumber
    )
  const keyMoveNumbers = new Set<number>([range.start, range.end])
  for (const analysis of byLoss.slice(0, Math.max(0, maxKeyMoves - 2))) {
    keyMoveNumbers.add(analysis.moveNumber)
  }
  const keyMoves = Array.from(keyMoveNumbers)
    .sort((a, b) => a - b)
    .map((moveNumber) => sorted.find((analysis) => analysis.moveNumber === moveNumber))
    .filter((analysis): analysis is KataGoMoveAnalysis => Boolean(analysis))
    .map((analysis) => ({
      moveNumber: analysis.moveNumber,
      playedMove: analysis.playedMove?.move ?? analysis.currentMove?.gtp,
      bestMove: analysis.before.topMoves[0]?.move,
      winrateLoss: round(analysis.playedMove?.winrateLoss ?? 0, 2),
      scoreLoss: round(analysis.playedMove?.scoreLoss ?? 0, 2),
      judgement: analysis.judgement,
      evidenceRefs: [
        `katago:move:${analysis.moveNumber}`,
        analysis.analysisQuality ? `analysisQuality:${analysis.analysisQuality.confidence}` : '',
        analysis.tacticalSignals?.[0]?.type ? `tactical:${analysis.tacticalSignals[0].type}` : ''
      ].filter(Boolean)
    }))
  return {
    start: range.start,
    end: range.end,
    totalMoves: sorted.length || range.end - range.start + 1,
    keyMoves,
    omittedMoves: Math.max(0, (range.end - range.start + 1) - keyMoves.length),
    analysisMethod: 'range-cache-or-quick-sweep, then key-move-focused teacher review'
  }
}

export function formatMoveRangeSummaryForPrompt(summary: MoveRangeReviewSummary | undefined): string {
  if (!summary) return '未提供区间摘要；如需区间复盘，请先调用区间工具或要求用户选择区间。'
  const lines = [
    `区间：第 ${summary.start}-${summary.end} 手，共 ${summary.totalMoves} 手。`,
    `分析方法：${summary.analysisMethod}`,
    `未逐手展开的手数：${summary.omittedMoves}`,
    '关键手：'
  ]
  for (const move of summary.keyMoves) {
    lines.push([
      `- 第 ${move.moveNumber} 手`,
      move.playedMove ? `实战 ${move.playedMove}` : '',
      move.bestMove ? `首选 ${move.bestMove}` : '',
      `胜率损失 ${round(move.winrateLoss, 1)}%`,
      `目差损失 ${round(move.scoreLoss, 1)}`,
      move.judgement ? `判断 ${move.judgement}` : '',
      move.evidenceRefs.length ? `证据 ${move.evidenceRefs.join(', ')}` : ''
    ].filter(Boolean).join('，'))
  }
  return lines.join('\n')
}

export function selectMoveNumbersForRangeRefine(summary: MoveRangeReviewSummary | undefined, range: ParsedMoveRange | undefined, maxCount = MOVE_RANGE_KEY_MOVE_LIMIT): number[] {
  return selectKeyMoveNumbers(summary, range, maxCount)
}
