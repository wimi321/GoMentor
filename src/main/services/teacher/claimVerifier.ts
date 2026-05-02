import type { TeachingEvidence } from './teachingEvidence'

export type GroundedClaimType =
  | 'coordinate'
  | 'numeric'
  | 'pv'
  | 'motif'
  | 'joseki'
  | 'life_death'
  | 'sente_gote'
  | 'ownership'
  | 'student_profile'

export interface GroundedTeachingClaim {
  id: string
  type: GroundedClaimType
  text: string
  evidenceRefs: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface ClaimVerificationResult {
  ok: boolean
  warnings: string[]
  violations: string[]
  allowedMoves: string[]
  checkedClaims: number
}

function round(value: number | undefined, digits = 2): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function allowedMoves(evidence: TeachingEvidence): string[] {
  const values = new Set<string>()
  if (evidence.actualMove) values.add(evidence.actualMove.toUpperCase())
  for (const candidate of evidence.bestCandidates) {
    values.add(candidate.move.toUpperCase())
    for (const move of candidate.pv ?? []) values.add(move.toUpperCase())
  }
  for (const motif of evidence.recognizedMotifs) {
    for (const move of motif.relatedMoves ?? []) values.add(move.toUpperCase())
    for (const move of motif.expectedNextMoves ?? []) values.add(move.move.toUpperCase())
  }
  return Array.from(values).filter((value) => value && value !== 'PASS')
}

function extractCoordinates(text: string): string[] {
  const result = new Set<string>()
  const regex = /\b([A-HJ-T](?:1?\d|2[0-5]))\b/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) result.add(match[1].toUpperCase())
  return Array.from(result)
}

function extractPercentages(text: string): number[] {
  return Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((match) => Number(match[1]))
}

function hasSupportedJoseki(evidence: TeachingEvidence): boolean {
  return evidence.recognizedMotifs.some((motif) =>
    motif.motifType.startsWith('joseki:') && (motif.confidence === 'strong' || motif.confidence === 'medium')
  )
}

function hasTacticalSupport(evidence: TeachingEvidence): boolean {
  return evidence.recognizedMotifs.some((motif) =>
    /life|death|tesuji|cut|connect|ladder|net|snapback|throw|eye|semeai|ko/i.test(`${motif.motifType} ${motif.title}`)
    && (motif.confidence === 'strong' || motif.confidence === 'medium')
  )
}

function near(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance
}

function verifyNumericText(text: string, evidence: TeachingEvidence, warnings: string[], violations: string[]): void {
  for (const percent of extractPercentages(text)) {
    if (percent > 100) {
      violations.push(`Impossible percentage ${percent}%.`)
      continue
    }
    const known = [
      evidence.before.winrate,
      evidence.afterActual.winrate,
      evidence.loss.winrateLoss,
      ...evidence.bestCandidates.map((candidate) => candidate.winrate)
    ].map((value) => round(value, 1))
    if (!known.some((target) => near(percent, target, 0.6))) {
      warnings.push(`Percentage ${percent}% is not close to any provided winrate/loss evidence.`)
    }
  }

  const scoreMentions = Array.from(text.matchAll(/(?:目差|亏|领先|落后|score|points?).{0,8}?(-?\d+(?:\.\d+)?)/gi)).map((match) => Number(match[1]))
  const knownScores = [
    evidence.before.scoreLead,
    evidence.afterActual.scoreLead,
    evidence.loss.scoreLoss,
    ...evidence.bestCandidates.map((candidate) => candidate.scoreLead)
  ].map((value) => round(value, 1))
  for (const score of scoreMentions) {
    if (!knownScores.some((target) => near(score, target, 0.8))) {
      warnings.push(`Score/point value ${score} is not close to provided score evidence.`)
    }
  }
}

export function verifyGroundedClaims(claims: GroundedTeachingClaim[], evidence: TeachingEvidence): ClaimVerificationResult {
  const warnings: string[] = []
  const violations: string[] = []
  const allowed = allowedMoves(evidence)
  const allowedSet = new Set(allowed)

  for (const claim of claims) {
    if (!claim.text.trim()) {
      warnings.push(`Claim ${claim.id} is empty.`)
      continue
    }
    if (claim.evidenceRefs.length === 0) {
      warnings.push(`Claim ${claim.id} has no evidenceRefs.`)
    }
    for (const coord of extractCoordinates(claim.text)) {
      if (!allowedSet.has(coord)) violations.push(`Claim ${claim.id} mentions unsupported coordinate ${coord}.`)
    }
    if (claim.type === 'numeric') verifyNumericText(claim.text, evidence, warnings, violations)
    if (claim.type === 'joseki' && !hasSupportedJoseki(evidence)) {
      violations.push(`Claim ${claim.id} names joseki without medium/strong joseki motif evidence.`)
    }
    if ((claim.type === 'life_death' || claim.type === 'sente_gote') && claim.confidence === 'high' && !hasTacticalSupport(evidence)) {
      warnings.push(`Claim ${claim.id} is high-confidence tactical claim without explicit tactical motif support.`)
    }
    if (evidence.loss.confidence !== 'high' && /唯一|必然|必杀|净杀|必活|绝对|certain|only\s+move|forced/i.test(claim.text)) {
      violations.push(`Claim ${claim.id} is too absolute for ${evidence.loss.confidence}-confidence evidence.`)
    }
  }

  return { ok: violations.length === 0, warnings, violations, allowedMoves: allowed, checkedClaims: claims.length }
}

export function claimsFromMarkdown(markdown: string): GroundedTeachingClaim[] {
  const paragraphs = markdown
    .split(/\n{2,}|(?<=。)|(?<=！)|(?<=？)/)
    .map((item) => item.trim())
    .filter(Boolean)
  return paragraphs.map((text, index) => {
    let type: GroundedClaimType = 'motif'
    if (/\b[A-HJ-T](?:1?\d|2[0-5])\b/.test(text)) type = 'coordinate'
    if (/\d+(?:\.\d+)?\s*%|目差|score|points?/i.test(text)) type = 'numeric'
    if (/定式|joseki|定石|정석/i.test(text)) type = 'joseki'
    if (/死活|做活|杀棋|眼|气|libert|life|death/i.test(text)) type = 'life_death'
    if (/先手|后手|逆收|sente|gote/i.test(text)) type = 'sente_gote'
    return { id: `markdown-${index + 1}`, type, text, evidenceRefs: ['markdown-derived'], confidence: 'medium' as const }
  })
}

export function verifyTeacherClaimsFromMarkdown(markdown: string, evidence: TeachingEvidence): ClaimVerificationResult {
  return verifyGroundedClaims(claimsFromMarkdown(markdown), evidence)
}

export function buildClaimVerificationNote(result: ClaimVerificationResult): string {
  const issues = [...result.violations, ...result.warnings].slice(0, 4)
  if (issues.length === 0) {
    return `> Claim verifier: checked ${result.checkedClaims} claims; no unsupported coordinates, impossible percentages, or over-absolute claims found.`
  }
  return `> Claim verifier: checked ${result.checkedClaims} claims; notes: ${issues.join('；')}`
}
