import type {
  CoachUserLevel,
  KataGoCandidate,
  KataGoMoveAnalysis,
  KnowledgeMatch,
  KnowledgePacket,
  RecommendedProblem,
  StoneColor,
  StudentProfile,
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

export function buildHumanTeacherInstruction(level: CoachUserLevel, localeInput: unknown = 'zh-CN'): string {
  const locale = normalizeLocale(localeInput)
  const languageLine: Record<Locale, string> = {
    'zh-CN': '默认用简体中文输出；如果用户明确要求其他语言，则遵从用户。',
    'en-US': 'Default to concise, natural English unless the user explicitly asks for another language.',
    'ja-JP': '既定では自然な日本語で出力してください。ユーザーが別言語を明示した場合はそれに従ってください。',
    'ko-KR': '기본적으로 자연스러운 한국어로 답하세요. 사용자가 다른 언어를 명시하면 그 언어를 따르세요.',
    'th-TH': 'ตอบเป็นภาษาไทยอย่างเป็นธรรมชาติเป็นค่าเริ่มต้น เว้นแต่ผู้ใช้จะระบุภาษาอื่นชัดเจน',
    'vi-VN': 'Mặc định trả lời bằng tiếng Việt tự nhiên, trừ khi người dùng yêu cầu ngôn ngữ khác.'
  }
  const levelLine: Record<CoachUserLevel, string> = {
    beginner: '学生是入门/级位水平：少用术语，先讲“看哪里、为什么、下一盘怎么避免”。',
    intermediate: '学生是业余中级：讲清判断顺序，可以使用常见术语但必须解释。',
    advanced: '学生是业余高级：可以讲厚薄、转换、目差、先后手，但仍要给出可执行思路。',
    dan: '学生是高段水平：简洁、精确，重点讲方向、效率、风险与读秒下的选择。'
  }

  return [
    '你是 GoMentor 的围棋老师。你的职责不是复述 KataGo 数字，而是把证据讲成棋手能执行的思考顺序。',
    '事实优先级必须固定：① KataGo/TeachingEvidence 事实 ② recognizedMotifs 棋形/定式识别 ③ 本地知识卡解释 ④ 截图辅助。不要反过来用定式记忆否定 KataGo 当前证据。',
    '输出前先做内部三步核对：A. 我提到的坐标是否在 evidence/PV/candidate/截图里；B. 我说的定式/棋形是否在 recognizedMotifs 里；C. 我的结论是否和 confidence 匹配。',
    '如果 recognizedMotifs.confidence 为 strong/medium，可以把它作为“棋形/棋理标签”；如果为 weak，只能作为可能方向，不能当成事实。',
    '只有当 recognizedMotifs 中存在 joseki:* 且 confidence 为 strong/medium 时，才可以说“这是某某定式/定式族”；否则只能说“像某类角上变化”。',
    '定式讲解必须讲“为什么这一分支适合本局”，不能只背变化；若有 expectedNextMoves，只能把它们说成常见分支，最终仍以 KataGo 候选为准。',
    '严禁编造坐标、胜率、目差、定式名称、职业棋手说法、资料来源、PV 变化或训练题来源。sourceRefs 只是追溯标签，不代表可以引用原文。',
    '默认输出采用“短讲解卡”：①一句话判断 ②为什么 ③正确思路/判断顺序 ④一个小练习或下一盘提醒。用户要求长报告时再展开。',
    '如果 TeachingEvidence.loss.confidence 不是 high，请使用“AI 更倾向/更像是/不必当成绝对错手”等降调表达。',
    '如果多个候选手接近，请明确这是方向或风格选择，不要把用户的手强行说成恶手。',
    '讲棋时优先选择 1-2 个最强 recognizedMotifs，不要把所有知识卡堆给用户；新手最多讲一个核心问题。',
    '不要默认输出长报告；每段都要短、准、能落地。',
    levelLine[level],
    languageLine[locale]
  ].join('\n')
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

export function friendlyTeacherFallback(error: unknown, evidence: TeachingEvidence, localeInput: unknown = 'zh-CN'): string {
  const locale = normalizeLocale(localeInput)
  const best = evidence.bestCandidates[0]
  const actual = evidence.actualMove ?? '这手'
  const reason = error instanceof Error ? error.message : String(error)
  if (locale === 'en-US') {
    return [
      'The full AI teacher is temporarily unavailable, so here is a safe KataGo-based summary.',
      `Move ${evidence.moveNumber}: the played move was ${actual}; KataGo's top candidate is ${best?.move ?? 'unknown'}.`,
      `The estimated loss is ${round(evidence.loss.winrateLoss, 1)}% winrate and about ${round(evidence.loss.scoreLoss, 1)} points, with ${evidence.loss.confidence} confidence.`,
      evidence.loss.confidence === 'high'
        ? 'Treat this as a real review point: compare the played move with the top candidate and ask what direction or tactical point changed.'
        : 'Treat this as a direction preference rather than an absolute mistake; deeper analysis may be needed.',
      `Technical note: ${reason}`
    ].join('\n\n')
  }
  return [
    'AI 老师暂时没能完整生成讲解，我先给你一版基于 KataGo 证据的安全说明。',
    `第 ${evidence.moveNumber} 手：实战是 ${actual}，KataGo 首选是 ${best?.move ?? '未知'}。`,
    `估计损失：胜率约 ${round(evidence.loss.winrateLoss, 1)}%，目差约 ${round(evidence.loss.scoreLoss, 1)}，置信度 ${evidence.loss.confidence}。`,
    evidence.loss.confidence === 'high'
      ? '这手可以当作本盘重点复盘：请重点比较实战和首选手在攻击方向、先后手、形势转换上的差异。'
      : '这更像是方向选择或需要加深分析的局面，不建议把它简单理解成“绝对错手”。',
    `技术提示：${reason}`
  ].join('\n\n')
}
