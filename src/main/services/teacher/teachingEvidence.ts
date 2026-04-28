import type {
  CoachUserLevel,
  KataGoCandidate,
  KataGoMoveAnalysis,
  KnowledgeMatch,
  KnowledgePacket,
  RecommendedProblem,
  StoneColor,
  StudentProfile,
  TeachingDensity,
  TeachingFocus,
  TeachingPacingAdvice,
  TeacherRunRequest
} from '@main/lib/types'
import type { RecognizedTeachingMotif } from '../knowledge/motifRecognizer'

export type TeachingPhase = 'opening' | 'middle' | 'endgame'
export type TeachingSeverity = 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'uncertain'
export type TeachingConfidence = 'high' | 'medium' | 'low'
export type TeachingMode = 'clear-mistake' | 'candidate-choice' | 'style-choice' | 'needs-deeper-search'

export interface TeachingEvidenceCandidate extends Pick<KataGoCandidate, 'move' | 'winrate' | 'scoreLead' | 'visits' | 'order' | 'pv'> {
  rank: number
  humanLabel: 'best' | 'playable' | 'variation'
}

export interface TeachingEvidence {
  schemaVersion: 1
  gameId: string
  moveNumber: number
  boardSize: number
  phase: TeachingPhase
  userPrompt: string
  playerColor: StoneColor | 'unknown'
  actualMove?: string
  before: {
    winrate: number
    scoreLead: number
  }
  afterActual: {
    winrate: number
    scoreLead: number
  }
  playedMove?: {
    move: string
    winrate?: number
    scoreLead?: number
    visits?: number
    rank?: number
    source?: string
  }
  bestCandidates: TeachingEvidenceCandidate[]
  loss: {
    winrateLoss: number
    scoreLoss: number
    severity: TeachingSeverity
    confidence: TeachingConfidence
    confidenceReason: string
    teachingMode: TeachingMode
  }
  recognizedMotifs: Array<{
    id: string
    title: string
    motifType: string
    confidence: string
    score: number
    whyMatched: string
    recognition: string
    wrongThinking: string
    correctThinking: string
    drillPrompt: string
    relatedMoves: string[]
    sourceRefs?: string[]
    sourceQuality?: string
    expectedNextMoves?: Array<{ move: string; label: string; condition?: string }>
    variationCount?: number
    josekiFamily?: string
  }>
  knowledgeReferences: Array<{
    id: string
    title: string
    confidence: string
    score: number
    whyMatched: string
  }>
  recommendedProblems: RecommendedProblem[]
  teachingDensity: TeachingDensity
  teachingFocus: TeachingFocus
  whyThisMuchExplanation: string
  variationTeachingHints: TeachingPacingAdvice['variationTeachingHints']
  student: {
    id?: string
    level: CoachUserLevel
    recurringIssues: string[]
  }
  constraints: string[]
}

export interface TeacherMarkdownVerification {
  ok: boolean
  warnings: string[]
  violations: string[]
  allowedMoves: string[]
}

type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR' | 'th-TH' | 'vi-VN'

function normalizeLocale(locale: unknown): Locale {
  if (locale === 'en-US' || locale === 'ja-JP' || locale === 'ko-KR' || locale === 'th-TH' || locale === 'vi-VN') return locale
  return 'zh-CN'
}

function round(value: number | undefined, digits = 2): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function inferPhase(moveNumber: number): TeachingPhase {
  if (moveNumber <= 50) return 'opening'
  if (moveNumber <= 160) return 'middle'
  return 'endgame'
}

function inferSeverity(winrateLoss: number, scoreLoss: number, judgement: KataGoMoveAnalysis['judgement']): TeachingSeverity {
  if (judgement === 'unknown') return 'uncertain'
  if (judgement === 'blunder' || winrateLoss >= 15 || scoreLoss >= 8) return 'blunder'
  if (judgement === 'mistake' || winrateLoss >= 7 || scoreLoss >= 4) return 'mistake'
  if (judgement === 'inaccuracy' || winrateLoss >= 2.5 || scoreLoss >= 1.5) return 'inaccuracy'
  return 'good'
}

