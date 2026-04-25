import type { FormEvent, KeyboardEvent, PointerEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnalyzeGameQuickProgress,
  DashboardData,
  GameMove,
  GameRecord,
  KataGoCandidate,
  KataGoAssetStatus,
  KataGoMoveAnalysis,
  KataGoModelPresetId,
  LibraryGame,
  StoneColor,
  StudentBindingSuggestion,
  StudentProfile,
  ReleaseReadinessResult,
  TeacherRunResult
} from '@main/lib/types'
import lizzieBlackStoneUrl from './assets/lizzie/black.png'
import lizzieBoardUrl from './assets/lizzie/board.png'
import lizzieWhiteStoneUrl from './assets/lizzie/white.png'
import logoUrl from '../../../assets/logo.svg'
import { GoBoardV2 } from './features/board/GoBoardV2'
import type { KeyMoveSummary } from './features/board/KeyMoveNavigator'
import { WinrateTimelineV2 } from './features/board/WinrateTimelineV2'
import { parseBoardPoint, type RenderKeyMove } from './features/board/boardGeometry'
import { DiagnosticsGate } from './features/diagnostics/DiagnosticsGate'
import { UiGallery } from './features/gallery/UiGallery'
import { BetaAcceptancePanel, type BetaAcceptanceItem } from './features/release/BetaAcceptancePanel'
import { StudentBindingDialog } from './features/student/StudentBindingDialog'
import { StudentRailCard } from './features/student/StudentRailCard'
import { KataGoAssetsPanel } from './features/settings/KataGoAssetsPanel'
import { TeacherComposerPro } from './features/teacher/TeacherComposerPro'
import { TeacherRunCard } from './features/teacher/TeacherRunCard'
import { TeacherRunCardPro } from './features/teacher/TeacherRunCardPro'
import './features/diagnostics/diagnostics.css'
import './features/student/student.css'
import './features/teacher/teacher-run-card.css'

const emptyDashboard: DashboardData = {
  settings: {
    katagoBin: '',
    katagoConfig: '',
    katagoModel: '',
    katagoModelPreset: 'official-b18-recommended',
    pythonBin: 'python3',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmApiKey: '',
    llmModel: 'gpt-5-mini',
    reviewLanguage: 'zh-CN',
    defaultPlayerName: ''
  },
  games: [],
  systemProfile: {
    katagoBin: '',
    katagoConfig: '',
    katagoModel: '',
    katagoReady: false,
    katagoStatus: 'KataGo Missing',
    katagoModelPreset: 'official-b18-recommended',
    katagoModelPresets: [],
    proxyBaseUrl: '',
    proxyApiKey: '',
    proxyModels: [],
    hasLlmApiKey: false,
    notes: []
  }
}

type ChatMessage = {
  id: string
  role: 'student' | 'teacher'
  content: string
  result?: TeacherRunResult
}

type EvaluationByMove = Record<number, KataGoMoveAnalysis>
type StatusTone = 'good' | 'warn' | 'neutral'

interface StatusPill {
  label: string
  tone: StatusTone
}

interface StudentBindingState {
  game: LibraryGame
  suggestions: StudentBindingSuggestion[]
}

interface LiveAnalysisState {
  running: boolean
  status: string
  visits: number
  bestVisits: number
  targetMoveNumber: number | null
  round: number
}

type DesktopCommand =
  | 'open-command-palette'
  | 'open-settings'
  | 'import-sgf'
  | 'analyze-current'
  | 'analyze-game'
  | 'analyze-recent'
  | 'toggle-library'
  | 'open-ui-gallery'

const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'
const LIVE_ANALYSIS_VISIT_STEPS = [180, 360, 720, 1200, 2000, 3200]
const LIVE_ANALYSIS_TOTAL_VISIT_LIMIT = 3200
const LIVE_ANALYSIS_BEST_VISIT_LIMIT = 1200
const LIVE_ANALYSIS_TIME_LIMIT_MS = 90_000

function safePlayerName(name: string | undefined, fallback: string): string {
  const value = (name ?? '').trim()
  return value || fallback
}

function gameDisplayName(game: LibraryGame): string {
  const black = safePlayerName(game.black, '黑方')
  const white = safePlayerName(game.white, '白方')
  return `${black} vs ${white}`
}

function boardCandidateMoves(analysis: KataGoMoveAnalysis | null): KataGoCandidate[] {
  if (!analysis) {
    return []
  }
  return analysis.after.topMoves.length > 0 ? analysis.after.topMoves : analysis.before.topMoves
}

function analysisHasCandidates(analysis: KataGoMoveAnalysis | undefined | null): boolean {
  return Boolean(analysis && (analysis.before.topMoves.length > 0 || analysis.after.topMoves.length > 0))
}

function candidateVisitsTotal(analysis: KataGoMoveAnalysis | null | undefined): number {
  return analysis?.before.topMoves.reduce((total, candidate) => total + Math.max(0, Number(candidate.visits) || 0), 0) ?? 0
}

