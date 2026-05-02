import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMoveRangeFromPrompt } from '../src/main/lib/moveRange.ts'

// --- Contextual patterns (always accepted) ---

test('Chinese: 分析第100手到第200手', () => {
  const r = parseMoveRangeFromPrompt('分析第100手到第200手')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Chinese: 100手至200手', () => {
  const r = parseMoveRangeFromPrompt('100手至200手')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Chinese: 第200手到第100手 normalizes', () => {
  const r = parseMoveRangeFromPrompt('分析第200手到第100手')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Japanese: 100手から200手', () => {
  const r = parseMoveRangeFromPrompt('100手から200手')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Japanese: 第100手から第200手', () => {
  const r = parseMoveRangeFromPrompt('第100手から第200手')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Korean: 100수부터200수', () => {
  const r = parseMoveRangeFromPrompt('100수부터200수')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('English: moves 100-200', () => {
  const r = parseMoveRangeFromPrompt('moves 100-200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('English: from move 100 to 200', () => {
  const r = parseMoveRangeFromPrompt('from move 100 to 200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('English: from 100 to 200', () => {
  const r = parseMoveRangeFromPrompt('from 100 to 200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('English: move 100 to move 200', () => {
  const r = parseMoveRangeFromPrompt('move 100 to move 200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('English: moves 100 to 200', () => {
  const r = parseMoveRangeFromPrompt('moves 100 to 200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('English: moves 100 through 200', () => {
  const r = parseMoveRangeFromPrompt('moves 100 through 200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

// --- Bare numeric: only accepted for short command-like prompts ---

test('Bare 100-200 as short command', () => {
  const r = parseMoveRangeFromPrompt('100-200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Bare 分析 50-80 with prefix', () => {
  const r = parseMoveRangeFromPrompt('分析 50-80')
  assert.deepEqual(r, { start: 50, end: 80 })
})

test('Bare analyze 100-200', () => {
  const r = parseMoveRangeFromPrompt('analyze 100-200')
  assert.deepEqual(r, { start: 100, end: 200 })
})

// --- False positives: must return null ---

test('Single move: 分析第100手 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('分析第100手'), null)
})

test('Date: 2026-05-02 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('2026-05-02'), null)
})

test('Date in sentence: 2026-05-02 这盘棋怎么样 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('2026-05-02 这盘棋怎么样'), null)
})

test('Score: 3-5目 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('3-5目'), null)
})

test('Winrate: 胜率从 45-55 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('胜率从 45-55'), null)
})

test('Prose: 这盘棋3-5目差距不大 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('这盘棋3-5目差距不大'), null)
})

test('Bare English "100 to 200" → null', () => {
  assert.equal(parseMoveRangeFromPrompt('100 to 200'), null)
})

test('Prose: winrate from 45 to 55 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('winrate from 45 to 55'), null)
})

test('Prose: score changed from 3 to 5 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('score changed from 3 to 5'), null)
})

test('start < 1: 分析第0手到第10手 → null', () => {
  assert.equal(parseMoveRangeFromPrompt('分析第0手到第10手'), null)
})

test('totalMoves clamp: end > totalMoves → null', () => {
  assert.equal(parseMoveRangeFromPrompt('分析第100手到第200手', 150), null)
})

test('totalMoves ok: end <= totalMoves', () => {
  const r = parseMoveRangeFromPrompt('分析第100手到第200手', 250)
  assert.deepEqual(r, { start: 100, end: 200 })
})

test('Empty string → null', () => {
  assert.equal(parseMoveRangeFromPrompt(''), null)
})
