import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoachUserLevel, KnowledgeSourceKind, StoneColor } from '@main/lib/types'

export type TrainingPhase = 'opening' | 'middlegame' | 'endgame'
export type TrainingRegion = 'corner' | 'side' | 'center'

export interface JosekiLine {
  id: string
  title: string
  family: string
  phase: TrainingPhase[]
  levels: CoachUserLevel[]
  sourceKind: KnowledgeSourceKind
  relativeSequence: string[]
  normalizedFeatures: string[]
  branches: Array<{
    name: string
    sequence: string
    whenToChoose: string
    warning: string
  }>
  decisionRules: string[]
  commonMistakes: string[]
  katagoEraJudgement: string
  trainingFocus: string[]
  patternCardIds: string[]
  tags: string[]
}

export interface TrainingStone {
  color: StoneColor
  point: string
}

export interface TrainingMoveExplanation {
  move: string
  explanation?: string
  why?: string
}

export interface LifeDeathProblem {
  id: string
  title: string
  difficulty: 'basic' | 'standard' | 'advanced'
  region: TrainingRegion
  toPlay: StoneColor
  objective: string
  sourceKind: KnowledgeSourceKind
  initialStones: TrainingStone[]
  correctMoves: TrainingMoveExplanation[]
  failureMoves: TrainingMoveExplanation[]
  teaching: {
    recognition: string
    firstFeeling: string
    explanation: string
    memoryCue: string
    failureExplanation: string
  }
  patternCardIds: string[]
  tags: string[]
}

export interface TesujiProblem {
  id: string
  title: string
  difficulty: 'basic' | 'standard' | 'advanced'
  region: TrainingRegion
  toPlay: StoneColor
  objective: string
  sourceKind: KnowledgeSourceKind
  initialStones: TrainingStone[]
  correctMoves: TrainingMoveExplanation[]
  failureMoves: TrainingMoveExplanation[]
  teaching: {
    recognition: string
    tesujiIdea: string
    firstHint: string
    memoryCue: string
    failureExplanation: string
  }
  patternCardIds: string[]
  tags: string[]
}

export interface KnowledgeTrainingLibrary {
  version: 1
  generatedAt: string
  sourcePolicy: {
    defaultSourceKind: KnowledgeSourceKind
    rule: string
    allowedKinds: KnowledgeSourceKind[]
  }
  josekiLines: JosekiLine[]
  lifeDeathProblems: LifeDeathProblem[]
  tesujiProblems: TesujiProblem[]
}

export interface KnowledgeTrainingValidationResult {
  ok: boolean
  counts: {
    josekiLines: number
    lifeDeathProblems: number
    tesujiProblems: number
  }
  errors: string[]
}

let cachedRoot = ''
let cachedLibrary: KnowledgeTrainingLibrary | null = null

export function loadKnowledgeTrainingLibrary(dataRoot: string): KnowledgeTrainingLibrary {
  if (cachedLibrary && cachedRoot === dataRoot) {
    return cachedLibrary
  }
  const path = join(dataRoot, 'knowledge', 'training-catalog.json')
  if (!existsSync(path)) {
    cachedRoot = dataRoot
    cachedLibrary = {
      version: 1,
      generatedAt: '',
      sourcePolicy: {
        defaultSourceKind: 'common-pattern',
        rule: '',
        allowedKinds: ['original', 'common-pattern', 'licensed-source']
      },
      josekiLines: [],
      lifeDeathProblems: [],
      tesujiProblems: []
    }
    return cachedLibrary
  }
  cachedRoot = dataRoot
  cachedLibrary = JSON.parse(readFileSync(path, 'utf8')) as KnowledgeTrainingLibrary
  return cachedLibrary
}

function isGtpPoint(point: string): boolean {
  const match = point.trim().toUpperCase().match(/^([A-HJ-T])(\d{1,2})$/)
  if (!match) {
    return false
  }
  const letters = 'ABCDEFGHJKLMNOPQRST'
  const col = letters.indexOf(match[1])
  const row = Number(match[2])
  return col >= 0 && col < 19 && row >= 1 && row <= 19
}

function validateSourceKind(kind: unknown, allowed: Set<string>, errors: string[], id: string): void {
  if (typeof kind !== 'string' || !allowed.has(kind)) {
    errors.push(`${id}: sourceKind must be original, common-pattern, or licensed-source`)
  }
}

