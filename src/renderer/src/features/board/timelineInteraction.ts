export interface TimelineRect {
  left: number
  width: number
}

export interface MoveFromPointerOptions {
  clientX: number
  rect: TimelineRect
  totalMoves: number
}

export type LossSeverity = 'quiet' | 'inaccuracy' | 'mistake' | 'blunder'

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

export function moveFromPointer({ clientX, rect, totalMoves }: MoveFromPointerOptions): number {
  if (totalMoves <= 0 || rect.width <= 0) {
    return 0
  }
  const progress = clampNumber((clientX - rect.left) / rect.width, 0, 1)
  return Math.round(progress * totalMoves)
}

export function progressFromMove(moveNumber: number, totalMoves: number): number {
  if (totalMoves <= 0) {
    return 0
  }
  return clampNumber(moveNumber / totalMoves, 0, 1)
}

export function lossSeverityFromWinrateDrop(drop: number | null | undefined): LossSeverity {
  const value = Math.abs(drop ?? 0)
  if (value >= 0.16) return 'blunder'
  if (value >= 0.08) return 'mistake'
  if (value >= 0.035) return 'inaccuracy'
  return 'quiet'
}

export function formatWinrate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  const normalized = value <= 1 ? value * 100 : value
  return `${normalized.toFixed(1)}%`
}

export function formatScoreLead(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}目`
}
