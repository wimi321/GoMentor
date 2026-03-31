import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DashboardData, FoxSyncRequest, ReviewRequest, ReviewResult } from '@main/lib/types'

const api = {
  getDashboard: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:get'),
  importLibrary: (): Promise<DashboardData> => ipcRenderer.invoke('library:import'),
  updateSettings: (payload: Partial<AppSettings>): Promise<DashboardData> => ipcRenderer.invoke('settings:update', payload),
  syncFox: (payload: FoxSyncRequest): Promise<{ dashboard: DashboardData }> => ipcRenderer.invoke('fox:sync', payload),
  startReview: (payload: ReviewRequest): Promise<ReviewResult> => ipcRenderer.invoke('review:start', payload),
  openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('path:open', filePath)
}

contextBridge.exposeInMainWorld('katasensei', api)

declare global {
  interface Window {
    katasensei: typeof api
  }
}
