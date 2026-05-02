import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type ContextMenuParams, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { isAbsolute, relative, resolve, join } from 'node:path'
import { appHome, findGame, getGames, getSettings, hasLlmApiKey, replaceSettings, setSettings, upsertGames } from './lib/store'
import type { AnalyzeGameQuickRequest, AnalyzePositionRequest, AppSettings, DashboardData, FoxSyncRequest, KataGoAssetInstallRequest, KataGoBenchmarkRequest, KataGoCancelAnalysisRequest, LlmModelsListRequest, LlmSettingsTestRequest, ReviewRequest, TeacherRunRequest } from './lib/types'
import { importSgfFile, readGameRecord } from './services/sgf'
import { ensureFoxGameDownloaded, syncFoxGames } from './services/fox'
import { runReview } from './services/review'
import { applyDetectedDefaults, detectSystemProfile } from './services/systemProfile'
import { runTeacherTask } from './services/teacherAgent'
import { listLlmModels, testLlmSettings } from './services/llm'
import { analyzeGameQuick, analyzePosition, analyzePositionWithProgress, cancelKataGoAnalysis } from './services/katago'
import { benchmarkKataGo } from './services/katagoBenchmark'
import { collectDiagnostics } from './services/diagnostics'
import { searchKnowledgeCards } from './services/knowledge/searchLocal'
import { inspectKataGoAssets, installOfficialKataGoModel } from './services/katago/katagoAssets'
import { bindFoxGamesToStudent, bindSgfGameToStudent, suggestStudentBindings } from './services/library/studentBinding'
import { inspectReleaseReadiness } from './services/release/readiness'
import {
  attachGameToStudent,
  listStudents,
  readStudentForGame,
  resolveStudentByFoxNickname,
  resolveStudentByName,
  upsertStudentAlias
} from './services/studentProfile'

let mainWindow: BrowserWindow | null = null
type DesktopCommand =
  | 'open-command-palette'
  | 'open-settings'
  | 'import-sgf'
  | 'analyze-current'
  | 'analyze-game'
  | 'analyze-recent'
  | 'toggle-library'
  | 'open-ui-gallery'

const remoteDebuggingPort = process.env.GOMENTOR_REMOTE_DEBUGGING_PORT
if (remoteDebuggingPort && /^\d+$/.test(remoteDebuggingPort)) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebuggingPort)
}

function assetPath(fileName: string): string {
  return join(__dirname, '../../assets', fileName)
}

function assertManagedPath(filePath: string): string {
  const root = resolve(appHome)
  const target = resolve(filePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('只能打开 GoMentor 管理目录中的文件')
  }
  return target
}

function safeSendToRenderer(event: IpcMainInvokeEvent, channel: string, payload: unknown): boolean {
  if (event.sender.isDestroyed()) {
    return false
  }
  try {
    event.sender.send(channel, payload)
    return true
  } catch (error) {
    if (!String(error).includes('Object has been destroyed')) {
      console.warn(`Failed to send renderer event "${channel}"`, error)
    }
    return false
  }
}

function attachTextEditingContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params: ContextMenuParams) => {
    const hasSelection = params.selectionText.trim().length > 0
    const isEditable = params.isEditable
    if (!isEditable && !hasSelection) {
      return
    }

    const template: MenuItemConstructorOptions[] = [
      ...(isEditable
        ? [
            { role: 'undo' as const },
            { role: 'redo' as const },
            { type: 'separator' as const },
            { role: 'cut' as const, enabled: hasSelection },
            { role: 'copy' as const, enabled: hasSelection },
            { role: 'paste' as const },
            { role: 'pasteAndMatchStyle' as const },
            { role: 'delete' as const, enabled: hasSelection },
            { type: 'separator' as const },
            { role: 'selectAll' as const }
          ]
        : [
            { role: 'copy' as const, enabled: hasSelection },
            { type: 'separator' as const },
            { role: 'selectAll' as const }
          ])
    ]
    Menu.buildFromTemplate(template).popup({ window })
  })
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: 'GoMentor',
    icon: assetPath('icon.png'),
    backgroundColor: '#0f1115',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 18 }
        }
      : {}),
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
  attachTextEditingContextMenu(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendDesktopCommand(command: DesktopCommand): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('desktop:command', command)
}

