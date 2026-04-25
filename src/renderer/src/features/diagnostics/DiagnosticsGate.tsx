import type { ReactElement, ReactNode } from 'react'
import { useEffect } from 'react'

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
  async function runDiagnostics(): Promise<void> {
    try {
      const api = diagnosticsApi()
      await api.getDiagnostics?.()
    } catch (cause) {
      console.warn('[KataSensei] startup diagnostics failed', cause)
    }
  }

  useEffect(() => {
    void runDiagnostics()
  }, [])

  return <>{children}</>
}
