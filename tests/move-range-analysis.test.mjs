import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMoveRangeProgression } from '../src/shared/moveRangeAnalysis.ts'

// --- Happy path: full range with absolute values ---

test('progression computes start/end winrate and scoreLead', () => {
  const items = [
    { moveNumber: 10, blackWinrateBefore: 55, blackScoreLeadBefore: 2.0, blackWinrateAfter: 52, blackScoreLeadAfter: 1.0, winrateLoss: 3 },
    { moveNumber: 11, blackWinrateBefore: 52, blackScoreLeadBefore: 1.0, blackWinrateAfter: 48, blackScoreLeadAfter: -1.5, winrateLoss: 4 },
    { moveNumber: 12, blackWinrateBefore: 48, blackScoreLeadBefore: -1.5, blackWinrateAfter: 50, blackScoreLeadAfter: 0.5, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.equal(result.blackWinrateStart, 55)
  assert.equal(result.blackWinrateEnd, 50)
  assert.equal(result.blackScoreLeadStart, 2)
  assert.equal(result.blackScoreLeadEnd, 0.5)
})

test('progression computes total change', () => {
  const items = [
    { moveNumber: 1, blackWinrateBefore: 50, blackScoreLeadBefore: 0, blackWinrateAfter: 55, blackScoreLeadAfter: 3, winrateLoss: 0 },
    { moveNumber: 2, blackWinrateBefore: 55, blackScoreLeadBefore: 3, blackWinrateAfter: 60, blackScoreLeadAfter: 5, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.equal(result.totalBlackWinrateChange, 10)
  assert.equal(result.totalBlackScoreLeadChange, 5)
})

test('progression computes max single move swing', () => {
  const items = [
    { moveNumber: 1, blackWinrateBefore: 50, blackScoreLeadBefore: 0, blackWinrateAfter: 55, blackScoreLeadAfter: 2, winrateLoss: 5 },
    { moveNumber: 2, blackWinrateBefore: 55, blackScoreLeadBefore: 2, blackWinrateAfter: 40, blackScoreLeadAfter: -5, winrateLoss: 15 },
    { moveNumber: 3, blackWinrateBefore: 40, blackScoreLeadBefore: -5, blackWinrateAfter: 42, blackScoreLeadAfter: -4, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.equal(result.maxSingleMoveBlackWinrateSwing, 15)
})

test('swingMoves includes only moves with winrateLoss > 2', () => {
  const items = [
    { moveNumber: 10, blackWinrateBefore: 50, blackWinrateAfter: 55, winrateLoss: 5 },
    { moveNumber: 11, blackWinrateBefore: 55, blackWinrateAfter: 54, winrateLoss: 1 },
    { moveNumber: 12, blackWinrateBefore: 54, blackWinrateAfter: 48, winrateLoss: 6 },
    { moveNumber: 13, blackWinrateBefore: 48, blackWinrateAfter: 47.5, winrateLoss: 0.5 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.deepEqual(result.swingMoves, [
    { moveNumber: 12, winrateLoss: 6 },
    { moveNumber: 10, winrateLoss: 5 }
  ])
})

test('swingMoves is empty when all moves are good (loss <= 2)', () => {
  const items = [
    { moveNumber: 1, blackWinrateBefore: 50, blackWinrateAfter: 51, winrateLoss: 1 },
    { moveNumber: 2, blackWinrateBefore: 51, blackWinrateAfter: 52, winrateLoss: 0.5 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.deepEqual(result.swingMoves, [])
})

test('swingMoves caps at 5 entries sorted by loss descending', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    moveNumber: i + 1,
    blackWinrateBefore: 50,
    blackWinrateAfter: 40,
    winrateLoss: 10 - i
  }))
  const result = buildMoveRangeProgression(items)
  assert.equal(result.swingMoves.length, 5)
  assert.equal(result.swingMoves[0].winrateLoss, 10)
  assert.equal(result.swingMoves[4].winrateLoss, 6)
})

// --- Edge cases ---

test('empty array returns null', () => {
  assert.equal(buildMoveRangeProgression([]), null)
})

test('items without absolute values returns null', () => {
  const items = [
    { moveNumber: 1, winrateLoss: 5 },
    { moveNumber: 2, winrateLoss: 3 }
  ]
  assert.equal(buildMoveRangeProgression(items), null)
})

test('single item returns valid progression', () => {
  const items = [
    { moveNumber: 5, blackWinrateBefore: 60, blackScoreLeadBefore: 3, blackWinrateAfter: 55, blackScoreLeadAfter: 1, winrateLoss: 5 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.equal(result.blackWinrateStart, 60)
  assert.equal(result.blackWinrateEnd, 55)
  assert.equal(result.totalBlackWinrateChange, -5)
  assert.equal(result.totalBlackScoreLeadChange, -2)
  assert.deepEqual(result.swingMoves, [{ moveNumber: 5, winrateLoss: 5 }])
})

// --- Coverage flags ---

test('startsAtRequestedStart=true when first item matches expected start', () => {
  const items = [
    { moveNumber: 100, blackWinrateBefore: 50, blackWinrateAfter: 55, winrateLoss: 0 },
    { moveNumber: 101, blackWinrateBefore: 55, blackWinrateAfter: 60, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items, { expectedStart: 100, expectedEnd: 110 })
  assert.equal(result.startsAtRequestedStart, true)
  assert.equal(result.endsAtRequestedEnd, false)
})

test('endsAtRequestedEnd=true when last item matches expected end', () => {
  const items = [
    { moveNumber: 100, blackWinrateBefore: 50, blackWinrateAfter: 55, winrateLoss: 0 },
    { moveNumber: 110, blackWinrateBefore: 55, blackWinrateAfter: 60, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items, { expectedStart: 100, expectedEnd: 110 })
  assert.equal(result.startsAtRequestedStart, true)
  assert.equal(result.endsAtRequestedEnd, true)
})

test('both flags false when data does not cover range endpoints', () => {
  const items = [
    { moveNumber: 105, blackWinrateBefore: 50, blackWinrateAfter: 55, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items, { expectedStart: 100, expectedEnd: 110 })
  assert.equal(result.startsAtRequestedStart, false)
  assert.equal(result.endsAtRequestedEnd, false)
})

test('flags default to true when no options provided', () => {
  const items = [
    { moveNumber: 5, blackWinrateBefore: 50, blackWinrateAfter: 55, winrateLoss: 0 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.equal(result.startsAtRequestedStart, true)
  assert.equal(result.endsAtRequestedEnd, true)
})

// --- Unordered input is sorted by moveNumber ---

test('items sorted by moveNumber regardless of input order', () => {
  const items = [
    { moveNumber: 12, blackWinrateBefore: 48, blackWinrateAfter: 50, winrateLoss: 0 },
    { moveNumber: 10, blackWinrateBefore: 55, blackWinrateAfter: 52, winrateLoss: 3 },
    { moveNumber: 11, blackWinrateBefore: 52, blackWinrateAfter: 48, winrateLoss: 4 }
  ]
  const result = buildMoveRangeProgression(items)
  assert.equal(result.blackWinrateStart, 55)
  assert.equal(result.blackWinrateEnd, 50)
})
