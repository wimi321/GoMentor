import type { KataGoMoveAnalysis, MoveRangeReviewSummary } from '@main/lib/types'
import { MOVE_RANGE_KEY_MOVE_LIMIT, type ParsedMoveRange, selectKeyMoveNumbers } from '@shared/moveRange'
import { buildMoveRangeProgression, type MoveRangeProgressionInput } from '@shared/moveRangeAnalysis'

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
      moveColor: analysis.currentMove?.color,
      playedMove: analysis.playedMove?.move ?? analysis.currentMove?.gtp,
      bestMove: analysis.before.topMoves[0]?.move,
      blackWinrateBefore: analysis.before.winrate,
      blackScoreLeadBefore: analysis.before.scoreLead,
      blackWinrateAfter: analysis.after.winrate,
      blackScoreLeadAfter: analysis.after.scoreLead,
      winrateLoss: round(analysis.playedMove?.winrateLoss ?? 0, 2),
      scoreLoss: round(analysis.playedMove?.scoreLoss ?? 0, 2),
      judgement: analysis.judgement,
      evidenceRefs: [
        `katago:move:${analysis.moveNumber}`,
        analysis.analysisQuality ? `analysisQuality:${analysis.analysisQuality.confidence}` : '',
        analysis.tacticalSignals?.[0]?.type ? `tactical:${analysis.tacticalSignals[0].type}` : ''
      ].filter(Boolean)
    }))

  const progressionInputs: MoveRangeProgressionInput[] = sorted.map((analysis) => ({
    moveNumber: analysis.moveNumber,
    blackWinrateBefore: analysis.before.winrate,
    blackScoreLeadBefore: analysis.before.scoreLead,
    blackWinrateAfter: analysis.after.winrate,
    blackScoreLeadAfter: analysis.after.scoreLead,
    winrateLoss: analysis.playedMove?.winrateLoss
  }))
  const progression = buildMoveRangeProgression(progressionInputs, {
    expectedStart: range.start,
    expectedEnd: range.end
  }) ?? undefined

  return {
    start: range.start,
    end: range.end,
    totalMoves: sorted.length || range.end - range.start + 1,
    keyMoves,
    omittedMoves: Math.max(0, (range.end - range.start + 1) - keyMoves.length),
    analysisMethod: 'range-cache-or-quick-sweep, then key-move-focused teacher review',
    progression
  }
}

export function formatMoveRangeSummaryForPrompt(summary: MoveRangeReviewSummary | undefined): string {
  if (!summary) return '未提供区间摘要；如需区间复盘，请先调用区间工具或要求用户选择区间。'
  const lines = [
    `区间：第 ${summary.start}-${summary.end} 手，共 ${summary.totalMoves} 手。`,
    `分析方法：${summary.analysisMethod}`,
    `未逐手展开的手数：${summary.omittedMoves}`
  ]

  const p = summary.progression
  if (p) {
    const coverageOk = p.startsAtRequestedStart && p.endsAtRequestedEnd
    const header = coverageOk ? '走势概要：' : '已分析数据走势：'
    lines.push('', header)

    if (typeof p.blackWinrateStart === 'number' && typeof p.blackWinrateEnd === 'number') {
      const change = typeof p.totalBlackWinrateChange === 'number'
        ? `（${p.totalBlackWinrateChange >= 0 ? '+' : ''}${round(p.totalBlackWinrateChange, 1)}%）`
        : ''
      lines.push(`黑棋胜率：${round(p.blackWinrateStart, 1)}% → ${round(p.blackWinrateEnd, 1)}%${change}`)
    }
    if (typeof p.blackScoreLeadStart === 'number' && typeof p.blackScoreLeadEnd === 'number') {
      const change = typeof p.totalBlackScoreLeadChange === 'number'
        ? `（${p.totalBlackScoreLeadChange >= 0 ? '+' : ''}${round(p.totalBlackScoreLeadChange, 1)}）`
        : ''
      lines.push(`目差：${round(p.blackScoreLeadStart, 1)} → ${round(p.blackScoreLeadEnd, 1)}${change}`)
    }
    if (typeof p.maxSingleMoveBlackWinrateSwing === 'number') {
      lines.push(`单手最大胜率波动：${round(p.maxSingleMoveBlackWinrateSwing, 1)}%`)
    }
    if (p.swingMoves.length) {
      lines.push(`关键波动手：${p.swingMoves.map((m: { moveNumber: number; winrateLoss: number }) => `第 ${m.moveNumber} 手（loss ${round(m.winrateLoss, 1)}%）`).join('、')}`)
    }
  }

  lines.push('', '关键手：')
  for (const move of summary.keyMoves) {
    const parts = [
      `- 第 ${move.moveNumber} 手`,
      move.moveColor ? `(${move.moveColor})` : '',
      move.playedMove ? `实战 ${move.playedMove}` : '',
      move.bestMove ? `首选 ${move.bestMove}` : ''
    ]
    if (typeof move.blackWinrateBefore === 'number' && typeof move.blackWinrateAfter === 'number') {
      parts.push(`胜率 ${round(move.blackWinrateBefore, 1)}%→${round(move.blackWinrateAfter, 1)}%（损失 ${round(move.winrateLoss, 1)}%）`)
    } else {
      parts.push(`胜率损失 ${round(move.winrateLoss, 1)}%`)
    }
    if (typeof move.blackScoreLeadBefore === 'number' && typeof move.blackScoreLeadAfter === 'number') {
      parts.push(`目差 ${round(move.blackScoreLeadBefore, 1)}→${round(move.blackScoreLeadAfter, 1)}（损失 ${round(move.scoreLoss, 1)}）`)
    } else {
      parts.push(`目差损失 ${round(move.scoreLoss, 1)}`)
    }
    if (move.judgement) parts.push(`判断 ${move.judgement}`)
    if (move.evidenceRefs.length) parts.push(`证据 ${move.evidenceRefs.join(', ')}`)
    lines.push(parts.filter(Boolean).join('，'))
  }
  return lines.join('\n')
}

export function selectMoveNumbersForRangeRefine(summary: MoveRangeReviewSummary | undefined, range: ParsedMoveRange | undefined, maxCount = MOVE_RANGE_KEY_MOVE_LIMIT): number[] {
  return selectKeyMoveNumbers(summary, range, maxCount)
}