function candidateBestVisits(analysis: KataGoMoveAnalysis | null | undefined): number {
  return Math.max(0, Number(analysis?.before.topMoves[0]?.visits) || 0)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function keyMoveSummariesFromEvaluations(evaluations: EvaluationByMove): KeyMoveSummary[] {
  return Object.values(evaluations)
    .flatMap((item) => {
      const severity = evaluationSeverity(item)
      if (severity === 'quiet') {
        return []
      }
      const best = item.before.topMoves[0] ?? item.after.topMoves[0]
      const playedMove = item.playedMove?.move ?? item.currentMove?.gtp
      const loss = item.playedMove?.winrateLoss ?? 0
      const scoreLoss = item.playedMove?.scoreLoss ?? 0
      return [{
        moveNumber: item.moveNumber,
        color: item.currentMove?.color,
        label: best && playedMove ? `${playedMove} -> ${best.move}` : playedMove ?? `第 ${item.moveNumber} 手`,
        gtp: playedMove,
        reason: `胜率损失 ${loss.toFixed(1)}%，目差损失 ${scoreLoss.toFixed(1)}。`,
        winrateDrop: loss / 100,
        scoreLoss,
        severity
      } satisfies KeyMoveSummary]
    })
    .sort((left, right) => {
      const leftLoss = Math.abs(left.winrateDrop ?? 0)
      const rightLoss = Math.abs(right.winrateDrop ?? 0)
      return rightLoss - leftLoss || left.moveNumber - right.moveNumber
    })
    .slice(0, 8)
}

function keyMoveMarksFromSummaries(
  summaries: KeyMoveSummary[],
  evaluations: EvaluationByMove,
  boardSize: number
): RenderKeyMove[] {
  return summaries.flatMap((summary) => {
    const item = evaluations[summary.moveNumber]
    const point = parseBoardPoint(item?.currentMove ?? item?.playedMove?.move ?? summary.gtp, boardSize)
    if (!point) {
      return []
    }
    const severity = !summary.severity || summary.severity === 'quiet' ? 'turning-point' : summary.severity
    return [{
      ...point,
      moveNumber: summary.moveNumber,
      severity,
      label: String(summary.moveNumber)
    } satisfies RenderKeyMove]
  })
}

function shouldOpenUiGallery(): boolean {
  const search = new URLSearchParams(window.location.search)
  return search.has('ui-gallery') || window.location.hash === '#/ui-gallery'
}

export function App(): ReactElement {
  if (shouldOpenUiGallery()) {
    return <UiGallery />
  }

  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard)
  const [selectedId, setSelectedId] = useState('')
  const [record, setRecord] = useState<GameRecord | null>(null)
  const [moveNumber, setMoveNumber] = useState(0)
  const [analysis, setAnalysis] = useState<KataGoMoveAnalysis | null>(null)
  const [evaluations, setEvaluations] = useState<EvaluationByMove>({})
  const [foxKeyword, setFoxKeyword] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState('')
  const [graphBusy, setGraphBusy] = useState(false)
  const [graphProgress, setGraphProgress] = useState('')
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysisState>({
    running: false,
    status: '已暂停',
    visits: 0,
    bestVisits: 0,
    targetMoveNumber: null,
    round: 0
  })
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [llmTestMessage, setLlmTestMessage] = useState('')
  const [currentStudent, setCurrentStudent] = useState<StudentProfile | null>(null)
  const [studentBinding, setStudentBinding] = useState<StudentBindingState | null>(null)
  const [katagoAssets, setKatagoAssets] = useState<KataGoAssetStatus | null>(null)
  const graphRunId = useRef('')
  const liveAnalysisRunId = useRef('')
  const moveNumberRef = useRef(moveNumber)
  const selectedGameIdRef = useRef('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'hello',
      role: 'teacher',
      content: '我会像围棋老师智能体一样工作：看棋盘、读 KataGo、查知识库、记住学生画像。'
    }
  ])

  useEffect(() => {
    void refresh()
    void refreshKataGoAssets()
  }, [])

  const selectedGame = useMemo(
    () => dashboard.games.find((game) => game.id === selectedId) ?? dashboard.games[0],
    [dashboard.games, selectedId]
  )
  const keyMoveSummaries = useMemo(() => keyMoveSummariesFromEvaluations(evaluations), [evaluations])
  const boardKeyMoveMarks = useMemo(
    () => keyMoveMarksFromSummaries(keyMoveSummaries, evaluations, record?.boardSize ?? 19),
    [keyMoveSummaries, evaluations, record?.boardSize]
  )
  const currentBoardKeyMoveMarks = useMemo(
    () => boardKeyMoveMarks.filter((mark) => mark.moveNumber === moveNumber),
    [boardKeyMoveMarks, moveNumber]
  )

  useEffect(() => {
    if (selectedGame && !selectedId) {
      setSelectedId(selectedGame.id)
    }
  }, [selectedGame, selectedId])

  useEffect(() => {
    moveNumberRef.current = moveNumber
  }, [moveNumber])

  useEffect(() => {
    selectedGameIdRef.current = selectedGame?.id ?? ''
  }, [selectedGame?.id])

  useEffect(() => {
    if (!selectedGame) {
      setRecord(null)
      return
    }
    pauseLiveAnalysis('切换棋谱，已暂停精读')
    void loadRecord(selectedGame.id)
  }, [selectedGame?.id])

  useEffect(() => {
    const dispose = window.katasensei.onDesktopCommand?.((command) => runDesktopCommand(command))
    return () => dispose?.()
  }, [selectedGame?.id, moveNumber, busy, record, dashboard.games.length])

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function refresh(): Promise<void> {
    try {
      const next = await window.katasensei.getDashboard()
      setDashboard(next)
      if (!playerName && next.settings.defaultPlayerName) {
        setPlayerName(next.settings.defaultPlayerName)
      }
    } catch (cause) {
      setError(`初始化失败: ${String(cause)}`)
    }
  }

  async function refreshKataGoAssets(): Promise<void> {
    try {
      setKatagoAssets(await window.katasensei.inspectKataGoAssets())
    } catch (cause) {
      setError(`KataGo 资源检查失败: ${String(cause)}`)
    }
  }

  async function loadRecord(gameId: string): Promise<void> {
    try {
      const next = await window.katasensei.getGameRecord(gameId)
      setRecord(next)
      setMoveNumber(next.moves.length)
      setAnalysis(null)
      setEvaluations({})
      void warmupEvaluationGraph(gameId, next.moves.length)
    } catch (cause) {
      setError(String(cause))
    }
  }

  async function warmupEvaluationGraph(gameId: string, defaultMoveNumber: number): Promise<void> {
    const runId = crypto.randomUUID()
    graphRunId.current = runId
    setGraphBusy(true)
    setGraphProgress('启动快速胜率图')
    const disposeProgress = window.katasensei.onAnalyzeGameQuickProgress((progress: AnalyzeGameQuickProgress) => {
      if (graphRunId.current !== runId || progress.runId !== runId || progress.gameId !== gameId) {
        return
      }
      const done = Math.min(progress.analyzedPositions, progress.totalPositions)
      setGraphProgress(`${done}/${progress.totalPositions} 局面`)
      rememberEvaluation(progress.evaluation)
      if (progress.evaluation.moveNumber === defaultMoveNumber) {
        setAnalysis((current) => analysisHasCandidates(current) ? current : progress.evaluation)
      }
    })
    try {
      const quickEvaluations = await window.katasensei.analyzeGameQuick({
        gameId,
        maxVisits: 12,
        runId
      })
      if (graphRunId.current !== runId) {
        return
      }
      const nextMap = Object.fromEntries(quickEvaluations.map((item) => [item.moveNumber, item]))
      setEvaluations((current) => {
        const merged = { ...current }
        for (const item of quickEvaluations) {
          if (!analysisHasCandidates(merged[item.moveNumber])) {
            merged[item.moveNumber] = item
          }
        }
        return merged
      })
      const preferred = nextMap[defaultMoveNumber] ?? quickEvaluations[quickEvaluations.length - 1] ?? null
      setAnalysis((current) => analysisHasCandidates(current) ? current : preferred)
    } catch (cause) {
      if (graphRunId.current === runId) {
        setError(`胜率图生成失败: ${String(cause)}`)
      }
    } finally {
      disposeProgress()
      if (graphRunId.current === runId) {
        setGraphBusy(false)
        setGraphProgress('')
      }
    }
  }

  async function importSgf(): Promise<void> {
    setBusy('import')
    setError('')
    try {
      const { dashboard: next, imported } = await window.katasensei.importLibrary()
      setDashboard(next)
      if (imported[0]) {
        setSelectedId(imported[0].id)
        void openStudentBinding(imported[0])
      } else if (next.games[0]) {
        setSelectedId(next.games[0].id)
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy('')
    }
  }

  async function syncFox(): Promise<void> {
    setBusy('fox')
    setError('')
    try {
      const { dashboard: next, result, student } = await window.katasensei.syncFox({
        keyword: foxKeyword
      })
      setDashboard(next)
      setCurrentStudent(student ?? null)
      setFoxKeyword(result.nickname)
      if (result.saved[0]) {
        setSelectedId(result.saved[0].id)
      } else if (next.games[0]) {
        setSelectedId(next.games[0].id)
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy('')
    }
  }

  async function openStudentBinding(game: LibraryGame): Promise<void> {
    try {
      const suggestions = await window.katasensei.suggestStudentBindings({
        blackName: game.black,
        whiteName: game.white,
        source: game.source,
        foxNickname: game.source === 'fox' ? (foxKeyword || game.sourceLabel.replace(/^Fox\s*/i, '')) : undefined
      })
      setStudentBinding({ game, suggestions })
    } catch (cause) {
      setError(`学生绑定建议生成失败: ${String(cause)}`)
    }
  }

  async function bindImportedGameToExisting(input: { studentId: string; aliasFromPlayerName?: string }): Promise<void> {
    if (!studentBinding) {
      return
    }
    try {
      const student = await window.katasensei.bindSgfGameToStudent({
        gameId: studentBinding.game.id,
        studentId: input.studentId,
        aliasFromPlayerName: input.aliasFromPlayerName
      })
      setCurrentStudent(student)
      setStudentBinding(null)
    } catch (cause) {
      setError(`绑定学生失败: ${String(cause)}`)
    }
  }

  async function createStudentAndBind(input: { displayName: string; foxNickname?: string; aliasFromPlayerName?: string }): Promise<void> {
    if (!studentBinding) {
      return
    }
    try {
      const student = input.foxNickname
        ? await window.katasensei.bindFoxGamesToStudent({
            foxNickname: input.foxNickname,
            gameIds: [studentBinding.game.id],
            aliases: [input.displayName, input.aliasFromPlayerName ?? ''].filter(Boolean)
          })
        : await window.katasensei.bindSgfGameToStudent({
            gameId: studentBinding.game.id,
            createDisplayName: input.displayName,
            aliasFromPlayerName: input.aliasFromPlayerName
          })
      setCurrentStudent(student)
      setStudentBinding(null)
    } catch (cause) {
      setError(`创建学生画像失败: ${String(cause)}`)
    }
  }

  async function saveSettings(form: HTMLFormElement): Promise<void> {
    setBusy('settings')
    setError('')
    try {
      const formData = new FormData(form)
      const next = await window.katasensei.updateSettings({
        katagoModelPreset: String(formData.get('katagoModelPreset') ?? dashboard.settings.katagoModelPreset) as KataGoModelPresetId,
        llmBaseUrl: String(formData.get('llmBaseUrl') ?? ''),
        llmApiKey: String(formData.get('llmApiKey') ?? ''),
        llmModel: String(formData.get('llmModel') ?? '')
      })
      setDashboard(next)
      setLlmTestMessage('配置已保存')
      void refreshKataGoAssets()
      if (selectedGame && record) {
        setAnalysis(null)
        setEvaluations({})
        void warmupEvaluationGraph(selectedGame.id, moveNumber)
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy('')
    }
  }

  async function testLlmSettings(form: HTMLFormElement): Promise<void> {
    setBusy('llm-test')
    setLlmTestMessage('')
    try {
      const formData = new FormData(form)
      const result = await window.katasensei.testLlmSettings({
        llmBaseUrl: String(formData.get('llmBaseUrl') ?? ''),
        llmApiKey: String(formData.get('llmApiKey') ?? ''),
        llmModel: String(formData.get('llmModel') ?? '')
      })
      setLlmTestMessage(result.message)
    } catch (cause) {
      setLlmTestMessage(String(cause))
    } finally {
      setBusy('')
    }
  }

  function appendMessage(message: Omit<ChatMessage, 'id'>): void {
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }])
  }

  function rememberEvaluation(nextAnalysis: KataGoMoveAnalysis): void {
    setEvaluations((current) => ({
      ...current,
      [nextAnalysis.moveNumber]: analysisHasCandidates(current[nextAnalysis.moveNumber]) && !analysisHasCandidates(nextAnalysis)
        ? current[nextAnalysis.moveNumber]
        : nextAnalysis
    }))
  }

  function jumpToMove(next: number): void {
    if (liveAnalysis.running) {
      pauseLiveAnalysis('切换手数，已暂停精读')
    }
    setMoveNumber(next)
    setAnalysis(evaluations[next] ?? null)
  }

  function pauseLiveAnalysis(message = '已暂停精读'): void {
    liveAnalysisRunId.current = crypto.randomUUID()
    setLiveAnalysis((current) => ({
      ...current,
      running: false,
      status: message
    }))
  }

  async function startLiveAnalysis(): Promise<void> {
    if (!record || !selectedGame) {
      return
    }
    const targetMove = Math.max(0, Math.min(record.moves.length, Math.round(moveNumber)))
    const gameId = selectedGame.id
    const runId = crypto.randomUUID()
    const startedAt = Date.now()
    liveAnalysisRunId.current = runId
    setError('')
    setMoveNumber(targetMove)
    setAnalysis(evaluations[targetMove] ?? analysis)
    setLiveAnalysis({
      running: true,
      status: `精读第 ${targetMove} 手`,
      visits: candidateVisitsTotal(evaluations[targetMove] ?? analysis),
      bestVisits: candidateBestVisits(evaluations[targetMove] ?? analysis),
      targetMoveNumber: targetMove,
      round: 0
    })

    for (const [index, maxVisits] of LIVE_ANALYSIS_VISIT_STEPS.entries()) {
      if (liveAnalysisRunId.current !== runId) {
        return
      }
      setLiveAnalysis((current) => ({
        ...current,
        running: true,
        status: `KataGo 精读中 · 上限 ${formatVisits(maxVisits)} visits`,
        round: index + 1,
        targetMoveNumber: targetMove
      }))
      try {
        const nextAnalysis = await window.katasensei.analyzePosition({
          gameId,
          moveNumber: targetMove,
          maxVisits
        })
        if (liveAnalysisRunId.current !== runId || selectedGameIdRef.current !== gameId) {
          return
        }
        const totalVisits = candidateVisitsTotal(nextAnalysis)
        const bestVisits = candidateBestVisits(nextAnalysis)
        rememberEvaluation(nextAnalysis)
        if (moveNumberRef.current === targetMove) {
          setAnalysis(nextAnalysis)
        }
        setLiveAnalysis({
          running: true,
          status: `已搜索 ${formatVisits(totalVisits)} · 一选 ${formatVisits(bestVisits)}`,
          visits: totalVisits,
          bestVisits,
          targetMoveNumber: targetMove,
          round: index + 1
        })
        const elapsed = Date.now() - startedAt
        const reachedTotal = totalVisits >= LIVE_ANALYSIS_TOTAL_VISIT_LIMIT
        const reachedBest = bestVisits >= LIVE_ANALYSIS_BEST_VISIT_LIMIT
        const reachedTime = elapsed >= LIVE_ANALYSIS_TIME_LIMIT_MS
        if (reachedTotal || reachedBest || reachedTime) {
          setLiveAnalysis({
            running: false,
            status: reachedBest
              ? `已达到一选 ${formatVisits(bestVisits)}`
              : reachedTotal
                ? `已达到总搜索 ${formatVisits(totalVisits)}`
                : `已运行 ${Math.round(elapsed / 1000)} 秒`,
            visits: totalVisits,
            bestVisits,
            targetMoveNumber: targetMove,
            round: index + 1
          })
          return
        }
      } catch (cause) {
        if (liveAnalysisRunId.current === runId) {
          setError(`KataGo 精读失败: ${String(cause)}`)
          setLiveAnalysis((current) => ({
            ...current,
            running: false,
            status: '精读失败'
          }))
        }
        return
      }
      await sleep(180)
    }

    if (liveAnalysisRunId.current === runId) {
      setLiveAnalysis((current) => ({
        ...current,
        running: false,
        status: `已完成 ${formatVisits(current.visits)}`
      }))
    }
  }

  async function runMoveAnalysisAt(targetMoveNumber: number): Promise<void> {
    if (!record || !selectedGame || busy !== '') {
      return
    }
    const targetMove = Math.max(0, Math.min(record.moves.length, Math.round(targetMoveNumber)))
    setMoveNumber(targetMove)
    setAnalysis(evaluations[targetMove] ?? null)
    setBusy('teacher')
    setError('')
    const ask = `分析第 ${targetMove} 手`
    appendMessage({ role: 'student', content: ask })
    try {
      const nextAnalysis = await window.katasensei.analyzePosition({
        gameId: selectedGame.id,
        moveNumber: targetMove,
        maxVisits: 520
      })
      setAnalysis(nextAnalysis)
      rememberEvaluation(nextAnalysis)
      const boardImageDataUrl = await renderBoardPng(record, targetMove, nextAnalysis)
      const result = await window.katasensei.runTeacherTask({
        mode: 'current-move',
        prompt: ask,
        gameId: selectedGame.id,
        moveNumber: targetMove,
        playerName,
        boardImageDataUrl,
        prefetchedAnalysis: nextAnalysis
      })
      const finalAnalysis = result.analysis ?? nextAnalysis
      setAnalysis(finalAnalysis)
      rememberEvaluation(finalAnalysis)
      appendMessage({ role: 'teacher', content: result.markdown, result })
    } catch (cause) {
      appendMessage({ role: 'teacher', content: `任务失败：${String(cause)}` })
    } finally {
      setBusy('')
    }
  }

  async function runCurrentMoveAnalysis(): Promise<void> {
    await runMoveAnalysisAt(moveNumber)
  }

  async function runTeacherQuickTask(text: string): Promise<void> {
    if (busy !== '') {
      return
    }
    setBusy('teacher')
    setError('')
    appendMessage({ role: 'student', content: text })
    try {
      const result = await window.katasensei.runTeacherTask({
        mode: 'freeform',
        prompt: text,
        gameId: selectedGame?.id,
        moveNumber,
        playerName
      })
      if (result.analysis) {
        setAnalysis(result.analysis)
        rememberEvaluation(result.analysis)
      }
      appendMessage({ role: 'teacher', content: result.markdown, result })
    } catch (cause) {
      appendMessage({ role: 'teacher', content: `任务失败：${String(cause)}` })
    } finally {
      setBusy('')
    }
  }

  function runDesktopCommand(command: DesktopCommand): void {
    setCommandPaletteOpen(false)
    switch (command) {
      case 'open-command-palette':
        setCommandPaletteOpen(true)
        break
      case 'open-settings':
        setSettingsOpen(true)
        break
      case 'import-sgf':
        void importSgf()
        break
      case 'analyze-current':
        void runCurrentMoveAnalysis()
        break
      case 'analyze-game':
        void runTeacherQuickTask('分析这盘整盘围棋，找出关键问题手、胜负转折点和复盘重点。')
        break
      case 'analyze-recent':
        void runTeacherQuickTask('分析当前学生最近10局围棋，找出常见问题、薄弱环节，并更新学生画像。')
        break
      case 'toggle-library':
        setLibraryCollapsed((value) => !value)
        break
      case 'open-ui-gallery':
        window.location.hash = '#/ui-gallery'
        window.location.reload()
        break
    }
  }

  async function sendTeacherPrompt(event: FormEvent): Promise<void> {
    event.preventDefault()
    const text = prompt.trim()
    if (!text) {
      return
    }
    setPrompt('')
    appendMessage({ role: 'student', content: text })
    setBusy('teacher')
    try {
      const wantsCurrentMove = /当前手|这手|这一手|本手/.test(text)
      if (wantsCurrentMove && record && selectedGame) {
        const nextAnalysis = await window.katasensei.analyzePosition({
          gameId: selectedGame.id,
          moveNumber,
          maxVisits: 520
        })
        setAnalysis(nextAnalysis)
        rememberEvaluation(nextAnalysis)
        const boardImageDataUrl = await renderBoardPng(record, moveNumber, nextAnalysis)
        const result = await window.katasensei.runTeacherTask({
          mode: 'current-move',
          prompt: text,
          gameId: selectedGame.id,
          moveNumber,
          playerName,
          boardImageDataUrl,
          prefetchedAnalysis: nextAnalysis
        })
        if (result.analysis) {
          setAnalysis(result.analysis)
          rememberEvaluation(result.analysis)
        }
        appendMessage({ role: 'teacher', content: result.markdown, result })
      } else {
        const result = await window.katasensei.runTeacherTask({
          mode: 'freeform',
          prompt: text,
          gameId: selectedGame?.id,
          moveNumber,
          playerName
        })
        appendMessage({ role: 'teacher', content: result.markdown, result })
      }
    } catch (cause) {
      appendMessage({ role: 'teacher', content: `任务失败：${String(cause)}` })
    } finally {
      setBusy('')
    }
  }

  const statusItems: StatusPill[] = [
    {
      label: dashboard.systemProfile.katagoReady ? dashboard.systemProfile.katagoStatus : 'KataGo 缺失',
      tone: dashboard.systemProfile.katagoReady ? 'good' : 'warn'
    },
    {
      label: dashboard.systemProfile.hasLlmApiKey ? 'LLM 就绪' : 'LLM 未配置',
      tone: dashboard.systemProfile.hasLlmApiKey ? 'good' : 'warn'
    },
    {
      label: `${dashboard.games.length} 棋谱`,
      tone: 'neutral'
    }
  ]

  return (
    <DiagnosticsGate>
      <div className="desktop-shell">
        <DesktopTitleBar
          selectedGame={selectedGame}
          statusItems={statusItems}
          busy={busy}
          onCommand={runDesktopCommand}
        />
        <div className={`studio ${libraryCollapsed ? 'studio--collapsed' : ''}`}>
        <aside className="library-rail">
          <div className="rail-head">
            <button className="icon-button" onClick={() => setLibraryCollapsed((value) => !value)} title="切换棋谱栏">
              {libraryCollapsed ? '>' : '<'}
            </button>
            {!libraryCollapsed ? (
              <div className="brand-mark">
                <img src={logoUrl} alt="" aria-hidden="true" />
                <strong>KataSensei</strong>
              </div>
            ) : null}
          </div>
          {!libraryCollapsed ? (
            <LibraryPanel
              dashboard={dashboard}
              selectedGame={selectedGame}
              foxKeyword={foxKeyword}
              busy={busy}
              currentStudent={currentStudent}
              onSelect={setSelectedId}
              onSync={() => void syncFox()}
              onFoxKeyword={setFoxKeyword}
            />
          ) : null}
        </aside>

        <main className="board-workspace">
          <header className="topbar">
            <div>
              <h1>{selectedGame ? gameDisplayName(selectedGame) : '未选择棋谱'}</h1>
              <StatusPills items={statusItems} />
            </div>
          </header>

          <section className="board-stage">
            {record ? (
              <div className="board-table board-table--v2">
                {record.boardSize >= 2 ? (
                  <GoBoardV2 record={record} moveNumber={moveNumber} analysis={analysis} keyMoves={currentBoardKeyMoveMarks} />
                ) : (
                  <GoBoard record={record} moveNumber={moveNumber} analysis={analysis} />
                )}
              </div>
            ) : (
              <div className="empty-board">导入 SGF 后开始复盘</div>
            )}
          </section>

          <section className="timeline-panel">
            {record ? (
              <WinrateTimelineV2
                evaluations={Object.values(evaluations)}
                currentMoveNumber={moveNumber}
                totalMoves={record.moves.length}
                loading={graphBusy}
                loadingLabel={graphProgress}
                onMove={jumpToMove}
                summary={
                  <TimelineAnalysisHeader
                    record={record}
                    moveNumber={moveNumber}
                    analysis={(analysis?.moveNumber === moveNumber ? analysis : evaluations[moveNumber]) ?? null}
                    liveAnalysis={liveAnalysis}
                    disabled={busy !== ''}
                    onStart={() => void startLiveAnalysis()}
                    onPause={() => pauseLiveAnalysis()}
                  />
                }
              />
            ) : (
              <EvaluationGraph
                analysis={analysis}
                evaluations={Object.values(evaluations)}
                moveNumber={moveNumber}
                totalMoves={0}
                loading={graphBusy}
                loadingLabel={graphProgress}
                onMove={jumpToMove}
              />
            )}
          </section>
        </main>

        <aside className="teacher-column">
          <TeacherPanel
            messages={messages}
            prompt={prompt}
            busy={busy}
            dashboard={dashboard}
            katagoAssets={katagoAssets}
            error={error}
            onPrompt={setPrompt}
            onSubmit={(event) => void sendTeacherPrompt(event)}
            onAnalyze={() => void runCurrentMoveAnalysis()}
            onAnalyzeGame={() => void runTeacherQuickTask('分析这盘整盘围棋，找出关键问题手、胜负转折点和复盘重点。')}
            onAnalyzeRecent={() => void runTeacherQuickTask('分析当前学生最近10局围棋，找出常见问题、薄弱环节，并更新学生画像。')}
            onSettingsOpen={() => setSettingsOpen(true)}
            onJumpToMove={jumpToMove}
            onAnalyzeMove={(targetMove) => void runMoveAnalysisAt(targetMove)}
          />
        </aside>
      </div>
        <DesktopStatusBar
          selectedGame={selectedGame}
          record={record}
          moveNumber={moveNumber}
          graphBusy={graphBusy}
          graphProgress={graphProgress}
          liveAnalysis={liveAnalysis}
          katagoReady={katagoAssets?.ready || dashboard.systemProfile.katagoReady}
          llmReady={dashboard.systemProfile.hasLlmApiKey}
          busy={busy}
        />
        <CommandPalette
          open={commandPaletteOpen}
          busy={busy}
          hasRecord={Boolean(record)}
          hasGames={dashboard.games.length > 0}
          onClose={() => setCommandPaletteOpen(false)}
          onRun={runDesktopCommand}
        />
        <DesktopPreferencesModal
          open={settingsOpen}
          dashboard={dashboard}
          katagoAssets={katagoAssets}
          busy={busy}
          llmTestMessage={llmTestMessage}
          onClose={() => setSettingsOpen(false)}
          onSave={(form) => void saveSettings(form)}
          onTest={(form) => void testLlmSettings(form)}
          onRefreshKataGoAssets={() => void refreshKataGoAssets()}
        />
      </div>
      <StudentBindingDialog
        open={Boolean(studentBinding)}
        blackName={studentBinding?.game.black}
        whiteName={studentBinding?.game.white}
        suggestions={studentBinding?.suggestions.map((suggestion) => suggestion.student)}
        onClose={() => setStudentBinding(null)}
        onSkip={() => setStudentBinding(null)}
        onBindExisting={(input) => void bindImportedGameToExisting(input)}
        onCreateStudent={(input) => void createStudentAndBind(input)}
      />
    </DiagnosticsGate>
  )
}

