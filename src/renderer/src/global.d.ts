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
  TeacherRunProgress,
  TeacherRunResult
} from '@main/lib/types'
import type { DiagnosticsReport } from '@main/services/diagnostics/types'
import type { KnowledgeSearchQuery, KnowledgeSearchResult } from '@main/services/knowledge/schema'

type DesktopCommand =
  | 'open-command-palette'
  | 'open-settings'
  | 'import-sgf'
  | 'analyze-current'
  | 'analyze-game'
  | 'analyze-recent'
  | 'toggle-library'
  | 'open-ui-gallery'

declare global {
  interface Window {
    katasensei: {
      getDashboard: () => Promise<DashboardData>
      getGameRecord: (gameId: string) => Promise<GameRecord>
      importLibrary: () => Promise<LibraryImportResult>
      updateSettings: (payload: Partial<AppSettings>) => Promise<DashboardData>
      autoDetectSettings: () => Promise<DashboardData>
      syncFox: (payload: FoxSyncRequest) => Promise<FoxSyncResponse>
      startReview: (payload: ReviewRequest) => Promise<ReviewResult>
      analyzePosition: (payload: AnalyzePositionRequest) => Promise<KataGoMoveAnalysis>
      analyzePositionStream: (payload: AnalyzePositionRequest) => Promise<KataGoMoveAnalysis>
      analyzeGameQuick: (payload: AnalyzeGameQuickRequest) => Promise<KataGoMoveAnalysis[]>
      benchmarkKataGo: (payload?: KataGoBenchmarkRequest) => Promise<KataGoBenchmarkResult>
      onAnalyzePositionProgress: (handler: (payload: AnalyzePositionProgress) => void) => () => void
      onAnalyzeGameQuickProgress: (handler: (payload: AnalyzeGameQuickProgress) => void) => () => void
      getDiagnostics: () => Promise<DiagnosticsReport>
      inspectKataGoAssets: () => Promise<KataGoAssetStatus>
      listStudentProfiles: () => Promise<StudentProfile[]>
      suggestStudentBindings: (payload: { blackName?: string; whiteName?: string; source?: string; foxNickname?: string }) => Promise<StudentBindingSuggestion[]>
      bindSgfGameToStudent: (payload: { gameId: string; studentId?: string; createDisplayName?: string; aliasFromPlayerName?: string }) => Promise<StudentProfile | null>
      bindFoxGamesToStudent: (payload: { foxNickname: string; gameIds: string[]; aliases?: string[] }) => Promise<StudentProfile>
      getStudentForGame: (gameId: string) => Promise<StudentProfile | null>
      listStudents: () => Promise<StudentProfile[]>
      resolveStudentByFoxNickname: (nickname: string) => Promise<StudentProfile>
      attachGameToStudent: (payload: { gameId: string; studentId: string }) => Promise<StudentProfile>
      addStudentAlias: (payload: { studentId: string; alias: string }) => Promise<StudentProfile>
      searchKnowledge: (payload: KnowledgeSearchQuery) => Promise<KnowledgeSearchResult[]>
      runTeacherTask: (payload: TeacherRunRequest) => Promise<TeacherRunResult>
      onTeacherRunProgress: (handler: (payload: TeacherRunProgress) => void) => () => void
      testLlmSettings: (payload: LlmSettingsTestRequest) => Promise<LlmSettingsTestResult>
      getReleaseReadiness: () => Promise<ReleaseReadinessResult>
      openPath: (filePath: string) => Promise<void>
      onDesktopCommand?: (handler: (command: DesktopCommand) => void) => () => void
    }
  }
}

export {}
