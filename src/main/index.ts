import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { getGames, getSettings, replaceSettings, setSettings, upsertGames } from './lib/store'
import type { AppSettings, DashboardData, FoxSyncRequest, ReviewRequest } from './lib/types'
import { importSgfFile } from './services/sgf'
import { syncFoxGames } from './services/fox'
import { runReview } from './services/review'
import { applyDetectedDefaults, detectSystemProfile } from './services/systemProfile'

let mainWindow: BrowserWindow | null = null

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: 'KataSensei',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs')
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function dashboard(): Promise<DashboardData> {
  const hydratedSettings = await applyDetectedDefaults(getSettings())
  replaceSettings(hydratedSettings)
  return {
    settings: hydratedSettings,
    games: getGames(),
    systemProfile: await detectSystemProfile(),
  }
}

app.whenReady().then(() => {
  ipcMain.handle('dashboard:get', async () => dashboard())

  ipcMain.handle('settings:update', async (_event, payload: Partial<AppSettings>) => {
    setSettings(payload)
    return dashboard()
  })

  ipcMain.handle('settings:auto-detect', async () => {
    const next = await applyDetectedDefaults(getSettings())
    replaceSettings(next)
    return dashboard()
  })

  ipcMain.handle('library:import', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'SGF files', extensions: ['sgf'] }]
    })
    if (picked.canceled) {
      return dashboard()
    }
    const imported = picked.filePaths.map((filePath) => importSgfFile(filePath, 'upload', 'Local upload'))
    upsertGames(imported)
    return dashboard()
  })

  ipcMain.handle('fox:sync', async (_event, payload: FoxSyncRequest) => {
    const result = await syncFoxGames(payload)
    upsertGames(result.saved)
    return { dashboard: await dashboard(), result }
  })

  ipcMain.handle('review:start', async (_event, payload: ReviewRequest) => runReview(payload))
  ipcMain.handle('path:open', async (_event, filePath: string) => shell.showItemInFolder(filePath))

  createWindow().catch((error) => {
    console.error(error)
    app.exit(1)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