function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { label: 'Preferences...', accelerator: 'Command+,', click: () => sendDesktopCommand('open-settings') },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        } satisfies MenuItemConstructorOptions]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import SGF Game Record...', accelerator: 'CommandOrControl+O', click: () => sendDesktopCommand('import-sgf') },
        { type: 'separator' },
        { label: 'Command Palette...', accelerator: 'CommandOrControl+K', click: () => sendDesktopCommand('open-command-palette') },
        { label: 'Settings...', accelerator: process.platform === 'darwin' ? 'Command+,' : 'Control+,', click: () => sendDesktopCommand('open-settings') },
        ...(process.platform === 'darwin' ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Analyze',
      submenu: [
        { label: 'Analyze Current Move', accelerator: 'CommandOrControl+1', click: () => sendDesktopCommand('analyze-current') },
        { label: 'Analyze Full Game', accelerator: 'CommandOrControl+2', click: () => sendDesktopCommand('analyze-game') },
        { label: 'Analyze Recent 10 Games', accelerator: 'CommandOrControl+3', click: () => sendDesktopCommand('analyze-recent') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Library', accelerator: 'CommandOrControl+B', click: () => sendDesktopCommand('toggle-library') },
        { label: 'Open UI Gallery', accelerator: 'CommandOrControl+Shift+G', click: () => sendDesktopCommand('open-ui-gallery') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
  buildApplicationMenu()

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

  ipcMain.handle('library:import', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined
    const dialogOptions: Electron.OpenDialogOptions = {
      title: '导入棋谱 SGF 文件',
      buttonLabel: '导入棋谱',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'SGF files', extensions: ['sgf'] }]
    }
    const picked = owner
      ? await dialog.showOpenDialog(owner, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
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
    const readyGame = await ensureFoxGameDownloaded(game)
    return readGameRecord(readyGame)
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
  ipcMain.handle('katago-assets:install-official-model', async (event, payload: KataGoAssetInstallRequest | undefined) =>
    installOfficialKataGoModel(payload ?? {}, (progress) => {
      safeSendToRenderer(event, 'katago-assets:install-progress', progress)
    })
  )
  ipcMain.handle('student:list', async () => listStudents())
  ipcMain.handle('student:suggest-bindings', async (_event, payload) => suggestStudentBindings(payload))
  ipcMain.handle('student:bind-sgf-game', async (_event, payload) => bindSgfGameToStudent(payload))
  ipcMain.handle('student:bind-fox-games', async (_event, payload) => bindFoxGamesToStudent(payload))
  ipcMain.handle('student:for-game', async (_event, gameId: string) => readStudentForGame(gameId))
  ipcMain.handle('students:list', async () => listStudents())
  ipcMain.handle('students:resolve-fox', async (_event, nickname: string) => resolveStudentByFoxNickname(nickname))
  ipcMain.handle('students:attach-game', async (_event, payload: { gameId: string; studentId: string }) => attachGameToStudent(payload.gameId, payload.studentId))
  ipcMain.handle('students:alias', async (_event, payload: { studentId: string; alias: string }) => upsertStudentAlias(payload.studentId, payload.alias))
  ipcMain.handle('knowledge:search', async (_event, payload) => searchKnowledgeCards(payload))
  ipcMain.handle('review:start', async (_event, payload: ReviewRequest) => runReview(payload))
  ipcMain.handle('katago:analyze-position', async (_event, payload: AnalyzePositionRequest) =>
    analyzePosition(payload.gameId, payload.moveNumber, payload.maxVisits ?? 500)
  )
  ipcMain.handle('katago:analyze-position-stream', async (event, payload: AnalyzePositionRequest) => {
    try {
      return await analyzePositionWithProgress(
        payload.gameId,
        payload.moveNumber,
        payload.maxVisits ?? 500,
        (analysis, isFinal) => {
          safeSendToRenderer(event, 'katago:analyze-position-progress', {
            runId: payload.runId,
            gameId: payload.gameId,
            moveNumber: payload.moveNumber,
            analysis,
            isFinal
          })
        },
        payload.reportDuringSearchEvery ?? 0.2
      )
    } catch (error) {
      if (String(error).includes('已取消')) return null
      throw error
    }
  })
  ipcMain.handle('katago:analyze-game-quick', async (event, payload: AnalyzeGameQuickRequest) =>
    analyzeGameQuick(payload.gameId, payload.maxVisits, (progress) => {
      safeSendToRenderer(event, 'katago:analyze-game-quick-progress', {
        ...progress,
        runId: payload.runId,
        gameId: payload.gameId
      })
    }, {
      refineVisits: payload.refineVisits,
      refineTopN: payload.refineTopN,
      runId: payload.runId
    })
  )
  ipcMain.handle('katago:cancel-analysis', async (_event, payload: KataGoCancelAnalysisRequest) =>
    cancelKataGoAnalysis(payload)
  )
  ipcMain.handle('katago:benchmark', async (_event, payload: KataGoBenchmarkRequest | undefined) => benchmarkKataGo(payload ?? {}))
  ipcMain.handle('teacher:run', async (event, payload: TeacherRunRequest) =>
    runTeacherTask(payload, (progress) => {
      safeSendToRenderer(event, 'teacher:run-progress', progress)
    })
  )
  ipcMain.handle('llm:test', async (_event, payload: LlmSettingsTestRequest) => testLlmSettings(payload))
  ipcMain.handle('llm:list-models', async (_event, payload: LlmModelsListRequest) => listLlmModels(payload))
  ipcMain.handle('llm:get-saved-api-key', async () => {
    const settings = getSettings()
    return {
      hasKey: settings.llmApiKey.trim().length > 0,
      apiKey: settings.llmApiKey
    }
  })
  ipcMain.handle('release:readiness', async () => inspectReleaseReadiness())
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
