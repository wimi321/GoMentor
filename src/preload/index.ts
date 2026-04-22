import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AnalyzeGameQuickRequest,
  AnalyzeGameQuickProgress,
  AnalyzePositionRequest,
  DashboardData,
  FoxSyncRequest,
  FoxSyncResult,
  GameRecord,
  LlmSettingsTestRequest,
  LlmSettingsTestResult,
  KataGoMoveAnalysis,
  ReviewRequest,
  ReviewResult,
  TeacherRunRequest,
  TeacherRunResult
} from '@main/lib/types'

const api = {
  getDashboard: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:get'),
  getGameRecord: (gameId: string): Promise<GameRecord> => ipcRenderer.invoke('library:record', gameId),
  importLibrary: (): Promise<DashboardData> => ipcRenderer.invoke('library:import'),
  updateSettings: (payload: Partial<AppSettings>): Promise<DashboardData> => ipcRenderer.invoke('settings:update', payload),
  autoDetectSettings: (): Promise<DashboardData> => ipcRenderer.invoke('settings:auto-detect'),
  syncFox: (payload: FoxSyncRequest): Promise<{ dashboard: DashboardData; result: FoxSyncResult }> => ipcRenderer.invoke('fox:sync', payload),
  startReview: (payload: ReviewRequest): Promise<ReviewResult> => ipcRenderer.invoke('review:start', payload),
  analyzePosition: (payload: AnalyzePositionRequest): Promise<KataGoMoveAnalysis> => ipcRenderer.invoke('katago:analyze-position', payload),
  analyzeGameQuick: (payload: AnalyzeGameQuickRequest): Promise<KataGoMoveAnalysis[]> => ipcRenderer.invoke('katago:analyze-game-quick', payload),
  onAnalyzeGameQuickProgress: (handler: (payload: AnalyzeGameQuickProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnalyzeGameQuickProgress): void => handler(payload)
    ipcRenderer.on('katago:analyze-game-quick-progress', listener)
    return () => ipcRenderer.removeListener('katago:analyze-game-quick-progress', listener)
  },
  runTeacherTask: (payload: TeacherRunRequest): Promise<TeacherRunResult> => ipcRenderer.invoke('teacher:run', payload),
  testLlmSettings: (payload: LlmSettingsTestRequest): Promise<LlmSettingsTestResult> => ipcRenderer.invoke('llm:test', payload),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('path:open', filePath)
}

contextBridge.exposeInMainWorld('katasensei', api)

declare global {
  interface Window {
    katasensei: typeof api
  }
}