function validatePointList(points: string[], errors: string[], id: string, field: string): void {
  for (const point of points) {
    if (!isGtpPoint(point)) {
      errors.push(`${id}: invalid GTP point in ${field}: ${point}`)
    }
  }
}

function validateStones(stones: TrainingStone[], errors: string[], id: string): void {
  if (!Array.isArray(stones) || stones.length === 0) {
    errors.push(`${id}: initialStones must not be empty`)
    return
  }
  for (const stone of stones) {
    if (!['B', 'W'].includes(stone.color) || !isGtpPoint(stone.point)) {
      errors.push(`${id}: invalid initial stone ${JSON.stringify(stone)}`)
    }
  }
}

function validateMoveExplanations(moves: TrainingMoveExplanation[], errors: string[], id: string, field: string): void {
  if (!Array.isArray(moves) || moves.length === 0) {
    errors.push(`${id}: ${field} must not be empty`)
    return
  }
  for (const move of moves) {
    if (!isGtpPoint(move.move)) {
      errors.push(`${id}: invalid ${field} move ${move.move}`)
    }
  }
}

function validatePatternRefs(ids: string[], knownPatternIds: Set<string> | undefined, errors: string[], id: string): void {
  if (!knownPatternIds) {
    return
  }
  for (const patternId of ids) {
    if (!knownPatternIds.has(patternId)) {
      errors.push(`${id}: unknown patternCardId ${patternId}`)
    }
  }
}

export function validateKnowledgeTrainingLibrary(
  library: KnowledgeTrainingLibrary,
  knownPatternIds?: Set<string>
): KnowledgeTrainingValidationResult {
  const errors: string[] = []
  const ids = new Set<string>()
  const allowedKinds = new Set(library.sourcePolicy.allowedKinds)

  for (const line of library.josekiLines) {
    if (ids.has(line.id)) errors.push(`${line.id}: duplicate id`)
    ids.add(line.id)
    if (!line.title || !line.family) errors.push(`${line.id}: missing title or family`)
    validateSourceKind(line.sourceKind, allowedKinds, errors, line.id)
    validatePointList(line.relativeSequence, errors, line.id, 'relativeSequence')
    if (!Array.isArray(line.branches) || line.branches.length === 0) errors.push(`${line.id}: branches must not be empty`)
    if (!Array.isArray(line.decisionRules) || line.decisionRules.length === 0) errors.push(`${line.id}: decisionRules must not be empty`)
    validatePatternRefs(line.patternCardIds, knownPatternIds, errors, line.id)
  }

  for (const problem of library.lifeDeathProblems) {
    if (ids.has(problem.id)) errors.push(`${problem.id}: duplicate id`)
    ids.add(problem.id)
    if (!problem.title || !problem.objective) errors.push(`${problem.id}: missing title or objective`)
    validateSourceKind(problem.sourceKind, allowedKinds, errors, problem.id)
    validateStones(problem.initialStones, errors, problem.id)
    validateMoveExplanations(problem.correctMoves, errors, problem.id, 'correctMoves')
    validateMoveExplanations(problem.failureMoves, errors, problem.id, 'failureMoves')
    if (!problem.teaching?.recognition || !problem.teaching?.failureExplanation) errors.push(`${problem.id}: missing teaching guidance`)
    validatePatternRefs(problem.patternCardIds, knownPatternIds, errors, problem.id)
  }

  for (const problem of library.tesujiProblems) {
    if (ids.has(problem.id)) errors.push(`${problem.id}: duplicate id`)
    ids.add(problem.id)
    if (!problem.title || !problem.objective) errors.push(`${problem.id}: missing title or objective`)
    validateSourceKind(problem.sourceKind, allowedKinds, errors, problem.id)
    validateStones(problem.initialStones, errors, problem.id)
    validateMoveExplanations(problem.correctMoves, errors, problem.id, 'correctMoves')
    validateMoveExplanations(problem.failureMoves, errors, problem.id, 'failureMoves')
    if (!problem.teaching?.recognition || !problem.teaching?.failureExplanation) errors.push(`${problem.id}: missing teaching guidance`)
    validatePatternRefs(problem.patternCardIds, knownPatternIds, errors, problem.id)
  }

  return {
    ok: errors.length === 0,
    counts: {
      josekiLines: library.josekiLines.length,
      lifeDeathProblems: library.lifeDeathProblems.length,
      tesujiProblems: library.tesujiProblems.length
    },
    errors
  }
}