function candidateSpread(candidates: KataGoCandidate[]): number {
  if (candidates.length < 2) return 99
  const [best, second] = candidates
  return Math.abs((best.winrate ?? 0) - (second.winrate ?? 0))
}

function totalVisits(candidates: KataGoCandidate[]): number {
  return candidates.reduce((sum, move) => sum + (move.visits ?? 0), 0)
}

function inferConfidence(analysis: KataGoMoveAnalysis, severity: TeachingSeverity): { confidence: TeachingConfidence; reason: string; mode: TeachingMode } {
  const candidates = analysis.before.topMoves ?? []
  const visits = totalVisits(candidates)
  const spread = candidateSpread(candidates)
  const winrateLoss = analysis.playedMove?.winrateLoss ?? 0
  const scoreLoss = analysis.playedMove?.scoreLoss ?? 0
  const playedVisits = analysis.playedMove?.visits ?? 0
  const hasForcedPlayed = analysis.playedMove?.source === 'forced'
  const consistentLoss = winrateLoss >= 2.5 && scoreLoss >= 1

  if (visits < 80 || (playedVisits === 0 && hasForcedPlayed)) {
    return {
      confidence: 'low',
      reason: `KataGo visits are low (${visits}); treat the explanation as a teaching hypothesis, not a final verdict.`,
      mode: 'needs-deeper-search'
    }
  }

  if (severity === 'good' && spread < 1.5) {
    return {
      confidence: 'medium',
      reason: `Top candidates are close (${round(spread, 1)} winrate points apart); explain as a choice of style/direction.`,
      mode: 'style-choice'
    }
  }

  if (severity === 'inaccuracy' && spread < 2) {
    return {
      confidence: visits >= 250 ? 'medium' : 'low',
      reason: 'The loss is small and alternatives are close; avoid over-criticizing.',
      mode: 'candidate-choice'
    }
  }

  if ((severity === 'mistake' || severity === 'blunder') && visits >= 250 && consistentLoss) {
    return {
      confidence: 'high',
      reason: `Winrate and score loss agree, with enough visits (${visits}).`,
      mode: 'clear-mistake'
    }
  }

  return {
    confidence: visits >= 160 ? 'medium' : 'low',
    reason: `Evidence is usable but not decisive: visits=${visits}, spread=${round(spread, 1)}, winrateLoss=${round(winrateLoss, 1)}, scoreLoss=${round(scoreLoss, 1)}.`,
    mode: severity === 'good' ? 'style-choice' : 'candidate-choice'
  }
}

function labelCandidate(index: number): TeachingEvidenceCandidate['humanLabel'] {
  if (index === 0) return 'best'
  if (index <= 2) return 'playable'
  return 'variation'
}

function strongMatch(match: KnowledgeMatch | undefined): boolean {
  return Boolean(match && (match.confidence === 'exact' || match.confidence === 'strong'))
}

function matchByType(matches: KnowledgeMatch[], type: KnowledgeMatch['matchType']): KnowledgeMatch | undefined {
  return matches.find((match) => match.matchType === type)
}

function recognizedJoseki(motifs: RecognizedTeachingMotif[]): RecognizedTeachingMotif | undefined {
  return motifs.find((motif) => motif.motifType.startsWith('joseki:') && (motif.confidence === 'strong' || motif.confidence === 'medium'))
}

function focusFromEvidence(
  phase: TeachingPhase,
  loss: number,
  knowledgeMatches: KnowledgeMatch[],
  recognizedMotifs: RecognizedTeachingMotif[]
): TeachingFocus {
  const lifeDeath = matchByType(knowledgeMatches, 'life_death')
  if (strongMatch(lifeDeath)) return 'life-death'

  const tesuji = matchByType(knowledgeMatches, 'tesuji')
  if (strongMatch(tesuji)) return 'tesuji'

  const joseki = matchByType(knowledgeMatches, 'joseki')
  if (phase === 'opening' && (strongMatch(joseki) || recognizedJoseki(recognizedMotifs))) {
    return loss < 2 ? 'joseki-normal' : 'joseki-branch'
  }
  if (joseki?.confidence === 'partial') return 'joseki-branch'
  if (phase === 'middle') return 'middlegame-fight'
  if (phase === 'endgame') return 'endgame'
  return 'general-shape'
}

