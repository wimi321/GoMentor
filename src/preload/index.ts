import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AnalyzeGameQuickRequest,
  AnalyzeGameQuickProgress,
  AnalyzePositionRequest,
  DashboardData,
  FoxSyncResponse,
  FoxSyncRequest,
  GameRecord,
  KataGoAssetStatus,
  KataGoBenchmarkRequest,
  KataGoBenchmarkResult,
  LibraryImportResult,
  LlmSettingsTestRequest,
  LlmSettingsTestResult,
  KataGoMoveAnalysis,
  ReviewRequest,
  ReviewResult,
  StudentBindingSuggestion,
  StudentProfile,
  ReleaseReadinessResult,
  TeacherRunRequest,
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
  analyzeGameQuick: (payload: AnalyzeGameQuickRequest): Promise<KataGoMoveAnalysis[]> => ipcRenderer.invoke('katago:analyze-game-quick', payload),
  benchmarkKataGo: (payload?: KataGoBenchmarkRequest): Promise<KataGoBenchmarkResult> => ipcRenderer.invoke('katago:benchmark', payload ?? {}),
  onAnalyzeGameQuickProgress: (handler: (payload: AnalyzeGameQuickProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnalyzeGameQuickProgress): void => handler(payload)
    ipcRenderer.on('katago:analyze-game-quick-progress', listener)
    return () => ipcRenderer.removeListener('katago:analyze-game-quick-progress', listener)
  },
  getDiagnostics: (): Promise<DiagnosticsReport> => ipcRenderer.invoke('diagnostics:get'),
  inspectKataGoAssets: (): Promise<KataGoAssetStatus> => ipcRenderer.invoke('katago-assets:inspect'),
  listStudentProfiles: (): Promise<StudentProfile[]> => ipcRenderer.invoke('student:list'),
  suggestStudentBindings: (payload: { blackName?: string; whiteName?: string; source?: string; foxNickname?: string }): Promise<StudentBindingSuggestion[]> => ipcRenderer.invoke('student:suggest-bindings', payload),
  bindSgfGameToStudent: (payload: { gameId: string; studentId?: string; createDisplayName?: string; aliasFromPlayerName?: string }): Promise<StudentProfile | null> => ipcRenderer.invoke('student:bind-sgf-game', payload),
  bindFoxGamesToStudent: (payload: { foxNickname: string; gameIds: string[]; aliases?: string[] }): Promise<StudentProfile> => ipcRenderer.invoke('student:bind-fox-games', payload),
  listStudents: (): Promise<StudentProfile[]> => ipcRenderer.invoke('students:list'),
  resolveStudentByFoxNickname: (nickname: string): Promise<StudentProfile> => ipcRenderer.invoke('students:resolve-fox', nickname),
  attachGameToStudent: (payload: { gameId: string; studentId: string }): Promise<StudentProfile> => ipcRenderer.invoke('students:attach-game', payload),
  addStudentAlias: (payload: { studentId: string; alias: string }): Promise<StudentProfile> => ipcRenderer.invoke('students:alias', payload),
  searchKnowledge: (payload: KnowledgeSearchQuery): Promise<KnowledgeSearchResult[]> => ipcRenderer.invoke('knowledge:search', payload),
  runTeacherTask: (payload: TeacherRunRequest): Promise<TeacherRunResult> => ipcRenderer.invoke('teacher:run', payload),
  testLlmSettings: (payload: LlmSettingsTestRequest): Promise<LlmSettingsTestResult> => ipcRenderer.invoke('llm:test', payload),
  getReleaseReadiness: (): Promise<ReleaseReadinessResult> => ipcRenderer.invoke('release:readiness'),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('path:open', filePath),
  onDesktopCommand: (handler: (command: DesktopCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: DesktopCommand): void => handler(command)
    ipcRenderer.on('desktop:command', listener)
    return () => ipcRenderer.removeListener('desktop:command', listener)
  }
}

contextBridge.exposeInMainWorld('katasensei', api)

declare global {
  interface Window {
    katasensei: typeof api
  }
}
