export type ReviewStatus = 'idle' | 'running' | 'done' | 'error'

export interface AppSettings {
  katagoBin: string
  katagoConfig: string
  katagoModel: string
  katagoModelPreset: KataGoModelPresetId
  katagoAnalysisThreads: number
  katagoSearchThreadsPerAnalysisThread: number
  katagoMaxBatchSize: number
  katagoCacheSizePowerOfTwo: number
  katagoBenchmarkThreads: number
  katagoBenchmarkVisitsPerSecond: number
  katagoBenchmarkUpdatedAt: string
  pythonBin: string
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string
  reviewLanguage: 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'
  defaultPlayerName: string
}

export type KataGoModelPresetId = string

export interface KataGoModelPreset {
  id: KataGoModelPresetId
  label: string
  badge: string
  group: string
  blockSize: string
  speedTier: 'fast' | 'balanced' | 'strong' | 'maximum'
  sizeHint: string
  description: string
  networkName: string
  fileName: string
  sourceUrl: string
  downloadUrl?: string
  recommended: boolean
}

export interface SystemProfile {
  katagoBin: string
  katagoConfig: string
  katagoModel: string
  katagoReady: boolean
  katagoStatus: string
  katagoModelPreset: KataGoModelPresetId
  katagoModelPresets: KataGoModelPreset[]
  proxyBaseUrl: string
  proxyApiKey: string
  proxyModels: string[]
  hasLlmApiKey: boolean
  notes: string[]
}

export interface LibraryGame {
  id: string
  title: string
  event: string
  black: string
  white: string
  result: string
  date: string
  source: 'upload' | 'fox'
  sourceLabel: string
  filePath: string
  createdAt: string
  downloadStatus?: 'remote' | 'downloaded'
  remoteId?: string
  remoteUid?: string
  moveCount?: number
}

export type StoneColor = 'B' | 'W'

export interface GameMove {
  moveNumber: number
  color: StoneColor
  point: string
  row: number | null
  col: number | null
  gtp: string
  pass: boolean
}

export interface GameRecord {
  game: LibraryGame
  boardSize: number
  komi: string
  handicap: string
  moves: GameMove[]
}

export interface ReviewArtifact {
  markdown: string
  summary: Record<string, unknown>
  jsonPath: string
  markdownPath: string
}

export interface ReviewResult {
  game: LibraryGame
  status: ReviewStatus
  error?: string
  artifact?: ReviewArtifact
}

export interface FoxSyncRequest {
  keyword: string
  maxGames?: number
}

export interface FoxSyncResult {
  nickname: string
  uid: string
  saved: LibraryGame[]
}

export interface LibraryImportResult {
  dashboard: DashboardData
  imported: LibraryGame[]
}

export interface FoxSyncResponse {
  dashboard: DashboardData
  result: FoxSyncResult
  student?: StudentProfile
}

export interface KataGoAssetStatus {
  platformKey: string
  manifestFound: boolean
  binaryPath: string
  binaryFound: boolean
  binaryExecutable: boolean
  modelPath: string
  modelFound: boolean
  modelDisplayName: string
  ready: boolean
  detail: string
}

export interface KataGoBenchmarkRequest {
  visits?: number
  numPositions?: number
  secondsPerMove?: number
  threads?: number[]
}

export interface KataGoBenchmarkThreadResult {
  threads: number
  visitsPerSecond: number
}

export interface KataGoBenchmarkResult {
  recommendedThreads: number
  visitsPerSecond: number
  tested: KataGoBenchmarkThreadResult[]
  analysisThreads: number
  searchThreadsPerAnalysisThread: number
  maxBatchSize: number
  cacheSizePowerOfTwo: number
  command: string
  outputTail: string
  updatedAt: string
}

export interface KataGoAssetInstallRequest {
  presetId?: KataGoModelPresetId
}

export type KataGoAssetInstallStage = 'discovering' | 'downloading-model' | 'copying-binary' | 'writing-manifest' | 'done' | 'error'