function LibraryPanel({
  dashboard,
  selectedGame,
  foxKeyword,
  busy,
  currentStudent,
  onSelect,
  onSync,
  onFoxKeyword
}: {
  dashboard: DashboardData
  selectedGame?: LibraryGame
  foxKeyword: string
  busy: string
  currentStudent: StudentProfile | null
  onSelect: (id: string) => void
  onSync: () => void
  onFoxKeyword: (value: string) => void
}): ReactElement {
  const [page, setPage] = useState(1)
  const pageSize = 14
  const keyword = foxKeyword.trim().toLowerCase()
  const visibleGames = useMemo(() => {
    if (!keyword) {
      return dashboard.games
    }
    return dashboard.games.filter((game) => {
      const haystack = [
        gameDisplayName(game),
        game.black,
        game.white,
        game.sourceLabel,
        game.event,
        game.title
      ].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  }, [dashboard.games, keyword])
  const pageCount = Math.max(1, Math.ceil(visibleGames.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageGames = visibleGames.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [keyword, dashboard.games.length])

  return (
    <div className="rail-body">
      <form
        className="fox-sync-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSync()
        }}
      >
        <input value={foxKeyword} onChange={(event) => onFoxKeyword(event.target.value)} placeholder="输入野狐昵称" />
        <button className="primary-button fox-search-button" type="submit" disabled={!foxKeyword.trim() || busy !== ''}>
          {busy === 'fox' ? '搜索中' : '搜索野狐棋谱'}
        </button>
      </form>
      <StudentRailCard
        displayName={currentStudent?.displayName}
        primaryFoxNickname={currentStudent?.primaryFoxNickname}
        gameCount={currentStudent?.recentGameIds.length ?? 0}
      />
      <div className="library-list-head">
        <span>{keyword ? '野狐棋谱' : '棋谱库'}</span>
        <small>{visibleGames.length} 盘</small>
      </div>
      <div className="game-list">
        {pageGames.map((game) => (
          <button key={game.id} className={`game-row ${selectedGame?.id === game.id ? 'is-active' : ''}`} onClick={() => onSelect(game.id)}>
            <span>{gameDisplayName(game)}</span>
            <small>{game.date || '未知日期'} · {game.result || '未知结果'} · {game.source === 'fox' ? 'Fox' : 'SGF'}</small>
          </button>
        ))}
        {pageGames.length === 0 ? <div className="empty-list">没有匹配的棋谱</div> : null}
      </div>
      <div className="pagination-row">
        <button className="ghost-button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
          上一页
        </button>
        <span>{safePage} / {pageCount}</span>
        <button className="ghost-button" onClick={() => setPage(Math.min(pageCount, safePage + 1))} disabled={safePage >= pageCount}>
          下一页
        </button>
      </div>
    </div>
  )
}

function StatusPills({ items }: { items: StatusPill[] }): ReactElement {
  return (
    <div className="status-strip" aria-label="系统状态">
      {items.map((item) => (
        <span key={item.label} className={`status-pill status-pill--${item.tone}`}>
          {item.label}
        </span>
      ))}
    </div>
  )
}

function DesktopTitleBar({
  selectedGame,
  statusItems,
  busy,
  onCommand
}: {
  selectedGame?: LibraryGame
  statusItems: StatusPill[]
  busy: string
  onCommand: (command: DesktopCommand) => void
}): ReactElement {
  return (
    <header className="desktop-titlebar">
      <div className="desktop-titlebar__brand">
        <img src={logoUrl} alt="" aria-hidden="true" />
        <div>
          <strong>KataSensei</strong>
          <span>{selectedGame ? gameDisplayName(selectedGame) : 'Desktop Workbench'}</span>
        </div>
      </div>
      <div className="desktop-titlebar__center">
        <StatusPills items={statusItems} />
      </div>
      <div className="desktop-titlebar__actions">
        <button type="button" onClick={() => onCommand('open-command-palette')}>Command</button>
        <button type="button" onClick={() => onCommand('import-sgf')}>Import SGF</button>
        <button type="button" onClick={() => onCommand('open-settings')}>Preferences</button>
        <span>{busy ? 'Working' : 'Idle'}</span>
      </div>
    </header>
  )
}

function DesktopStatusBar({
  selectedGame,
  record,
  moveNumber,
  graphBusy,
  graphProgress,
  liveAnalysis,
  katagoReady,
  llmReady,
  busy
}: {
  selectedGame?: LibraryGame
  record: GameRecord | null
  moveNumber: number
  graphBusy: boolean
  graphProgress: string
  liveAnalysis: LiveAnalysisState
  katagoReady: boolean
  llmReady: boolean
  busy: string
}): ReactElement {
  return (
    <footer className="desktop-statusbar">
      <span>{selectedGame ? gameDisplayName(selectedGame) : 'No game selected'}</span>
      <span>{record ? `Move ${moveNumber}/${record.moves.length}` : 'Import SGF to start'}</span>
      <span>{graphBusy ? `Winrate ${graphProgress || 'analyzing'}` : 'Winrate ready'}</span>
      <span>{liveAnalysis.running ? `Live ${liveAnalysis.status}` : `Live ${formatVisits(liveAnalysis.visits)} visits`}</span>
      <span data-ready={katagoReady}>KataGo</span>
      <span data-ready={llmReady}>Vision LLM</span>
      <em>{busy ? `Task: ${busy}` : 'Ready'}</em>
    </footer>
  )
}

function CommandPalette({
  open,
  busy,
  hasRecord,
  hasGames,
  onClose,
  onRun
}: {
  open: boolean
  busy: string
  hasRecord: boolean
  hasGames: boolean
  onClose: () => void
  onRun: (command: DesktopCommand) => void
}): ReactElement | null {
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (open) {
      setQuery('')
    }
  }, [open])
  const commands = useMemo(() => [
    { id: 'analyze-current' as const, title: '分析当前手', detail: '截图棋盘，调用 KataGo，再让老师讲解', shortcut: 'Ctrl/Cmd 1', disabled: !hasRecord || busy !== '' },
    { id: 'analyze-game' as const, title: '分析整盘围棋', detail: '扫描关键问题手和胜负转折点', shortcut: 'Ctrl/Cmd 2', disabled: !hasRecord || busy !== '' },
    { id: 'analyze-recent' as const, title: '分析近 10 局', detail: '聚合学生稳定问题并更新画像', shortcut: 'Ctrl/Cmd 3', disabled: !hasGames || busy !== '' },
    { id: 'import-sgf' as const, title: '导入 SGF', detail: '从本机文件系统添加棋谱', shortcut: 'Ctrl/Cmd O', disabled: busy !== '' },
    { id: 'open-settings' as const, title: '打开 Preferences', detail: '配置模型、KataGo 资源和发布 readiness', shortcut: 'Ctrl/Cmd ,', disabled: false },
    { id: 'toggle-library' as const, title: '切换棋谱栏', detail: '收起或展开左侧学生工作区', shortcut: 'Ctrl/Cmd B', disabled: false },
    { id: 'open-ui-gallery' as const, title: '打开 UI Gallery', detail: '进入内部视觉 QA 样例页', shortcut: 'Ctrl/Cmd Shift G', disabled: false }
  ], [busy, hasGames, hasRecord])
  const filtered = commands.filter((command) => {
    const haystack = `${command.title} ${command.detail}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      onClose()
    }
    if (event.key === 'Enter') {
      const first = filtered.find((command) => !command.disabled)
      if (first) {
        onRun(first.id)
      }
    }
  }
  if (!open) {
    return null
  }
  return (
    <div className="desktop-command-palette" role="dialog" aria-modal="true" aria-label="KataSensei command palette" onMouseDown={onClose}>
      <section className="desktop-command-palette__panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <span>Command Palette</span>
          <button type="button" onClick={onClose}>Esc</button>
        </header>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入任务或命令，例如：分析当前手、导入 SGF、打开设置"
        />
        <div className="desktop-command-palette__list">
          {filtered.map((command) => (
            <button key={command.id} type="button" disabled={command.disabled} onClick={() => onRun(command.id)}>
              <strong>{command.title}</strong>
              <small>{command.detail}</small>
              <em>{command.shortcut}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function DesktopPreferencesModal({
  open,
  dashboard,
  katagoAssets,
  busy,
  llmTestMessage,
  onClose,
  onSave,
  onTest,
  onRefreshKataGoAssets
}: {
  open: boolean
  dashboard: DashboardData
  katagoAssets: KataGoAssetStatus | null
  busy: string
  llmTestMessage: string
  onClose: () => void
  onSave: (form: HTMLFormElement) => void
  onTest: (form: HTMLFormElement) => void
  onRefreshKataGoAssets: () => void
}): ReactElement | null {
  if (!open) {
    return null
  }
  return (
    <div className="desktop-preferences" role="dialog" aria-modal="true" aria-label="KataSensei preferences" onMouseDown={onClose}>
      <section className="desktop-preferences__window" onMouseDown={(event) => event.stopPropagation()}>
        <header className="desktop-preferences__titlebar">
          <div>
            <span>Preferences</span>
            <strong>桌面运行设置</strong>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <SettingsDrawer
          dashboard={dashboard}
          katagoAssets={katagoAssets}
          busy={busy}
          llmTestMessage={llmTestMessage}
          onSave={onSave}
          onTest={onTest}
          onRefreshKataGoAssets={onRefreshKataGoAssets}
        />
      </section>
    </div>
  )
}

function TeacherPanel({
  messages,
  prompt,
  busy,
  dashboard,
  katagoAssets,
  error,
  onPrompt,
  onSubmit,
  onAnalyze,
  onAnalyzeGame,
  onAnalyzeRecent,
  onSettingsOpen,
  onJumpToMove,
  onAnalyzeMove
}: {
  messages: ChatMessage[]
  prompt: string
  busy: string
  dashboard: DashboardData
  katagoAssets: KataGoAssetStatus | null
  error: string
  onPrompt: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onAnalyze: () => void
  onAnalyzeGame: () => void
  onAnalyzeRecent: () => void
  onSettingsOpen: () => void
  onJumpToMove: (moveNumber: number) => void
  onAnalyzeMove: (moveNumber: number) => void
}): ReactElement {
  const modelName = dashboard.settings.llmModel || '未选择模型'
  const katagoLabel = katagoAssets?.ready || dashboard.systemProfile.katagoReady ? 'KataGo ready' : 'KataGo missing'
  const llmLabel = dashboard.systemProfile.hasLlmApiKey ? 'Vision LLM ready' : 'LLM setup needed'
  const hasRunningTask = busy === 'teacher'
  return (
    <div className="teacher-panel teacher-agent-editor">
      <header className="teacher-editor-head">
        <div className="teacher-editor-title">
          <span>KataSensei AI Editor</span>
          <strong>对话式围棋分析线程</strong>
          <div className="teacher-editor-meta">
            <em>{modelName}</em>
            <em>{katagoLabel}</em>
            <em>{llmLabel}</em>
          </div>
        </div>
        <div className="teacher-editor-actions">
          <span className={`teacher-status ${hasRunningTask ? 'is-running' : ''}`}>{hasRunningTask ? 'Running' : 'Ready'}</span>
          <button className="icon-button" onClick={onSettingsOpen} title="LLM 配置">⚙</button>
        </div>
      </header>

      <div className="teacher-commandbar" aria-label="老师快速任务">
        <button className="teacher-commandbar__primary" onClick={onAnalyze} disabled={busy !== ''}>分析当前手</button>
        <button onClick={onAnalyzeGame} disabled={busy !== ''}>分析整盘</button>
        <button onClick={onAnalyzeRecent} disabled={busy !== ''}>分析近 10 局</button>
        <span>Thread: 当前棋局复盘 · Items: KataGo / 截图 / 知识库 / 学生画像</span>
      </div>

      <div className="message-list agent-thread">
        {messages.map((message) => (
          <article key={message.id} className={`message message--${message.role} agent-turn agent-turn--${message.role}`}>
            <div className="agent-turn__body">
              <header className="agent-turn__head">
                <strong>{message.role === 'teacher' ? 'KataSensei' : '你'}</strong>
                <small>{message.result ? 'turn complete · item stream' : message.role === 'teacher' ? 'assistant note' : 'turn input'}</small>
              </header>
            {message.result ? (
              (message.result.structuredResult ?? message.result.structured) ? (
                <TeacherRunCardPro
                  result={message.result}
                  markdown={message.content}
                  onJumpToMove={onJumpToMove}
                  onAnalyzeMove={onAnalyzeMove}
                />
              ) : (
                <>
                  <TeacherRunCard result={null} toolLogs={message.result.toolLogs} onJumpToMove={onJumpToMove} />
                  <div className="message-copy">{message.content}</div>
                </>
              )
            ) : (
              <div className="message-copy">{message.content}</div>
            )}
            </div>
          </article>
        ))}
        {hasRunningTask ? (
          <div className="message message--teacher message--running agent-turn agent-turn--teacher agent-turn--running">
            <div className="agent-turn__body">
              <header className="agent-turn__head">
                <strong>KataSensei</strong>
                <small>turn running · item stream</small>
              </header>
              <TeacherRunCardPro running markdown="正在规划任务、调用工具和整理讲解..." />
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div className="error-line">{error}</div> : null}
      <TeacherComposerPro
        value={prompt}
        busy={busy !== ''}
        onChange={onPrompt}
        onSubmit={onSubmit}
        onQuickPrompt={(text) => {
          onPrompt(text)
        }}
      />
    </div>
  )
}

function SettingsDrawer({
  dashboard,
  katagoAssets,
  busy,
  llmTestMessage,
  onSave,
  onTest,
  onRefreshKataGoAssets
}: {
  dashboard: DashboardData
  katagoAssets: KataGoAssetStatus | null
  busy: string
  llmTestMessage: string
  onSave: (form: HTMLFormElement) => void
  onTest: (form: HTMLFormElement) => void
  onRefreshKataGoAssets: () => void
}): ReactElement {
  const [releaseReadiness, setReleaseReadiness] = useState<ReleaseReadinessResult | null>(null)
  const [releaseReadinessError, setReleaseReadinessError] = useState('')
  const modelPresets = dashboard.systemProfile.katagoModelPresets
  const selectedPreset = modelPresets.find((preset) => preset.id === dashboard.settings.katagoModelPreset) ?? modelPresets[0]
  const betaItems = useMemo<BetaAcceptanceItem[]>(() => {
    if (releaseReadiness) {
      return releaseReadiness.items.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        detail: item.detail
      }))
    }
    return [
      {
        id: 'katago-assets',
        label: 'KataGo 内置资源',
        status: katagoAssets?.ready ? 'pass' : katagoAssets?.manifestFound ? 'warn' : 'fail',
        detail: katagoAssets?.detail ?? dashboard.systemProfile.katagoStatus
      },
      {
        id: 'llm-provider',
        label: 'Claude 兼容代理',
        status: dashboard.systemProfile.hasLlmApiKey ? 'pass' : 'warn',
        detail: dashboard.systemProfile.hasLlmApiKey ? `模型 ${dashboard.settings.llmModel}` : '未配置 API Key，老师多模态讲解不可用'
      },
      {
        id: 'knowledge',
        label: '本地围棋知识库',
        status: 'pass',
        detail: 'P0 教学卡随应用打包'
      },
      {
        id: 'teacher-ui',
        label: '老师智能体 UI',
        status: 'pass',
        detail: '关键手、工具日志、结构化结果卡已接入'
      }
    ]
  }, [dashboard.settings.llmModel, dashboard.systemProfile.hasLlmApiKey, dashboard.systemProfile.katagoStatus, katagoAssets, releaseReadiness])

  async function refreshReleaseReadiness(): Promise<void> {
    try {
      setReleaseReadinessError('')
      if (!window.katasensei.getReleaseReadiness) {
        return
      }
      setReleaseReadiness(await window.katasensei.getReleaseReadiness())
    } catch (cause) {
      setReleaseReadinessError(`Beta 验收状态读取失败: ${String(cause)}`)
    }
  }

  useEffect(() => {
    void refreshReleaseReadiness()
  }, [])

  return (
    <form
      key={`${dashboard.settings.katagoModelPreset}|${dashboard.settings.llmBaseUrl}|${dashboard.settings.llmModel}`}
      className="settings-drawer"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(event.currentTarget)
      }}
    >
      <label>
        KataGo 权重
        <select name="katagoModelPreset" defaultValue={dashboard.settings.katagoModelPreset}>
          {modelPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} · {preset.badge}
            </option>
          ))}
        </select>
        {selectedPreset ? <small>{selectedPreset.description}</small> : null}
        <small>{dashboard.systemProfile.katagoStatus}</small>
      </label>
      <KataGoAssetsPanel status={katagoAssets} onRefresh={onRefreshKataGoAssets} />
      <BetaAcceptancePanel
        items={betaItems}
        flags={releaseReadiness?.flags}
        onRunChecks={() => {
          void refreshReleaseReadiness()
          onRefreshKataGoAssets()
        }}
      />
      {releaseReadinessError ? <div className="test-message">{releaseReadinessError}</div> : null}
      <label>
        LLM Base URL
        <input name="llmBaseUrl" defaultValue={dashboard.settings.llmBaseUrl} />
      </label>
      <label>
        LLM API Key
        <input
          name="llmApiKey"
          type="password"
          placeholder={dashboard.systemProfile.hasLlmApiKey ? '已安全保存；留空则继续使用' : '需要支持图片输入的模型 API key'}
        />
      </label>
      <label>
        多模态模型
        {dashboard.systemProfile.proxyModels.length > 0 ? (
          <select name="llmModel" defaultValue={dashboard.settings.llmModel}>
            {dashboard.systemProfile.proxyModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : (
          <input name="llmModel" defaultValue={dashboard.settings.llmModel} />
        )}
      </label>
      <div className="settings-actions">
        <button className="ghost-button" type="button" onClick={(event) => onTest(event.currentTarget.form!)} disabled={busy !== ''}>
          图片测试
        </button>
        <button className="primary-button" type="submit" disabled={busy !== ''}>
          保存
        </button>
      </div>
      {llmTestMessage ? <div className="test-message">{llmTestMessage}</div> : null}
    </form>
  )
}

function ToolLogList({ result }: { result: TeacherRunResult }): ReactElement {
  const statusLabel: Record<string, string> = {
    running: '运行中',
    done: '完成',
    error: '错误',
    skipped: '跳过'
  }
  return (
    <details className="tool-log">
      <summary>工具执行日志 · {result.toolLogs.length} 步</summary>
      {result.toolLogs.map((log) => (
        <div key={log.id} className={`tool-log-row tool-log-row--${log.status}`}>
          <span>
            {log.label}
            <em>{statusLabel[log.status] ?? log.status}</em>
          </span>
          <small>{log.detail}</small>
        </div>
      ))}
      {result.reportPath ? <small className="report-path">报告: {result.reportPath}</small> : null}
    </details>
  )
}

function MoveControls({ record, moveNumber, onMove }: { record: GameRecord | null; moveNumber: number; onMove: (value: number) => void }): ReactElement {
  const total = record?.moves.length ?? 0
  const current = moveNumber > 0 ? record?.moves[moveNumber - 1] : undefined
  return (
    <div className="move-controls">
      <div className="move-buttons">
        <button className="icon-button" onClick={() => onMove(0)} disabled={!record || moveNumber === 0}>
          {'|<'}
        </button>
        <button className="icon-button" onClick={() => onMove(Math.max(0, moveNumber - 10))} disabled={!record || moveNumber === 0}>
          -10
        </button>
        <button className="icon-button" onClick={() => onMove(Math.max(0, moveNumber - 1))} disabled={!record || moveNumber === 0}>
          {'<'}
        </button>
        <button className="icon-button" onClick={() => onMove(Math.min(total, moveNumber + 1))} disabled={!record || moveNumber === total}>
          {'>'}
        </button>
        <button className="icon-button" onClick={() => onMove(Math.min(total, moveNumber + 10))} disabled={!record || moveNumber === total}>
          +10
        </button>
        <button className="icon-button" onClick={() => onMove(total)} disabled={!record || moveNumber === total}>
          {'>|'}
        </button>
      </div>
      <div className="move-meta">
        <strong>{moveNumber}</strong>
        <span>/ {total}</span>
        <span>{current ? `${current.color === 'B' ? '黑' : '白'} ${current.gtp}` : '开局'}</span>
      </div>
    </div>
  )
}

function TimelineMoveInfo({ record, moveNumber, analysis }: { record: GameRecord; moveNumber: number; analysis: KataGoMoveAnalysis | null }): ReactElement {
  const black = safePlayerName(record.game.black, '黑方')
  const white = safePlayerName(record.game.white, '白方')
  const current = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const scoreLead = analysis?.after.scoreLead
  const winrate = analysis?.after.winrate
  return (
    <div className="timeline-move-info" aria-label="当前局面">
      <span>黑 {black}</span>
      <span>vs</span>
      <span>白 {white}</span>
      <strong>{moveNumber}/{record.moves.length}</strong>
      <span>{current ? `${current.color === 'B' ? '黑' : '白'} ${current.gtp}` : '开局'}</span>
      <em>{typeof winrate === 'number' ? `黑胜率 ${winrate.toFixed(1)}%` : '胜率待分析'}</em>
      <em>{formatScoreLead(scoreLead)}</em>
    </div>
  )
}

function TimelineAnalysisHeader({
  record,
  moveNumber,
  analysis,
  liveAnalysis,
  disabled,
  onStart,
  onPause
}: {
  record: GameRecord
  moveNumber: number
  analysis: KataGoMoveAnalysis | null
  liveAnalysis: LiveAnalysisState
  disabled: boolean
  onStart: () => void
  onPause: () => void
}): ReactElement {
  const isCurrentLiveTarget = liveAnalysis.targetMoveNumber === moveNumber
  const totalVisits = isCurrentLiveTarget ? liveAnalysis.visits : candidateVisitsTotal(analysis)
  const bestVisits = isCurrentLiveTarget ? liveAnalysis.bestVisits : candidateBestVisits(analysis)
  const status = isCurrentLiveTarget
    ? liveAnalysis.status
    : (analysis ? `已搜索 ${formatVisits(totalVisits)}` : '等待精读')
  return (
    <div className="timeline-analysis-header">
      <TimelineMoveInfo record={record} moveNumber={moveNumber} analysis={analysis} />
      <div className="analysis-control-strip" aria-label="KataGo 持续分析控制">
        <div className="analysis-control-strip__stats">
          <span>{status}</span>
          <em>总 {formatVisits(totalVisits)} · 一选 {formatVisits(bestVisits)}</em>
        </div>
        <button
          type="button"
          className={`analysis-toggle-button ${liveAnalysis.running ? 'is-running' : ''}`}
          onClick={liveAnalysis.running ? onPause : onStart}
          disabled={!liveAnalysis.running && disabled}
        >
          <span className="analysis-toggle-button__dot" />
          {liveAnalysis.running ? '暂停分析' : '开始分析'}
        </button>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundedScale(value: number, granularity: number, floor: number): number {
  return Math.max(floor, Math.ceil(Math.max(0, value) / granularity) * granularity)
}

function formatScoreLead(scoreLead: number | undefined): string {
  if (scoreLead === undefined) {
    return '待分析'
  }
  if (Math.abs(scoreLead) < 0.05) {
    return '均势'
  }
  return `${scoreLead > 0 ? '黑' : '白'}+${Math.abs(scoreLead).toFixed(1)}`
}

function formatVisits(visits: number): string {
  if (!Number.isFinite(visits) || visits <= 0) {
    return '0'
  }
  if (visits >= 1_000_000) {
    return `${(visits / 1_000_000).toFixed(visits >= 10_000_000 ? 0 : 1)}m`
  }
  if (visits >= 1_000) {
    return `${(visits / 1_000).toFixed(visits >= 10_000 ? 0 : 1)}k`
  }
  return String(Math.round(visits))
}

function evaluationSeverity(item: KataGoMoveAnalysis): 'quiet' | 'inaccuracy' | 'mistake' | 'blunder' {
  if (item.judgement === 'blunder' || (item.playedMove?.scoreLoss ?? 0) >= 8 || (item.playedMove?.winrateLoss ?? 0) >= 18) {
    return 'blunder'
  }
  if (item.judgement === 'mistake' || (item.playedMove?.scoreLoss ?? 0) >= 4 || (item.playedMove?.winrateLoss ?? 0) >= 10) {
    return 'mistake'
  }
  if (item.judgement === 'inaccuracy' || (item.playedMove?.scoreLoss ?? 0) >= 1.5 || (item.playedMove?.winrateLoss ?? 0) >= 4) {
    return 'inaccuracy'
  }
  return 'quiet'
}

function EvaluationGraph({
  analysis,
  evaluations,
  moveNumber,
  totalMoves,
  loading,
  loadingLabel,
  onMove
}: {
  analysis: KataGoMoveAnalysis | null
  evaluations: KataGoMoveAnalysis[]
  moveNumber: number
  totalMoves: number
  loading: boolean
  loadingLabel: string
  onMove: (value: number) => void
}): ReactElement {
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const sortedEvaluations = evaluations.slice().sort((left, right) => left.moveNumber - right.moveNumber)
  const currentAnalysis = analysis ?? sortedEvaluations.find((item) => item.moveNumber === moveNumber) ?? null
  const hasEvaluations = sortedEvaluations.length > 0
  const width = 720
  const height = 168
  const plotLeft = 42
  const plotRight = 34
  const plotTop = 16
  const plotBottom = 108
  const barTop = 119
  const barBottom = 132
  const plotWidth = width - plotLeft - plotRight
  const plotHeight = plotBottom - plotTop
  const centerY = plotTop + plotHeight / 2
  const moveTickLabelY = 144
  const currentBadgeY = 149
  const currentBadgeHeight = 16
  const domainMoves = Math.max(totalMoves, 1)
  const xForMove = (move: number): number => plotLeft + (clamp(move, 0, domainMoves) / domainMoves) * plotWidth
  const lossScale = roundedScale(Math.max(...sortedEvaluations.map((item) => Math.max(0, item.playedMove?.scoreLoss ?? 0)), 0), 5, 5)
  const yForWinrate = (winrate: number): number => clamp(plotTop + ((100 - winrate) / 100) * plotHeight, plotTop, plotBottom)
  const winrateTicks = [
    { label: '黑100', value: 100 },
    { label: '75', value: 75 },
    { label: '50', value: 50 },
    { label: '25', value: 25 },
    { label: '白100', value: 0 }
  ]
  const moveTicks = Array.from(new Set([
    0,
    Math.round(totalMoves * 0.25),
    Math.round(totalMoves * 0.5),
    Math.round(totalMoves * 0.75),
    totalMoves
  ])).filter((tick) => tick >= 0 && tick <= totalMoves)
  const winrateSamples = sortedEvaluations.length > 0
    ? [
        { move: Math.max(0, sortedEvaluations[0].moveNumber - 1), winrate: sortedEvaluations[0].before.winrate },
        ...sortedEvaluations.map((item) => ({ move: item.moveNumber, winrate: item.after.winrate }))
      ]
    : []
  const winratePath = winrateSamples
    .map((item, index) => `${index === 0 ? 'M' : 'L'} ${xForMove(item.move).toFixed(2)} ${yForWinrate(item.winrate).toFixed(2)}`)
    .join(' ')
  const areaPath = winrateSamples.length > 0
    ? `${winratePath} L ${xForMove(winrateSamples[winrateSamples.length - 1].move).toFixed(2)} ${centerY.toFixed(2)} L ${xForMove(winrateSamples[0].move).toFixed(2)} ${centerY.toFixed(2)} Z`
    : ''
  const currentX = xForMove(moveNumber)
  const currentY = currentAnalysis ? yForWinrate(currentAnalysis.after.winrate) : centerY
  const blackWinrate = currentAnalysis?.after.winrate
  const whiteWinrate = blackWinrate === undefined ? undefined : 100 - blackWinrate
  const leadText = formatScoreLead(currentAnalysis?.after.scoreLead)
  const bestCandidate = boardCandidateMoves(currentAnalysis)[0]
  const currentLabel = currentAnalysis
    ? `第 ${moveNumber} 手，黑胜率 ${currentAnalysis.after.winrate.toFixed(1)}%，${leadText}`
    : (loading ? `KataGo 正在快速生成整盘胜率图${loadingLabel ? ` · ${loadingLabel}` : ''}` : '等待 KataGo 分析')
  const currentMoveLabel = totalMoves > 0 ? `第 ${moveNumber}/${totalMoves} 手` : '第 0 手'
  const currentBadgeWidth = clamp(68 + currentMoveLabel.length * 5, 92, 136)
  const currentBadgeX = clamp(currentX - currentBadgeWidth / 2, plotLeft, width - plotRight - currentBadgeWidth)

  function moveFromPointer(event: PointerEvent<SVGSVGElement>): number {
    const rect = event.currentTarget.getBoundingClientRect()
    const svgX = ((event.clientX - rect.left) / rect.width) * width
    const ratio = clamp((svgX - plotLeft) / plotWidth, 0, 1)
    return Math.round(ratio * totalMoves)
  }

  function selectMoveFromPointer(event: PointerEvent<SVGSVGElement>): void {
    if (totalMoves < 1) {
      return
    }
    onMove(moveFromPointer(event))
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    setDragging(true)
    selectMoveFromPointer(event)
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    if (!draggingRef.current) {
      return
    }
    selectMoveFromPointer(event)
  }

  function handlePointerEnd(event: PointerEvent<SVGSVGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    draggingRef.current = false
    setDragging(false)
    selectMoveFromPointer(event)
  }

  return (
    <div className="evaluation-graph">
      <svg
        className={`evaluation-canvas ${dragging ? 'is-dragging' : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        role="slider"
        aria-label="KataGo 评估图"
        aria-valuemin={0}
        aria-valuemax={totalMoves}
        aria-valuenow={moveNumber}
        aria-valuetext={currentLabel}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            onMove(Math.max(0, moveNumber - 1))
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            onMove(Math.min(totalMoves, moveNumber + 1))
          }
          if (event.key === 'Home') {
            event.preventDefault()
            onMove(0)
          }
          if (event.key === 'End') {
            event.preventDefault()
            onMove(totalMoves)
          }
        }}
      >
        <title>{currentLabel}</title>
        <defs>
          <linearGradient id="evaluation-board-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#20242a" />
            <stop offset="49%" stopColor="#191d22" />
            <stop offset="51%" stopColor="#171b20" />
            <stop offset="100%" stopColor="#242018" />
          </linearGradient>
          <linearGradient id="evaluation-winrate-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7d9b4" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#d2b36a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#d2b36a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect className="evaluation-plot" x="0" y="0" width={width} height={height} rx="6" />
        <rect className="evaluation-zone evaluation-zone--black" x={plotLeft} y={plotTop} width={plotWidth} height={plotHeight / 2} />
        <rect className="evaluation-zone evaluation-zone--white" x={plotLeft} y={centerY} width={plotWidth} height={plotHeight / 2} />
        {winrateTicks.map((tick) => (
          <g key={`winrate-tick-${tick.value}`}>
            <line className="evaluation-grid evaluation-grid--horizontal" x1={plotLeft} y1={yForWinrate(tick.value)} x2={width - plotRight} y2={yForWinrate(tick.value)} />
            <text className="evaluation-axis-label" x={plotLeft - 8} y={yForWinrate(tick.value)}>
              {tick.label}
            </text>
          </g>
        ))}
        {moveTicks.map((tick) => (
          <g key={`move-tick-${tick}`}>
            <line className="evaluation-grid evaluation-grid--vertical" x1={xForMove(tick)} y1={plotTop} x2={xForMove(tick)} y2={barBottom} />
            <text className="evaluation-move-label" x={xForMove(tick)} y={moveTickLabelY}>
              {tick}
            </text>
          </g>
        ))}
        <line className="evaluation-grid evaluation-grid--center" x1={plotLeft} y1={centerY} x2={width - plotRight} y2={centerY} />

        {hasEvaluations ? (
          <>
            <path className="evaluation-area" d={areaPath} />
            <path className="evaluation-line evaluation-line--winrate" d={winratePath} />
            {sortedEvaluations.map((item) => {
              const loss = Math.max(0, item.playedMove?.scoreLoss ?? 0)
              if (loss <= 0.2) {
                return null
              }
              const barHeight = clamp((loss / lossScale) * (barBottom - barTop), 1, barBottom - barTop)
              const x = xForMove(item.moveNumber)
              return <rect key={`loss-${item.moveNumber}`} className={`loss-bar loss-bar--${evaluationSeverity(item)}`} x={x - 2.5} y={barBottom - barHeight} width="5" height={barHeight} />
            })}
            {sortedEvaluations.filter((item) => evaluationSeverity(item) !== 'quiet').map((item) => (
              <circle key={`dot-${item.moveNumber}`} className={`evaluation-dot evaluation-dot--${evaluationSeverity(item)}`} cx={xForMove(item.moveNumber)} cy={yForWinrate(item.after.winrate)} r={item.moveNumber === moveNumber ? 4.2 : 2.4} />
            ))}
          </>
        ) : (
          <>
            <path className="evaluation-empty-line" d={`M ${plotLeft} ${centerY} L ${width - plotRight} ${centerY}`} />
            <text className="evaluation-empty-copy" x={plotLeft + plotWidth / 2} y={centerY - 8}>
              {loading ? `正在生成胜率图${loadingLabel ? ` · ${loadingLabel}` : ''}` : '待 KataGo 分析'}
            </text>
          </>
        )}

        <line className="evaluation-current" x1={currentX} y1={plotTop} x2={currentX} y2={barBottom} />
        <circle className="evaluation-current-dot" cx={currentX} cy={currentY} r="5.2" />
        {currentAnalysis ? (
          <g className="evaluation-readout-panel">
            <rect className="evaluation-readout-bg" x={plotLeft + 12} y="18" width="276" height="34" rx="7" />
            <text className="evaluation-readout evaluation-readout--black" x={plotLeft + 26} y="35">
              {`黑 ${blackWinrate?.toFixed(1)}%`}
            </text>
            <text className="evaluation-readout evaluation-readout--white" x={plotLeft + 98} y="35">
              {`白 ${whiteWinrate?.toFixed(1)}%`}
            </text>
            <text className="evaluation-readout evaluation-readout--lead" x={plotLeft + 172} y="35">
              {leadText}
            </text>
          </g>
        ) : null}
        {bestCandidate ? (
          <g className="evaluation-candidate-readout">
            <rect className="evaluation-readout-bg" x={width - 254} y="18" width="232" height="34" rx="7" />
            <text className="evaluation-readout evaluation-readout--candidate" x={width - 240} y="35">
              {`1选 ${bestCandidate.move} · ${bestCandidate.winrate.toFixed(1)}%`}
            </text>
          </g>
        ) : null}
        <line className="evaluation-bar-baseline" x1={plotLeft} y1={barBottom} x2={width - plotRight} y2={barBottom} />
        <path className="evaluation-current-caret" d={`M ${currentX.toFixed(2)} ${barBottom + 2} l -4 6 h 8 Z`} />
        <rect className="evaluation-current-label-bg" x={currentBadgeX} y={currentBadgeY} width={currentBadgeWidth} height={currentBadgeHeight} rx="5" />
        <text className="evaluation-current-label" x={currentBadgeX + currentBadgeWidth / 2} y={currentBadgeY + currentBadgeHeight / 2}>
          {currentMoveLabel}
        </text>
      </svg>
    </div>
  )
}

