export type ReviewStatus = 'idle' | 'running' | 'done' | 'error'

export interface AppSettings {
  katagoBin: string
  katagoConfig: string
  katagoModel: string
  pythonBin: string
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string
  reviewLanguage: 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'
  defaultPlayerName: string
}

export interface SystemProfile {
  katagoBin: string
  katagoConfig: string
  katagoModel: string
  proxyBaseUrl: string
  proxyApiKey: string
  proxyModels: string[]
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
  maxGames: number
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
}

export interface DashboardData {
  settings: AppSettings
  games: LibraryGame[]
  systemProfile: SystemProfile
}
