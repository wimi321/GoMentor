import type { AppSettings, DashboardData, FoxSyncRequest, ReviewRequest, ReviewResult } from '@main/lib/types'

declare global {
  interface Window {
    katasensei: {
      getDashboard: () => Promise<DashboardData>
      importLibrary: () => Promise<DashboardData>
      updateSettings: (payload: Partial<AppSettings>) => Promise<DashboardData>
      syncFox: (payload: FoxSyncRequest) => Promise<{ dashboard: DashboardData }>
      startReview: (payload: ReviewRequest) => Promise<ReviewResult>
      openPath: (filePath: string) => Promise<void>
    }
  }
}

export {}