function GoBoard({ record, moveNumber, analysis }: { record: GameRecord; moveNumber: number; analysis: KataGoMoveAnalysis | null }): ReactElement {
  const size = record.boardSize
  const board = computeBoard(record, moveNumber)
  const viewSize = 760
  const boardInset = 18
  const gridInset = 76
  const step = (viewSize - gridInset * 2) / (size - 1)
  const starPoints = getStarPoints(size)
  const lastMove = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const candidateMoves = boardCandidateMoves(analysis).slice(0, 6)
  const maxVisits = Math.max(...candidateMoves.map((candidate) => candidate.visits), 1)
  const candidates = candidateMoves.map((candidate, index) => ({
    ...candidate,
    index,
    point: gtpToPoint(candidate.move, size),
    searchShare: clamp(candidate.visits / maxVisits, 0.08, 1)
  }))
  const coordinates = Array.from({ length: size }, (_, index) => index)

  return (
    <svg className="go-board" viewBox={`0 0 ${viewSize} ${viewSize}`} role="img" aria-label="围棋棋盘">
      <defs>
        <pattern id="lizzie-board-texture" patternUnits="userSpaceOnUse" width="438" height="567">
          <image href={lizzieBoardUrl} width="438" height="567" preserveAspectRatio="none" />
        </pattern>
        <filter id="stone-shadow" x="-35%" y="-35%" width="170%" height="170%">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2.1" floodColor="#000000" floodOpacity="0.42" />
        </filter>
      </defs>
      <rect className="board-edge" x="0" y="0" width={viewSize} height={viewSize} rx="8" />
      <rect className="board-surface" x={boardInset} y={boardInset} width={viewSize - boardInset * 2} height={viewSize - boardInset * 2} rx="6" />
      <g className="board-grid">
        {coordinates.map((index) => {
          const p = gridInset + index * step
          return (
            <g key={`line-${index}`}>
              <line x1={gridInset} y1={p} x2={viewSize - gridInset} y2={p} />
              <line x1={p} y1={gridInset} x2={p} y2={viewSize - gridInset} />
            </g>
          )
        })}
      </g>
      <g className="board-coordinates" aria-hidden="true">
        {coordinates.map((index) => {
          const p = gridInset + index * step
          return (
            <g key={`coord-${index}`}>
              <text x={p} y="46">
                {letters[index]}
              </text>
              <text x={p} y={viewSize - 43}>
                {letters[index]}
              </text>
              <text x="45" y={p}>
                {size - index}
              </text>
              <text x={viewSize - 45} y={p}>
                {size - index}
              </text>
            </g>
          )
        })}
      </g>
      {starPoints.map(([row, col]) => (
        <circle key={`${row}-${col}`} className="star-point" cx={gridInset + col * step} cy={gridInset + row * step} r={step * 0.095} />
      ))}
      {board.flatMap((row, rowIndex) =>
        row.map((stone, colIndex) => {
          if (!stone) {
            return null
          }
          const x = gridInset + colIndex * step
          const y = gridInset + rowIndex * step
          const isLast = lastMove?.row === rowIndex && lastMove.col === colIndex
          const stoneRadius = step * 0.505
          return (
            <g key={`${rowIndex}-${colIndex}`}>
              <image
                className={`stone stone--${stone}`}
                href={stone === 'B' ? lizzieBlackStoneUrl : lizzieWhiteStoneUrl}
                x={x - stoneRadius}
                y={y - stoneRadius}
                width={stoneRadius * 2}
                height={stoneRadius * 2}
                preserveAspectRatio="xMidYMid meet"
                filter="url(#stone-shadow)"
              />
              {isLast ? <circle className={`last-marker last-marker--${stone}`} cx={x} cy={y} r={step * 0.19} /> : null}
            </g>
          )
        })
      )}
      {candidates.map((candidate) => {
        if (!candidate.point) {
          return null
        }
        const x = gridInset + candidate.point.col * step
        const y = gridInset + candidate.point.row * step
        const radius = step * (candidate.index === 0 ? 0.49 : 0.4 + candidate.searchShare * 0.07)
        const orderX = x + radius * 0.7
        const orderY = y - radius * 0.7
        return (
          <g key={`${candidate.move}-${candidate.index}`} className={`candidate candidate--${candidate.index + 1}`}>
            <title>
              {`${candidate.index + 1}选 ${candidate.move} · 胜率 ${candidate.winrate.toFixed(1)}% · 目差 ${candidate.scoreLead.toFixed(1)} · 搜索 ${formatVisits(candidate.visits)} · 先验 ${candidate.prior.toFixed(1)}%${candidate.pv.length ? ` · PV ${candidate.pv.join(' ')}` : ''}`}
            </title>
            <circle className="candidate-halo" cx={x} cy={y} r={radius + step * 0.065} opacity={0.28 + candidate.searchShare * 0.28} />
            <circle className="candidate-stone" cx={x} cy={y} r={radius} opacity={0.72 + candidate.searchShare * 0.24} />
            <circle className="candidate-order-bg" cx={orderX} cy={orderY} r={step * 0.155} />
            <text className="candidate-order" x={orderX} y={orderY}>
              {candidate.index + 1}
            </text>
            <text className="candidate-winrate" x={x} y={y - radius * 0.22}>
              {candidate.winrate.toFixed(1)}
            </text>
            <text className="candidate-visits" x={x} y={y + radius * 0.34}>
              {formatVisits(candidate.visits)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

type Board = Array<Array<StoneColor | null>>

function computeBoard(record: GameRecord, moveNumber: number): Board {
  const size = record.boardSize
  const board: Board = Array.from({ length: size }, () => Array<StoneColor | null>(size).fill(null))
  for (const move of record.moves.slice(0, moveNumber)) {
    if (move.pass || move.row === null || move.col === null) {
      continue
    }
    board[move.row][move.col] = move.color
    const opponent = move.color === 'B' ? 'W' : 'B'
    for (const [row, col] of neighbors(move.row, move.col, size)) {
      if (board[row][col] === opponent && countLiberties(board, row, col).liberties === 0) {
        for (const [groupRow, groupCol] of countLiberties(board, row, col).stones) {
          board[groupRow][groupCol] = null
        }
      }
    }
    if (countLiberties(board, move.row, move.col).liberties === 0) {
      board[move.row][move.col] = null
    }
  }
  return board
}

function neighbors(row: number, col: number, size: number): Array<[number, number]> {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1]
  ].filter(([r, c]) => r >= 0 && c >= 0 && r < size && c < size) as Array<[number, number]>
}

function countLiberties(board: Board, row: number, col: number): { stones: Array<[number, number]>; liberties: number } {
  const color = board[row][col]
  if (!color) {
    return { stones: [], liberties: 0 }
  }
  const seen = new Set<string>()
  const liberties = new Set<string>()
  const stones: Array<[number, number]> = []
  const stack: Array<[number, number]> = [[row, col]]
  while (stack.length > 0) {
    const [r, c] = stack.pop()!
    const key = `${r}:${c}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    stones.push([r, c])
    for (const [nr, nc] of neighbors(r, c, board.length)) {
      if (!board[nr][nc]) {
        liberties.add(`${nr}:${nc}`)
      } else if (board[nr][nc] === color) {
        stack.push([nr, nc])
      }
    }
  }
  return { stones, liberties: liberties.size }
}

function getStarPoints(size: number): Array<[number, number]> {
  if (size < 7) {
    return []
  }
  const starPointPosition = size <= 11 ? 3 : 4
  const points = [starPointPosition - 1, size - starPointPosition]
  if (size % 2 === 1 && size > 7) {
    points.splice(1, 0, Math.floor(size / 2))
  }
  return points.flatMap((row) => points.map((col) => [row, col] as [number, number]))
}

function gtpToPoint(gtp: string, size: number): { row: number; col: number } | null {
  if (!gtp || gtp.toLowerCase() === 'pass') {
    return null
  }
  const col = letters.indexOf(gtp[0].toUpperCase())
  const row = size - Number.parseInt(gtp.slice(1), 10)
  if (col < 0 || !Number.isFinite(row) || row < 0 || row >= size) {
    return null
  }
  return { row, col }
}

async function renderBoardPng(record: GameRecord, moveNumber: number, analysis: KataGoMoveAnalysis | null): Promise<string> {
  const size = record.boardSize
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 1000
  const ctx = canvas.getContext('2d')!
  const boardInset = 24
  const margin = 104
  const step = (canvas.width - margin * 2) / (size - 1)
  const board = computeBoard(record, moveNumber)
  const lastMove = moveNumber > 0 ? record.moves[moveNumber - 1] : undefined
  const [boardTexture, blackStone, whiteStone] = await Promise.all([
    loadCanvasImage(lizzieBoardUrl),
    loadCanvasImage(lizzieBlackStoneUrl),
    loadCanvasImage(lizzieWhiteStoneUrl)
  ])

  ctx.fillStyle = '#0b0d10'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  roundedCanvasRect(ctx, boardInset, boardInset, canvas.width - boardInset * 2, canvas.height - boardInset * 2, 10)
  ctx.clip()
  const boardPattern = ctx.createPattern(boardTexture, 'repeat')
  ctx.fillStyle = boardPattern ?? '#d8b15e'
  ctx.fillRect(boardInset, boardInset, canvas.width - boardInset * 2, canvas.height - boardInset * 2)
  ctx.restore()

  ctx.strokeStyle = '#11100d'
  for (let i = 0; i < size; i += 1) {
    const p = margin + i * step
    ctx.lineWidth = i === 0 || i === size - 1 ? 3 : 1.8
    ctx.beginPath()
    ctx.moveTo(margin, p)
    ctx.lineTo(canvas.width - margin, p)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(p, margin)
    ctx.lineTo(p, canvas.height - margin)
    ctx.stroke()
  }
  ctx.fillStyle = '#11100d'
  for (const [row, col] of getStarPoints(size)) {
    ctx.beginPath()
    ctx.arc(margin + col * step, margin + row * step, step * 0.095, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#15130f'
  ctx.font = 'bold 28px Avenir Next, PingFang SC, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < size; i += 1) {
    const p = margin + i * step
    ctx.fillText(letters[i], p, 62)
    ctx.fillText(letters[i], p, canvas.height - 52)
    ctx.fillText(String(size - i), 60, p)
    ctx.fillText(String(size - i), canvas.width - 60, p)
  }

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const stone = board[row][col]
      if (!stone) {
        continue
      }
      const x = margin + col * step
      const y = margin + row * step
      const stoneRadius = step * 0.505
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)'
      ctx.shadowBlur = 7
      ctx.shadowOffsetY = 3
      ctx.drawImage(stone === 'B' ? blackStone : whiteStone, x - stoneRadius, y - stoneRadius, stoneRadius * 2, stoneRadius * 2)
      ctx.restore()
      if (lastMove?.row === row && lastMove.col === col) {
        ctx.strokeStyle = stone === 'B' ? '#f4efe4' : '#17191a'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(x, y, step * 0.19, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  ctx.font = 'bold 22px Avenir Next, PingFang SC, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const candidateColors = ['#66c783', '#5aa8d6', '#d6b45f', '#b783d9', '#8f9ba8']
  const imageCandidates = boardCandidateMoves(analysis).slice(0, 6)
  const maxImageVisits = Math.max(...imageCandidates.map((candidate) => candidate.visits), 1)
  for (const [index, candidate] of imageCandidates.entries()) {
    const point = gtpToPoint(candidate.move, size)
    if (!point) {
      continue
    }
    const x = margin + point.col * step
    const y = margin + point.row * step
    const searchShare = clamp(candidate.visits / maxImageVisits, 0.08, 1)
    const radius = step * (index === 0 ? 0.46 : 0.38 + searchShare * 0.06)
    ctx.fillStyle = candidateColors[index] ?? '#8f9ba8'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#f4f2ec'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#101417'
    ctx.font = 'bold 19px Avenir Next, PingFang SC, sans-serif'
    ctx.fillText(candidate.winrate.toFixed(1), x, y - radius * 0.16)
    ctx.font = 'bold 15px Avenir Next, PingFang SC, sans-serif'
    ctx.fillText(formatVisits(candidate.visits), x, y + radius * 0.38)
    ctx.fillStyle = '#f8f4ea'
    ctx.beginPath()
    ctx.arc(x + radius * 0.72, y - radius * 0.72, step * 0.13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#101417'
    ctx.font = 'bold 13px Avenir Next, PingFang SC, sans-serif'
    ctx.fillText(String(index + 1), x + radius * 0.72, y - radius * 0.72)
  }

  ctx.fillStyle = '#1f1a12'
  ctx.font = '24px Avenir Next, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`Move ${moveNumber} / ${record.moves.length}`, margin, canvas.height - 28)
  if (analysis?.playedMove) {
    ctx.fillText(`Loss ${analysis.playedMove.winrateLoss.toFixed(1)}% / ${analysis.playedMove.scoreLoss.toFixed(1)}目`, margin + 230, canvas.height - 28)
  }

  return canvas.toDataURL('image/png')
}

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`无法加载棋盘素材: ${src}`))
    image.src = src
  })
}

function roundedCanvasRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