export interface KataGoAssetInstallProgress {
  stage: KataGoAssetInstallStage
  message: string
  receivedBytes?: number
  totalBytes?: number
  percent?: number
}

export interface KataGoAssetInstallResult {
  ok: boolean
  presetId: KataGoModelPresetId
  modelPath: string
  binaryPath: string
  downloadedModel: boolean
  copiedBinary: boolean
  detail: string
}

export type ReleaseReadinessStatus = 'pass' | 'warn' | 'fail' | 'unknown'

export interface ReleaseReadinessItem {
  id: string
  label: string
  status: ReleaseReadinessStatus
  detail?: string
}

export interface ReleaseReadinessFlags {
  automationReady: boolean
  assetsReady: boolean
  installersReady: boolean
  signingReady: boolean
  windowsSmokeReady: boolean
  visualQaReady: boolean
  publicBetaReady: boolean
}

export interface ReleaseReadinessResult {
  status: ReleaseReadinessStatus
  items: ReleaseReadinessItem[]
  flags: ReleaseReadinessFlags
}

export interface ReviewRequest {
  gameId: string
  playerName: string
  maxVisits: number
  minWinrateDrop: number
  useLlm?: boolean
}

export type CoachUserLevel = 'beginner' | 'intermediate' | 'advanced' | 'dan'
export type TeacherRunMode = 'current-move' | 'freeform'
export type TeacherToolStatus = 'running' | 'done' | 'error' | 'skipped'

export interface TeacherToolLog {
  id: string
  name: string
  label: string
  status: TeacherToolStatus
  detail: string
  startedAt: string
  endedAt?: string
}

export interface KnowledgePacket {
  id: string
  title: string
  category: string
  phase: string
  tags: string[]
  summary: string
  selectedBody: string
  score: number
}

export type KnowledgeMatchType = 'joseki' | 'life_death' | 'tesuji' | 'shape' | 'concept'
export type KnowledgeMatchConfidence = 'exact' | 'strong' | 'partial' | 'weak'
export type KnowledgeSourceKind = 'original' | 'common-pattern' | 'licensed-source'

export interface RecommendedProblem {
  id: string
  title: string
  problemType: 'life_death' | 'tesuji'
  difficulty: string
  objective: string
  firstHint: string
  answerSummary: string
  tags: string[]
}

export interface KnowledgeMatch {
  id: string
  matchType: KnowledgeMatchType
  title: string
  confidence: KnowledgeMatchConfidence
  score: number
  reason: string[]
  applicability: string
  teachingPayload: {
    summary: string
    recognition: string
    correctIdea: string
    keyVariations: string[]
    memoryCue: string
    commonMistakes: string[]
    drills: string[]
    boundary: string
    sourceKind: KnowledgeSourceKind
  }
  relatedProblems: RecommendedProblem[]
}

export interface KataGoCandidate {
  move: string
  winrate: number
  scoreLead: number
  visits: number
  order: number
  prior: number
  pv: string[]
}

export interface KataGoMoveAnalysis {
  gameId: string
  moveNumber: number
  boardSize: number
  currentMove?: GameMove
  before: {
    winrate: number
    scoreLead: number
    topMoves: KataGoCandidate[]
  }
  after: {
    winrate: number
    scoreLead: number
    topMoves: KataGoCandidate[]
  }
  playedMove?: {
    move: string
    winrate: number
    scoreLead: number
    playerWinrate?: number
    playerScoreLead?: number
    visits?: number
    rank?: number
    source?: 'candidate' | 'forced' | 'after-root'
    winrateLoss: number
    scoreLoss: number
  }
  judgement: 'good_move' | 'inaccuracy' | 'mistake' | 'blunder' | 'unknown'
}

