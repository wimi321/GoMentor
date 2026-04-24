import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isAbsolute, relative, resolve, join } from 'node:path'
import { appHome, findGame, getGames, getSettings, hasLlmApiKey, replaceSettings, setSettings, upsertGames } from './lib/store'
import type { AnalyzeGameQuickRequest, AnalyzePositionRequest, AppSettings, DashboardData, FoxSyncRequest, LlmSettingsTestRequest, ReviewRequest, TeacherRunRequest } from './lib/types'
import { importSgfFile, readGameRecord } from './services/sgf'
import { syncFoxGames } from './services/fox'
import { runReview } from './services/review'
import { applyDetectedDefaults, detectSystemProfile } from './services/systemProfile'
import { runTeacherTask } from './services/teacherAgent'
import { testLlmSettings } from './services/llm'
import { analyzeGameQuick, analyzePosition } from './services/katago'
import { collectDiagnostics } from './services/diagnostics'
import { searchKnowledgeCards } from './services/knowledge/searchLocal'
import { inspectKataGoAssets } from './services/katago/katagoAssets'
import { bindFoxGamesToStudent, bindSgfGameToStudent, suggestStudentBindings } from './services/library/studentBinding'
import {
  attachGameToStudent,
  listStudents,
  resolveStudentByFoxNickname,
  resolveStudentByName,
  upsertStudentAlias
} from './services/studentProfile'

let mainWindow: BrowserWindow | null = null

function assetPath(fileName: string): string {
  return join(__dirname, '../../assets', fileName)
}

function assertManagedPath(filePath: string): string {
  const root = resolve(appHome)
  const target = resolve(filePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('只能打开 KataSensei 管理目录中的文件')
  }
  return target
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: 'KataSensei',
    icon: assetPath('icon.png'),
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  const publicSettings = { ...hydratedSettings, llmApiKey: '' }
  const detectedProfile = await detectSystemProfile(hydratedSettings)
  return {
    settings: publicSettings,
    games: getGames(),
    systemProfile: {
      ...detectedProfile,
      proxyApiKey: '',
      hasLlmApiKey: hasLlmApiKey()
    },
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(assetPath('icon.png'))
  }

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
      return { dashboard: await dashboard(), imported: [] }
    }
    const imported = picked.filePaths.map((filePath) => importSgfFile(filePath, 'upload', 'Local upload'))
    upsertGames(imported)
    const defaultPlayer = getSettings().defaultPlayerName.trim()
    if (defaultPlayer) {
      const student = resolveStudentByName(defaultPlayer, 'sgf')
      for (const game of imported) {
        attachGameToStudent(game.id, student.studentId)
      }
    }
    return { dashboard: await dashboard(), imported }
  })

  ipcMain.handle('library:record', async (_event, gameId: string) => {
    const game = findGame(gameId)
    if (!game) {
      throw new Error(`找不到棋谱: ${gameId}`)
    }
    return readGameRecord(game)
  })

  ipcMain.handle('fox:sync', async (_event, payload: FoxSyncRequest) => {
    const result = await syncFoxGames(payload)
    upsertGames(result.saved)
    const student = await bindFoxGamesToStudent({
      foxNickname: result.nickname || payload.keyword,
      gameIds: result.saved.map((game) => game.id),
      aliases: [result.nickname, payload.keyword].filter(Boolean)
    })
    return { dashboard: await dashboard(), result, student }
  })

  ipcMain.handle('diagnostics:get', async () => collectDiagnostics())
  ipcMain.handle('katago-assets:inspect', async () => inspectKataGoAssets())
  ipcMain.handle('student:list', async () => listStudents())
  ipcMain.handle('student:suggest-bindings', async (_event, payload) => suggestStudentBindings(payload))
  ipcMain.handle('student:bind-sgf-game', async (_event, payload) => bindSgfGameToStudent(payload))
  ipcMain.handle('student:bind-fox-games', async (_event, payload) => bindFoxGamesToStudent(payload))
  ipcMain.handle('students:list', async () => listStudents())
  ipcMain.handle('students:resolve-fox', async (_event, nickname: string) => resolveStudentByFoxNickname(nickname))
  ipcMain.handle('students:attach-game', async (_event, payload: { gameId: string; studentId: string }) => attachGameToStudent(payload.gameId, payload.studentId))
  ipcMain.handle('students:alias', async (_event, payload: { studentId: string; alias: string }) => upsertStudentAlias(payload.studentId, payload.alias))
  ipcMain.handle('knowledge:search', async (_event, payload) => searchKnowledgeCards(payload))
  ipcMain.handle('review:start', async (_event, payload: ReviewRequest) => runReview(payload))
  ipcMain.handle('katago:analyze-position', async (_event, payload: AnalyzePositionRequest) =>
    analyzePosition(payload.gameId, payload.moveNumber, payload.maxVisits ?? 500)
  )
  ipcMain.handle('katago:analyze-game-quick', async (event, payload: AnalyzeGameQuickRequest) =>
    analyzeGameQuick(payload.gameId, payload.maxVisits ?? 12, (progress) => {
      event.sender.send('katago:analyze-game-quick-progress', {
        ...progress,
        runId: payload.runId,
        gameId: payload.gameId
      })
    })
  )
  ipcMain.handle('teacher:run', async (_event, payload: TeacherRunRequest) => runTeacherTask(payload))
  ipcMain.handle('llm:test', async (_event, payload: LlmSettingsTestRequest) => testLlmSettings(payload))
  ipcMain.handle('path:open', async (_event, filePath: string) => shell.showItemInFolder(assertManagedPath(filePath)))

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
