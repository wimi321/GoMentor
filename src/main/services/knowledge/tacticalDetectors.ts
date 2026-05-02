import type { TacticalSignal } from '@main/lib/types'
import type { BoardState, BoardGroup } from '../go/boardState'

function groupNearMove(group: BoardGroup, moves: string[]): boolean {
  const set = new Set(moves.map((move) => move.toUpperCase()))
  return group.stones.some((stone) => set.has(stone.toUpperCase())) || group.liberties.some((liberty) => set.has(liberty.toUpperCase()))
}

function confidenceFromCount(count: number): TacticalSignal['confidence'] {
  if (count >= 2) return 'high'
  if (count === 1) return 'medium'
  return 'low'
}

export function detectLibertyShortage(state: BoardState, anchors: string[] = []): TacticalSignal[] {
  const weak = state.groups.filter((group) => group.liberties.length <= 2 && (anchors.length === 0 || groupNearMove(group, anchors)))
  if (!weak.length) return []
  return [{
    type: 'liberty-shortage',
    confidence: confidenceFromCount(weak.length),
    evidence: weak.slice(0, 4).map((group) => `${group.color} group ${group.stones.slice(0, 3).join('/')} has ${group.liberties.length} liberties: ${group.liberties.join(',')}`),
    relatedMoves: Array.from(new Set(weak.flatMap((group) => [...group.stones, ...group.liberties]))).slice(0, 12)
  }]
}

export function detectCutPoints(state: BoardState, anchors: string[] = []): TacticalSignal[] {
  const candidates: string[] = []
  for (const group of state.groups) {
    if (anchors.length > 0 && !groupNearMove(group, anchors)) continue
    for (const liberty of group.liberties) {
      const adjacentFriendly = state.groups.filter((other) => other.color === group.color && other.id !== group.id && other.liberties.includes(liberty))
      const adjacentEnemy = state.groups.filter((other) => other.color !== group.color && other.liberties.includes(liberty))
      if (adjacentFriendly.length >= 1 && adjacentEnemy.length >= 1) candidates.push(liberty)
    }
  }
  const unique = Array.from(new Set(candidates))
  if (!unique.length) return []
  return [{
    type: 'cut-or-connection-point',
    confidence: unique.length >= 2 ? 'high' : 'medium',
    evidence: unique.slice(0, 6).map((point) => `${point} is a shared liberty between friendly connection and enemy pressure.`),
    relatedMoves: unique.slice(0, 12)
  }]
}

export function detectEyeShapeRisk(state: BoardState, anchors: string[] = []): TacticalSignal[] {
  const candidates = state.groups
    .filter((group) => group.liberties.length >= 2 && group.liberties.length <= 4 && (anchors.length === 0 || groupNearMove(group, anchors)))
    .filter((group) => group.stones.length >= 3)
  if (!candidates.length) return []
  return [{
    type: 'eye-shape-risk',
    confidence: candidates.length >= 2 ? 'medium' : 'low',
    evidence: candidates.slice(0, 3).map((group) => `${group.color} group ${group.stones.slice(0, 4).join('/')} has compact eye-space candidates ${group.liberties.join(',')}.`),
    relatedMoves: Array.from(new Set(candidates.flatMap((group) => group.liberties))).slice(0, 10)
  }]
}

export function detectSenteGoteHints(state: BoardState, anchors: string[] = []): TacticalSignal[] {
  const atariTargets = state.groups.filter((group) => group.liberties.length === 1 && (anchors.length === 0 || groupNearMove(group, anchors)))
  if (!atariTargets.length) return []
  const forcingMoves = Array.from(new Set(atariTargets.flatMap((group) => group.liberties)))
  return [{
    type: 'sente-gote-forcing-move',
    confidence: atariTargets.length >= 2 ? 'high' : 'medium',
    evidence: atariTargets.slice(0, 4).map((group) => `${group.color} group at ${group.stones.slice(0, 3).join('/')} is in atari; ${group.liberties[0]} is forcing.`),
    relatedMoves: forcingMoves
  }]
}

export function detectTacticalSignals(state: BoardState, anchors: string[] = []): TacticalSignal[] {
  const signals = [
    ...detectLibertyShortage(state, anchors),
    ...detectCutPoints(state, anchors),
    ...detectEyeShapeRisk(state, anchors),
    ...detectSenteGoteHints(state, anchors)
  ]
  return signals.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 }
    return rank[b.confidence] - rank[a.confidence] || b.evidence.length - a.evidence.length
  }).slice(0, 6)
}