function candidateConfidence(visits: number): 'high' | 'medium' | 'low' {
  if (visits >= 250) return 'high'
  if (visits >= 80) return 'medium'
  return 'low'
}

function hintPurpose(label: TeachingEvidenceCandidate['humanLabel'], focus: TeachingFocus, isActual: boolean): string {
  if (isActual) return '实战选择，用来检验对方正常应对后为什么会稍亏或可行。'
  if (label === 'best') {
    if (focus === 'middlegame-fight') return '首选变化，用来说明这手的作战目的和后续攻防收益。'
    if (focus === 'joseki-branch') return '首选分支，用来比较这个定式/布局选择的方向。'
    if (focus === 'life-death' || focus === 'tesuji') return '首选急所，用来读清局部成立的第一步。'
    return '首选变化，用来校准全局方向。'
  }
  return '可下分支，用来说明选择条件和代价。'
}

function uniqueHintCandidates(analysis: KataGoMoveAnalysis): TeachingEvidenceCandidate[] {
  const candidates = (analysis.before.topMoves ?? []).slice(0, 3).map((move, index) => ({
    move: move.move,
    winrate: round(move.winrate, 2),
    scoreLead: round(move.scoreLead, 2),
    visits: move.visits ?? 0,
    order: move.order,
    pv: (move.pv ?? []).slice(0, 8),
    rank: index + 1,
    humanLabel: labelCandidate(index)
  }))
  const actualMove = analysis.playedMove?.move
  const playedCandidate = actualMove ? candidates.find((candidate) => candidate.move === actualMove) : undefined
  const selected = [candidates[0], playedCandidate, candidates[1]].filter(Boolean) as TeachingEvidenceCandidate[]
  return selected.filter((candidate, index, all) => all.findIndex((item) => item.move === candidate.move) === index).slice(0, 3)
}

export function buildTeachingPacingAdvice(
  analysis: KataGoMoveAnalysis,
  knowledgeMatches: KnowledgeMatch[] = [],
  recognizedMotifs: RecognizedTeachingMotif[] = []
): TeachingPacingAdvice {
  const phase = inferPhase(analysis.moveNumber)
  const winrateLoss = round(analysis.playedMove?.winrateLoss ?? 0, 2)
  const scoreLoss = round(analysis.playedMove?.scoreLoss ?? 0, 2)
  const severity = inferSeverity(winrateLoss, scoreLoss, analysis.judgement)
  const confidence = inferConfidence(analysis, severity)
  const focus = focusFromEvidence(phase, winrateLoss, knowledgeMatches, recognizedMotifs)
  const joseki = matchByType(knowledgeMatches, 'joseki')
  const tactical = strongMatch(matchByType(knowledgeMatches, 'life_death')) || strongMatch(matchByType(knowledgeMatches, 'tesuji'))
  const hasJosekiBranch = Boolean(joseki && (joseki.confidence === 'partial' || (joseki.teachingPayload?.keyVariations?.length ?? 0) > 0 || winrateLoss >= 2))

  let teachingDensity: TeachingDensity = 'branch'
  let whyThisMuchExplanation = '局面需要说明选择条件，但不必展开成完整报告。'

  if (confidence.confidence === 'low') {
    teachingDensity = 'caution'
    whyThisMuchExplanation = 'KataGo 搜索或实战手证据还不够强，只能讲判断倾向，不能下绝对结论。'
  } else if (tactical || phase === 'middle' || severity === 'mistake' || severity === 'blunder' || winrateLoss >= 7 || scoreLoss >= 4) {
    teachingDensity = 'detailed'
    whyThisMuchExplanation = '这是中盘战、急所计算或明显损失局面，需要讲清这手目的、对方应手、PV 后续和实战代价。'
  } else if (hasJosekiBranch || focus === 'joseki-branch' || (phase === 'opening' && winrateLoss >= 2)) {
    teachingDensity = 'branch'
    whyThisMuchExplanation = '这是定式分支、布局选择或相似型局面，适合列 1-2 个关键变化和选择条件。'
  } else if ((focus === 'joseki-normal' && winrateLoss < 2) || (severity === 'good' && winrateLoss < 2)) {
    teachingDensity = 'minimal'
    whyThisMuchExplanation = '这是常规定式或损失很小的正常选择，只点明棋形方向即可，不需要长篇讲解。'
  }

  const actualMove = analysis.playedMove?.move
  const variationTeachingHints = uniqueHintCandidates(analysis).map((candidate) => {
    const expectedReply = candidate.pv.find((move) => move !== candidate.move)
    const isActual = Boolean(actualMove && candidate.move === actualMove)
    return {
      move: candidate.move,
      purpose: hintPurpose(candidate.humanLabel, focus, isActual),
      expectedReply,
      pv: candidate.pv.slice(0, 6),
      result: `胜率 ${round(candidate.winrate, 1)}%，目差 ${round(candidate.scoreLead, 1)}，搜索 ${candidate.visits}。`,
      confidence: candidateConfidence(candidate.visits)
    }
  })

  return {
    teachingDensity,
    teachingFocus: focus,
    whyThisMuchExplanation,
    variationTeachingHints
  }
}

