export interface MoveRangeProgressionInput {
  moveNumber: number
  blackWinrateBefore?: number
  blackScoreLeadBefore?: number
  blackWinrateAfter?: number
  blackScoreLeadAfter?: number
  winrateLoss?: number
}

export interface MoveRangeProgressionOptions {
  expectedStart?: number
  expectedEnd?: number
}

export interface MoveRangeProgression {
  blackWinrateStart?: number
  blackWinrateEnd?: number
  blackScoreLeadStart?: number
  blackScoreLeadEnd?: number
  totalBlackWinrateChange?: number
  totalBlackScoreLeadChange?: number
  maxSingleMoveBlackWinrateSwing?: number
  swingMoves: Array<{ moveNumber: number; winrateLoss: number }>
  startsAtRequestedStart?: boolean
  endsAtRequestedEnd?: boolean
}

export function buildMoveRangeProgression(
  items: MoveRangeProgressionInput[],
  options?: MoveRangeProgressionOptions
): MoveRangeProgression | null {
  if (!items.length) return null

  const withAbsolute = items
    .filter((item) => typeof item.blackWinrateBefore === 'number')
    .sort((a, b) => a.moveNumber - b.moveNumber)

  if (!withAbsolute.length) return null

  const first = withAbsolute[0]
  const last = withAbsolute[withAbsolute.length - 1]

  const blackWinrateStart = first.blackWinrateBefore
  const blackScoreLeadStart = first.blackScoreLeadBefore
  const blackWinrateEnd = last.blackWinrateAfter
  const blackScoreLeadEnd = last.blackScoreLeadAfter

  const totalBlackWinrateChange =
    typeof blackWinrateEnd === 'number' && typeof blackWinrateStart === 'number'
      ? round2(blackWinrateEnd - blackWinrateStart)
      : undefined
  const totalBlackScoreLeadChange =
    typeof blackScoreLeadEnd === 'number' && typeof blackScoreLeadStart === 'number'
      ? round2(blackScoreLeadEnd - blackScoreLeadStart)
      : undefined

  let maxSwing = 0
  for (const item of withAbsolute) {
    if (typeof item.blackWinrateAfter === 'number' && typeof item.blackWinrateBefore === 'number') {
      const swing = Math.abs(item.blackWinrateAfter - item.blackWinrateBefore)
      if (swing > maxSwing) maxSwing = swing
    }
  }
  const maxSingleMoveBlackWinrateSwing = maxSwing > 0 ? round2(maxSwing) : undefined

  const swingMoves = items
    .filter((item) => (item.winrateLoss ?? 0) > 2)
    .sort((a, b) => (b.winrateLoss ?? 0) - (a.winrateLoss ?? 0))
    .slice(0, 5)
    .map((item) => ({ moveNumber: item.moveNumber, winrateLoss: round2(item.winrateLoss ?? 0) }))

  const startsAtRequestedStart =
    options?.expectedStart === undefined || first.moveNumber === options.expectedStart
  const endsAtRequestedEnd =
    options?.expectedEnd === undefined || last.moveNumber === options.expectedEnd

  return {
    blackWinrateStart,
    blackWinrateEnd,
    blackScoreLeadStart,
    blackScoreLeadEnd,
    totalBlackWinrateChange,
    totalBlackScoreLeadChange,
    maxSingleMoveBlackWinrateSwing,
    swingMoves,
    startsAtRequestedStart,
    endsAtRequestedEnd
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