export interface StudentProfile {
  id: string
  studentId: string
  name: string
  displayName: string
  primaryFoxNickname?: string
  aliases: string[]
  createdFrom: 'fox' | 'sgf' | 'manual' | 'legacy'
  userLevel: CoachUserLevel
  gamesReviewed: number
  weaknessStats: Record<string, number>
  recentPatterns: string[]
  trainingFocus: string[]
  recentGameIds: string[]
  commonMistakes: Array<{ tag: string; count: number }>
  trainingThemes: string[]
  josekiWeaknesses?: string[]
  lifeDeathWeaknesses?: string[]
  tesujiWeaknesses?: string[]
  typicalMoves: Array<{
    gameId: string
    moveNumber: number
    label: string
    lossWinrate: number
    lossScore: number
  }>
  updatedAt: string
  createdAt: string
  lastAnalyzedAt?: string
}

export interface StudentBindingSuggestion {
  student: StudentProfile
  confidence: 'high' | 'medium' | 'low'
  reason: string
  color?: StoneColor
}

export interface TeacherKeyMistake {
  moveNumber?: number
  color?: StoneColor
  played?: string
  recommended?: string
  errorType: string
  severity: 'inaccuracy' | 'mistake' | 'blunder'
  evidence: string
  explanation: string
}

export interface StructuredTeacherResult {
  taskType: 'current-move' | 'full-game' | 'recent-games' | 'freeform'
  headline: string
  summary: string
  keyMistakes: TeacherKeyMistake[]
  correctThinking: string[]
  drills: string[]
  followupQuestions: string[]
  markdown: string
  knowledgeCardIds: string[]
  knowledgeMatches?: KnowledgeMatch[]
  recommendedProblems?: RecommendedProblem[]
  profileUpdates: {
    errorTypes: string[]
    patterns: string[]
    trainingFocus: string[]
  }
}

export interface TeacherRunRequest {
  runId?: string
  mode?: TeacherRunMode
  prompt: string
  gameId?: string
  moveNumber?: number
  playerName?: string
  boardImageDataUrl?: string
  prefetchedAnalysis?: KataGoMoveAnalysis
}

export type TeacherRunProgressStage = 'queued' | 'tool' | 'assistant-start' | 'assistant-delta' | 'done' | 'error'

export interface TeacherRunProgress {
  runId: string
  stage: TeacherRunProgressStage
  message?: string
  markdownDelta?: string
  markdown?: string
  toolLogs?: TeacherToolLog[]
  result?: TeacherRunResult
  error?: string
}

export interface AnalyzePositionRequest {
  gameId: string
  moveNumber: number
  maxVisits?: number
  runId?: string
  reportDuringSearchEvery?: number
}

export interface AnalyzePositionProgress {
  runId?: string
  gameId: string
  moveNumber: number
  analysis: KataGoMoveAnalysis
  isFinal: boolean
}

export interface AnalyzeGameQuickRequest {
  gameId: string
  maxVisits?: number
  runId?: string
}

export interface AnalyzeGameQuickProgress {
  runId?: string
  gameId: string
  evaluation: KataGoMoveAnalysis
  analyzedPositions: number
  totalPositions: number
}

export interface TeacherRunResult {
  id: string
  mode: TeacherRunMode
  title: string
  markdown: string
  toolLogs: TeacherToolLog[]
  analysis?: KataGoMoveAnalysis
  knowledge: KnowledgePacket[]
  knowledgeMatches?: KnowledgeMatch[]
  recommendedProblems?: RecommendedProblem[]
  studentProfile?: StudentProfile
  structured?: StructuredTeacherResult
  structuredResult?: StructuredTeacherResult
  reportPath?: string
}

export interface LlmSettingsTestRequest {
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string
}

export interface LlmSettingsTestResult {
  ok: boolean
  message: string
}

export interface LlmModelsListRequest {
  llmBaseUrl: string
  llmApiKey: string
}

export interface LlmModelsListResult {
  ok: boolean
  models: string[]
  message: string
}

export interface DashboardData {
  settings: AppSettings
  games: LibraryGame[]
  systemProfile: SystemProfile
}