function knowledgeWhy(match: KnowledgeMatch, knowledge: KnowledgePacket[]): string {
  const packet = knowledge.find((card) => card.id === match.id || card.title === match.title)
  const reasons = [...(match.reason ?? []), match.teachingPayload?.recognition, packet?.summary].filter(Boolean).slice(0, 3)
  if (reasons.length) return reasons.join('；')
  return `Matched teaching pattern “${match.title}” with score ${round(match.score, 2)}.`
}

function recurringIssues(profile: StudentProfile | null | undefined): string[] {
  if (!profile) return []
  const candidates = [
    ...(profile.trainingFocus ?? []),
    ...(profile.recentPatterns ?? []),
    ...(profile.trainingThemes ?? []),
    ...(profile.commonMistakes ?? []).map((item) => item.tag),
    ...(profile.josekiWeaknesses ?? []),
    ...(profile.lifeDeathWeaknesses ?? []),
    ...(profile.tesujiWeaknesses ?? [])
  ]
  return Array.from(new Set(candidates.filter(Boolean))).slice(0, 8)
}

function playerColor(analysis: KataGoMoveAnalysis): TeachingEvidence['playerColor'] {
  return analysis.currentMove?.color ?? 'unknown'
}

export function buildTeachingEvidence(
  request: TeacherRunRequest,
  analysis: KataGoMoveAnalysis,
  knowledge: KnowledgePacket[],
  profile: StudentProfile | null | undefined,
  knowledgeMatches: KnowledgeMatch[] = [],
  recommendedProblems: RecommendedProblem[] = [],
  recognizedMotifs: RecognizedTeachingMotif[] = []
): TeachingEvidence {
  const winrateLoss = round(analysis.playedMove?.winrateLoss ?? 0, 2)
  const scoreLoss = round(analysis.playedMove?.scoreLoss ?? 0, 2)
  const severity = inferSeverity(winrateLoss, scoreLoss, analysis.judgement)
  const confidence = inferConfidence(analysis, severity)
  const teachingPacing = buildTeachingPacingAdvice(analysis, knowledgeMatches, recognizedMotifs)

  const bestCandidates = (analysis.before.topMoves ?? []).slice(0, 5).map((move, index) => ({
    move: move.move,
    winrate: round(move.winrate, 2),
    scoreLead: round(move.scoreLead, 2),
    visits: move.visits ?? 0,
    order: move.order,
    pv: (move.pv ?? []).slice(0, 8),
    rank: index + 1,
    humanLabel: labelCandidate(index)
  }))

  return {
    schemaVersion: 1,
    gameId: analysis.gameId,
    moveNumber: analysis.moveNumber,
    boardSize: analysis.boardSize,
    phase: inferPhase(analysis.moveNumber),
    userPrompt: request.prompt,
    playerColor: playerColor(analysis),
    actualMove: analysis.playedMove?.move ?? analysis.currentMove?.gtp,
    before: {
      winrate: round(analysis.before.winrate, 2),
      scoreLead: round(analysis.before.scoreLead, 2)
    },
    afterActual: {
      winrate: round(analysis.after.winrate, 2),
      scoreLead: round(analysis.after.scoreLead, 2)
    },
    playedMove: analysis.playedMove
      ? {
          move: analysis.playedMove.move,
          winrate: round(analysis.playedMove.winrate, 2),
          scoreLead: round(analysis.playedMove.scoreLead, 2),
          visits: analysis.playedMove.visits,
          rank: analysis.playedMove.rank,
          source: analysis.playedMove.source
        }
      : undefined,
    bestCandidates,
    recognizedMotifs: recognizedMotifs.slice(0, 8).map((motif) => ({
      id: motif.id,
      title: motif.title,
      motifType: motif.motifType,
      confidence: motif.confidence,
      score: round(motif.score, 2),
      whyMatched: motif.whyMatched,
      recognition: motif.recognition,
      wrongThinking: motif.wrongThinking,
      correctThinking: motif.correctThinking,
      drillPrompt: motif.drillPrompt,
      relatedMoves: motif.relatedMoves,
      sourceRefs: motif.sourceRefs,
      sourceQuality: motif.sourceQuality,
      expectedNextMoves: motif.expectedNextMoves,
      variationCount: motif.variationCount,
      josekiFamily: motif.josekiFamily
    })),
    loss: {
      winrateLoss,
      scoreLoss,
      severity,
      confidence: confidence.confidence,
      confidenceReason: confidence.reason,
      teachingMode: confidence.mode
    },
    knowledgeReferences: knowledgeMatches.slice(0, 6).map((match) => ({
      id: match.id,
      title: match.title,
      confidence: match.confidence,
      score: round(match.score, 2),
      whyMatched: knowledgeWhy(match, knowledge)
    })),
    recommendedProblems,
    teachingDensity: teachingPacing.teachingDensity,
    teachingFocus: teachingPacing.teachingFocus,
    whyThisMuchExplanation: teachingPacing.whyThisMuchExplanation,
    variationTeachingHints: teachingPacing.variationTeachingHints,
    student: {
      id: profile?.id,
      level: profile?.userLevel ?? 'intermediate',
      recurringIssues: recurringIssues(profile)
    },
    constraints: [
      'Only use coordinates and candidate moves present in this evidence or in the attached board image.',
      'Do not invent winrate, scoreLead, joseki names, pro-player references, source citations, or PV lines.',
      'Only name a joseki when recognizedMotifs contains a joseki:* motif with medium/strong confidence; otherwise describe it as an opening/corner pattern.',
      'When a motif has sourceRefs, treat them as traceability labels, not as quoted sources. Do not claim a source says something unless source text is present.',
      'If confidence is medium/low, speak as preference or hypothesis, not as a final verdict.',
      'Explain the thinking order a human should use before mentioning numbers.'
    ]
  }
}

