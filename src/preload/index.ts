import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AnalyzeGameQuickRequest,
  AnalyzeGameQuickProgress,
  AnalyzePositionRequest,
  AnalyzePositionProgress,
  DashboardData,
  FoxSyncResponse,
  FoxSyncRequest,
  GameRecord,
  KataGoAssetInstallProgress,
  KataGoAssetInstallRequest,
  KataGoAssetInstallResult,
  KataGoAssetStatus,
  KataGoBenchmarkRequest,
  KataGoBenchmarkResult,
  KataGoCancelAnalysisRequest,
  KataGoCancelAnalysisResult,
  LibraryImportResult,
  LlmModelsListRequest,
  LlmModelsListResult,
  LlmSettingsTestRequest,
  LlmSettingsTestResult,
  KataGoMoveAnalysis,
  ReviewRequest,
  ReviewResult,
  StudentBindingSuggestion,
  StudentProfile,
  ReleaseReadinessResult,
  TeacherRunRequest,
  TeacherRunProgress,
  TeacherRunResult
} from '@main/lib/types'
import type { DiagnosticsReport } from '@main/services/diagnostics/types'
import type { KnowledgeSearchQuery, KnowledgeSearchResult } from '@main/services/knowledge/schema'

export type DesktopCommand =
  | 'open-command-palette'
  | 'open-settings'
  | 'import-sgf'
  | 'analyze-current'
  | 'analyze-game'
  | 'analyze-recent'
  | 'toggle-library'
  | 'open-ui-gallery'

const api = {
  getDashboard: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:get'),
  getGameRecord: (gameId: string): Promise<GameRecord> => ipcRenderer.invoke('library:record', gameId),
  importLibrary: (): Promise<LibraryImportResult> => ipcRenderer.invoke('library:import'),
  updateSettings: (payload: Partial<AppSettings>): Promise<DashboardData> => ipcRenderer.invoke('settings:update', payload),
  autoDetectSettings: (): Promise<DashboardData> => ipcRenderer.invoke('settings:auto-detect'),
  syncFox: (payload: FoxSyncRequest): Promise<FoxSyncResponse> => ipcRenderer.invoke('fox:sync', payload),
  startReview: (payload: ReviewRequest): Promise<ReviewResult> => ipcRenderer.invoke('review:start', payload),
  analyzePosition: (payload: AnalyzePositionRequest): Promise<KataGoMoveAnalysis> => ipcRenderer.invoke('katago:analyze-position', payload),
  analyzePositionStream: (payload: AnalyzePositionRequest): Promise<KataGoMoveAnalysis> => ipcRenderer.invoke('katago:analyze-position-stream', payload),
  analyzeGameQuick: (payload: AnalyzeGameQuickRequest): Promise<KataGoMoveAnalysis[]> => ipcRenderer.invoke('katago:analyze-game-quick', payload),
  cancelKataGoAnalysis: (payload: KataGoCancelAnalysisRequest): Promise<KataGoCancelAnalysisResult> => ipcRenderer.invoke('katago:cancel-analysis', payload),
  benchmarkKataGo: (payload?: KataGoBenchmarkRequest): Promise<KataGoBenchmarkResult> => ipcRenderer.invoke('katago:benchmark', payload ?? {}),
  onAnalyzePositionProgress: (handler: (payload: AnalyzePositionProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnalyzePositionProgress): void => handler(payload)
    ipcRenderer.on('katago:analyze-position-progress', listener)
    return () => ipcRenderer.removeListener('katago:analyze-position-progress', listener)
  },
  onAnalyzeGameQuickProgress: (handler: (payload: AnalyzeGameQuickProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnalyzeGameQuickProgress): void => handler(payload)
    ipcRenderer.on('katago:analyze-game-quick-progress', listener)
    return () => ipcRenderer.removeListener('katago:analyze-game-quick-progress', listener)
  },
  getDiagnostics: (): Promise<DiagnosticsReport> => ipcRenderer.invoke('diagnostics:get'),
  inspectKataGoAssets: (): Promise<KataGoAssetStatus> => ipcRenderer.invoke('katago-assets:inspect'),
  installKataGoOfficialModel: (payload: KataGoAssetInstallRequest): Promise<KataGoAssetInstallResult> => ipcRenderer.invoke('katago-assets:install-official-model', payload),
  onKataGoAssetInstallProgress: (handler: (payload: KataGoAssetInstallProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: KataGoAssetInstallProgress): void => handler(payload)
    ipcRenderer.on('katago-assets:install-progress', listener)
    return () => ipcRenderer.removeListener('katago-assets:install-progress', listener)
  },
  listStudentProfiles: (): Promise<StudentProfile[]> => ipcRenderer.invoke('student:list'),
  suggestStudentBindings: (payload: { blackName?: string; whiteName?: string; source?: string; foxNickname?: string }): Promise<StudentBindingSuggestion[]> => ipcRenderer.invoke('student:suggest-bindings', payload),
  bindSgfGameToStudent: (payload: { gameId: string; studentId?: string; createDisplayName?: string; aliasFromPlayerName?: string }): Promise<StudentProfile | null> => ipcRenderer.invoke('student:bind-sgf-game', payload),
  bindFoxGamesToStudent: (payload: { foxNickname: string; gameIds: string[]; aliases?: string[] }): Promise<StudentProfile> => ipcRenderer.invoke('student:bind-fox-games', payload),
  getStudentForGame: (gameId: string): Promise<StudentProfile | null> => ipcRenderer.invoke('student:for-game', gameId),
  listStudents: (): Promise<StudentProfile[]> => ipcRenderer.invoke('students:list'),
  resolveStudentByFoxNickname: (nickname: string): Promise<StudentProfile> => ipcRenderer.invoke('students:resolve-fox', nickname),
  attachGameToStudent: (payload: { gameId: string; studentId: string }): Promise<StudentProfile> => ipcRenderer.invoke('students:attach-game', payload),
  addStudentAlias: (payload: { studentId: string; alias: string }): Promise<StudentProfile> => ipcRenderer.invoke('students:alias', payload),
  searchKnowledge: (payload: KnowledgeSearchQuery): Promise<KnowledgeSearchResult[]> => ipcRenderer.invoke('knowledge:search', payload),
  runTeacherTask: (payload: TeacherRunRequest): Promise<TeacherRunResult> => ipcRenderer.invoke('teacher:run', payload),
  onTeacherRunProgress: (handler: (payload: TeacherRunProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TeacherRunProgress): void => handler(payload)
    ipcRenderer.on('teacher:run-progress', listener)
    return () => ipcRenderer.removeListener('teacher:run-progress', listener)
  },
  testLlmSettings: (payload: LlmSettingsTestRequest): Promise<LlmSettingsTestResult> => ipcRenderer.invoke('llm:test', payload),
  listLlmModels: (payload: LlmModelsListRequest): Promise<LlmModelsListResult> => ipcRenderer.invoke('llm:list-models', payload),
  getReleaseReadiness: (): Promise<ReleaseReadinessResult> => ipcRenderer.invoke('release:readiness'),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('path:open', filePath),
  onDesktopCommand: (handler: (command: DesktopCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: DesktopCommand): void => handler(command)
    ipcRenderer.on('desktop:command', listener)
    return () => ipcRenderer.removeListener('desktop:command', listener)
  }
}

contextBridge.exposeInMainWorld('gomentor', api)

declare global {
  interface Window {
    gomentor: typeof api
  }
}
