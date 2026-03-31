import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { DashboardData, LibraryGame, ReviewResult } from '@main/lib/types'

const emptyDashboard: DashboardData = {
  settings: {
    katagoBin: '',
    katagoConfig: '',
    katagoModel: '',
    pythonBin: 'python3',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmApiKey: '',
    llmModel: 'gpt-5-mini',
    reviewLanguage: 'zh-CN',
    defaultPlayerName: ''
  },
  games: []
}

export function App(): ReactElement {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard)
  const [selectedId, setSelectedId] = useState('')
  const [foxKeyword, setFoxKeyword] = useState('')
  const [foxCount, setFoxCount] = useState(10)
  const [playerName, setPlayerName] = useState('')
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void refresh()
  }, [])

  const selectedGame = useMemo(
    () => dashboard.games.find((game) => game.id === selectedId) ?? dashboard.games[0],
    [dashboard.games, selectedId]
  )

  useEffect(() => {
    if (selectedGame && !selectedId) {
      setSelectedId(selectedGame.id)
    }
  }, [selectedGame, selectedId])

  async function refresh(): Promise<void> {
    setDashboard(await window.katasensei.getDashboard())
  }

  async function importSgf(): Promise<void> {
    setBusy('import')
    setError('')
    try {
      const next = await window.katasensei.importLibrary()
      setDashboard(next)
      if (next.games[0]) {
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
      const { dashboard: next } = await window.katasensei.syncFox({
        keyword: foxKeyword,
        maxGames: foxCount
      })
      setDashboard(next)
      if (next.games[0]) {
        setSelectedId(next.games[0].id)
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy('')
    }
  }

  async function saveSettings(formData: FormData): Promise<void> {
    setBusy('settings')
    setError('')
    try {
      const next = await window.katasensei.updateSettings({
        katagoBin: String(formData.get('katagoBin') ?? ''),
        katagoConfig: String(formData.get('katagoConfig') ?? ''),
        katagoModel: String(formData.get('katagoModel') ?? ''),
        pythonBin: String(formData.get('pythonBin') ?? 'python3'),
        llmBaseUrl: String(formData.get('llmBaseUrl') ?? ''),
        llmApiKey: String(formData.get('llmApiKey') ?? ''),
        llmModel: String(formData.get('llmModel') ?? ''),
        defaultPlayerName: String(formData.get('defaultPlayerName') ?? ''),
        reviewLanguage: String(
          formData.get('reviewLanguage') ?? 'zh-CN'
        ) as DashboardData['settings']['reviewLanguage']
      })
      setDashboard(next)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy('')
    }
  }

  async function startReview(): Promise<void> {
    if (!selectedGame) {
      return
    }
    setBusy('review')
    setError('')
    setReview(null)
    try {
      const result = await window.katasensei.startReview({
        gameId: selectedGame.id,
        playerName,
        maxVisits: 600,
        minWinrateDrop: 7
      })
      setReview(result)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Professional Go Review Studio</p>
          <h1>KataSensei</h1>
          <p className="hero-copy">
            用 KataGo 做判断，用大语言模型做解释。给学生一份看得懂、改得动、能立刻练起来的复盘。
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={() => void importSgf()} disabled={busy !== ''}>
            {busy === 'import' ? '导入中…' : '上传 SGF'}
          </button>
          <button
            className="secondary"
            onClick={() => selectedGame && void window.katasensei.openPath(selectedGame.filePath)}
            disabled={!selectedGame}
          >
            打开棋谱位置
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <div className="panel-header">
            <h2>棋谱库</h2>
            <span>{dashboard.games.length} games</span>
          </div>
          <div className="game-list">
            {dashboard.games.map((game) => (
              <button
                key={game.id}
                className={`game-card ${selectedGame?.id === game.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(game.id)}
              >
                <div className="game-card-top">
                  <strong>{game.title}</strong>
                  <span>{game.source === 'fox' ? 'Fox' : 'Upload'}</span>
                </div>
                <p>
                  {game.black} vs {game.white}
                </p>
                <small>
                  {game.date || '未知日期'} · {game.result || '结果待定'}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>一键复盘</h2>
            <span>{selectedGame ? selectedGame.sourceLabel : '请选择棋谱'}</span>
          </div>
          {selectedGame ? (
            <GameSummary game={selectedGame} />
          ) : (
            <EmptyState label="先上传 SGF 或同步野狐棋谱。" />
          )}

          <div className="stack">
            <label>
              学生名字 / 野狐 ID
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder={dashboard.settings.defaultPlayerName || '留空则自动使用黑棋名字'}
              />
            </label>
            <button
              className="primary large"
              onClick={() => void startReview()}
              disabled={!selectedGame || busy !== ''}
            >
              {busy === 'review' ? 'KataGo 正在复盘…' : '开始复盘'}
            </button>
          </div>

          <div className="panel-subsection">
            <div className="subsection-title">
              <h3>野狐同步</h3>
              <p>支持输入野狐昵称或 UID，自动抓最近公开棋谱。</p>
            </div>
            <div className="fox-row">
              <input
                value={foxKeyword}
                onChange={(event) => setFoxKeyword(event.target.value)}
                placeholder="野狐昵称 / UID"
              />
              <input
                type="number"
                min={1}
                max={30}
                value={foxCount}
                onChange={(event) => setFoxCount(Number(event.target.value))}
              />
              <button
                className="secondary"
                onClick={() => void syncFox()}
                disabled={!foxKeyword.trim() || busy !== ''}
              >
                {busy === 'fox' ? '同步中…' : '同步野狐'}
              </button>
            </div>
          </div>

          <div className="panel-subsection">
            <div className="subsection-title">
              <h3>复盘报告</h3>
              <p>自动标出大失误、关键转折、训练建议和人话解说。</p>
            </div>
            {review?.artifact ? (
              <article className="report">
                <div className="report-actions">
                  <button
                    className="secondary"
                    onClick={() => void window.katasensei.openPath(review.artifact!.markdownPath)}
                  >
                    打开 Markdown
                  </button>
                  <button
                    className="secondary"
                    onClick={() => void window.katasensei.openPath(review.artifact!.jsonPath)}
                  >
                    打开 JSON
                  </button>
                </div>
                <pre>{review.artifact.markdown}</pre>
              </article>
            ) : (
              <EmptyState label="复盘完成后，这里会展示完整讲解。" />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Settings</h2>
            <span>第一次配置后可反复使用</span>
          </div>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault()
              void saveSettings(new FormData(event.currentTarget))
            }}
          >
            <label>
              KataGo binary
              <input
                name="katagoBin"
                defaultValue={dashboard.settings.katagoBin}
                placeholder="/usr/local/bin/katago"
              />
            </label>
            <label>
              KataGo config
              <input
                name="katagoConfig"
                defaultValue={dashboard.settings.katagoConfig}
                placeholder="~/.katago/configs/analysis_example.cfg"
              />
            </label>
            <label>
              KataGo model
              <input
                name="katagoModel"
                defaultValue={dashboard.settings.katagoModel}
                placeholder="~/.katago/models/latest-kata1.bin.gz"
              />
            </label>
            <label>
              Python
              <input name="pythonBin" defaultValue={dashboard.settings.pythonBin} placeholder="python3" />
            </label>
            <label>
              LLM base URL
              <input
                name="llmBaseUrl"
                defaultValue={dashboard.settings.llmBaseUrl}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              LLM API key
              <input
                name="llmApiKey"
                type="password"
                defaultValue={dashboard.settings.llmApiKey}
                placeholder="sk-..."
              />
            </label>
            <label>
              LLM model
              <input name="llmModel" defaultValue={dashboard.settings.llmModel} placeholder="gpt-5-mini" />
            </label>
            <label>
              默认学生名
              <input
                name="defaultPlayerName"
                defaultValue={dashboard.settings.defaultPlayerName}
                placeholder="你的学生或账号名"
              />
            </label>
            <label>
              输出语言
              <select name="reviewLanguage" defaultValue={dashboard.settings.reviewLanguage}>
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
                <option value="ja-JP">日本語</option>
                <option value="ko-KR">한국어</option>
              </select>
            </label>
            <button className="primary" type="submit" disabled={busy !== ''}>
              {busy === 'settings' ? '保存中…' : '保存配置'}
            </button>
          </form>
          {error ? <div className="error-box">{error}</div> : null}
        </section>
      </main>
    </div>
  )
}

function GameSummary({ game }: { game: LibraryGame }): ReactElement {
  return (
    <div className="summary-card">
      <div>
        <h3>{game.title}</h3>
        <p>
          {game.black} vs {game.white}
        </p>
      </div>
      <div className="summary-metrics">
        <div>
          <span>结果</span>
          <strong>{game.result || '未写入'}</strong>
        </div>
        <div>
          <span>日期</span>
          <strong>{game.date || '未知'}</strong>
        </div>
        <div>
          <span>来源</span>
          <strong>{game.sourceLabel}</strong>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }): ReactElement {
  return <div className="empty">{label}</div>
}