function allowedMoves(evidence: TeachingEvidence): string[] {
  const moves = new Set<string>()
  if (evidence.actualMove) moves.add(evidence.actualMove)
  for (const candidate of evidence.bestCandidates) {
    moves.add(candidate.move)
    for (const pvMove of candidate.pv ?? []) moves.add(pvMove)
  }
  return Array.from(moves).filter((move) => move && move.toLowerCase() !== 'pass')
}

function extractCoordinates(markdown: string): string[] {
  const result = new Set<string>()
  const regex = /\b([A-HJ-T](?:1?\d|2[0-5]))\b/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(markdown))) result.add(match[1].toUpperCase())
  return Array.from(result)
}

function nearRecommendationPhrase(markdown: string, coord: string): boolean {
  const index = markdown.toUpperCase().indexOf(coord.toUpperCase())
  if (index < 0) return false
  const window = markdown.slice(Math.max(0, index - 24), index + coord.length + 24)
  return /推荐|最佳|首选|应该|建议|好点|更好|best|recommend|should|play\s+at|候補|추천|권장/i.test(window)
}

export function verifyTeacherMarkdown(markdown: string, evidence: TeachingEvidence): TeacherMarkdownVerification {
  const warnings: string[] = []
  const violations: string[] = []
  const allowed = allowedMoves(evidence).map((move) => move.toUpperCase())
  const allowedSet = new Set(allowed)
  const coords = extractCoordinates(markdown)

  for (const coord of coords) {
    if (!allowedSet.has(coord) && nearRecommendationPhrase(markdown, coord)) {
      violations.push(`Unsupported recommended coordinate ${coord}; it is not in top candidates, actual move, or PV evidence.`)
    }
  }

  const percentMatches = Array.from(markdown.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((match) => Number(match[1]))
  for (const value of percentMatches) {
    if (value > 100) violations.push(`Impossible winrate percentage ${value}%.`)
  }
  if (percentMatches.length >= 5) warnings.push('Many percentages were mentioned; consider simplifying the teacher explanation.')

  if (evidence.loss.confidence !== 'high' && /明显恶手|必败|唯一|绝对|certainly|only\s+move|forced/i.test(markdown)) {
    warnings.push('Explanation sounds too absolute for medium/low-confidence evidence.')
  }

  const mentionsJoseki = /定式|joseki|jōseki|定石|정석/i.test(markdown)
  const supportedJoseki = evidence.recognizedMotifs.some((motif) =>
    motif.motifType.startsWith('joseki:') && (motif.confidence === 'strong' || motif.confidence === 'medium')
  )
  if (mentionsJoseki && !supportedJoseki) {
    warnings.push('Joseki terminology was used without a medium/strong recognized joseki motif.')
  }

  if (/据.*(?:Sensei|Kogo|GoGoD|Wikibooks)|source says|according to/i.test(markdown)) {
    warnings.push('Teacher appears to cite external sources; sourceRefs are traceability labels, not source text.')
  }

  return { ok: violations.length === 0, warnings, violations, allowedMoves: allowed }
}

function evidenceSummaryZh(evidence: TeachingEvidence): string {
  const best = evidence.bestCandidates[0]?.move ?? '未知'
  const actual = evidence.actualMove ?? '未知'
  return `AI 证据链：第 ${evidence.moveNumber} 手，实战 ${actual}，首选 ${best}，胜率损失 ${round(evidence.loss.winrateLoss, 1)}%，目差损失约 ${round(evidence.loss.scoreLoss, 1)}，判断 ${evidence.loss.severity}，置信度 ${evidence.loss.confidence}。`
}

function evidenceSummaryEn(evidence: TeachingEvidence): string {
  const best = evidence.bestCandidates[0]?.move ?? 'unknown'
  const actual = evidence.actualMove ?? 'unknown'
  return `Evidence chain: move ${evidence.moveNumber}, played ${actual}, top candidate ${best}, winrate loss ${round(evidence.loss.winrateLoss, 1)}%, score loss about ${round(evidence.loss.scoreLoss, 1)}, severity ${evidence.loss.severity}, confidence ${evidence.loss.confidence}.`
}

export function buildVerificationNote(verification: TeacherMarkdownVerification, evidence: TeachingEvidence, localeInput: unknown = 'zh-CN'): string {
  const locale = normalizeLocale(localeInput)
  const summary = locale === 'en-US' ? evidenceSummaryEn(evidence) : evidenceSummaryZh(evidence)
  const motif = evidence.recognizedMotifs[0]
  const motifLine = motif
    ? locale === 'en-US'
      ? `\n> Recognized motif: ${motif.title} (${motif.confidence}, score ${round(motif.score, 1)}${motif.sourceRefs?.length ? `, sources ${motif.sourceRefs.join('/')}` : ''}).`
      : `\n> 识别棋形：${motif.title}（${motif.confidence}，score ${round(motif.score, 1)}${motif.sourceRefs?.length ? `，来源标记 ${motif.sourceRefs.join('/')}` : ''}）。`
    : ''
  const issueLines = [...verification.violations, ...verification.warnings]
  const issues = issueLines.length ? `\n> ${locale === 'en-US' ? 'Verifier notes' : '校验提示'}：${issueLines.slice(0, 3).join('；')}` : ''
  return `> ${summary}${motifLine}${issues}`
}

export function appendVerificationNote(markdown: string, verification: TeacherMarkdownVerification, evidence: TeachingEvidence, localeInput: unknown = 'zh-CN'): string {
  return `${markdown.trim()}\n\n${buildVerificationNote(verification, evidence, localeInput)}`
}
