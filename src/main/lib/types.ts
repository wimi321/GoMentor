export type ReviewStatus = 'idle' | 'running' | 'done' | 'error'

export interface AppSettings {
  katagoBin: string
  katagoConfig: string
  katagoModel: string
  katagoModelPreset: KataGoModelPresetId
  pythonBin: string
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string
  reviewLanguage: 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'
  defaultPlayerName: string
}

export type KataGoModelPresetId = 'official-b18-recommended' | 'official-b28-strong'

export interface KataGoModelPreset {
  id: KataGoModelPresetId
  label: string
  badge: string
  description: string
  networkName: string
  fileName: string
  sourceUrl: string
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

export interface KataGoCandidate {
  move: string
  winrate: number
  scoreLead: number
  visits: number
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
  }
  playedMove?: {
    move: string
    winrate: number
    scoreLead: number
    winrateLoss: number
    scoreLoss: number
  }
  judgement: 'good_move' | 'inaccuracy' | 'mistake' | 'blunder' | 'unknown'
}

export interface StudentProfile {
  id: string
  name: string
  userLevel: CoachUserLevel
  gamesReviewed: number
  commonMistakes: Array<{ tag: string; count: number }>
  trainingThemes: string[]
  typicalMoves: Array<{
    gameId: string
    moveNumber: number
    label: string
    lossWinrate: number
    lossScore: number
  }>
  updatedAt: string
}

export interface TeacherRunRequest {
  mode?: TeacherRunMode
  prompt: string
  gameId?: string
  moveNumber?: number
  playerName?: string
  boardImageDataUrl?: string
  prefetchedAnalysis?: KataGoMoveAnalysis
}

export interface AnalyzePositionRequest {
  gameId: string
  moveNumber: number
  maxVisits?: number
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
  studentProfile?: StudentProfile
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

export interface DashboardData {
  settings: AppSettings
  games: LibraryGame[]
  systemProfile: SystemProfile
}
