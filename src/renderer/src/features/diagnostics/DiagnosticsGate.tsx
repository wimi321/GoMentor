import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { DiagnosticsPanel } from './DiagnosticsPanel'

type DiagnosticsOverall = 'ready' | 'fixable' | 'blocked'

interface DiagnosticsReport {
  overall: DiagnosticsOverall
  summary: string
  generatedAt: string
  checks: Array<{
    id: string
    title: string
    status: 'pass' | 'warn' | 'fail'
    required: boolean
    detail: string
    action?: string
    technicalDetail?: string
  }>
}

interface DiagnosticsApi {
  getDiagnostics?: () => Promise<DiagnosticsReport>
}

function diagnosticsApi(): DiagnosticsApi {
  return (window as unknown as { katasensei?: DiagnosticsApi }).katasensei ?? {}
}

export function DiagnosticsGate({ children }: { children: ReactNode }): ReactElement {
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [error, setError] = useState('')

  async function runDiagnostics(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const api = diagnosticsApi()
      if (!api.getDiagnostics) {
        setAllowed(true)
        return
      }
      const next = await api.getDiagnostics()
      setReport(next)
      setAllowed(next.overall === 'ready')
    } catch (cause) {
      setError(String(cause))
      setAllowed(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void runDiagnostics()
  }, [])

  if (loading) {
    return <div className="diagnostics-loading">正在检查 KataSensei 运行环境...</div>
  }

  if (allowed) {
    return <>{children}</>
  }

  if (!report) {
    return (
      <main className="diagnostics-page diagnostics-page--blocked">
        <section className="diagnostics-hero">
          <div>
            <p className="eyebrow">KataSensei 启动诊断</p>
            <h1>诊断暂时不可用</h1>
            <p>{error || '无法读取诊断结果。'}</p>
          </div>
          <div className="diagnostics-actions">
            <button className="ghost-button" onClick={() => void runDiagnostics()}>重新检查</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="diagnostics-gate">
      <DiagnosticsPanel
        report={report}
        onRetry={() => void runDiagnostics()}
        onContinue={report.overall !== 'ready' ? () => setAllowed(true) : undefined}
      />
    </div>
  )
}
