import type { ReactElement } from 'react'
import './teacher-run-card.css'

export interface TeacherKeyMistakeView {
  moveNumber?: number
  color?: 'B' | 'W'
  played?: string
  recommended?: string
  errorType: string
  severity: 'inaccuracy' | 'mistake' | 'blunder'
  evidence: string
  explanation: string
}

export interface StructuredTeacherResultView {
  headline: string
  summary: string
  keyMistakes: TeacherKeyMistakeView[]
  correctThinking: string[]
  drills: string[]
  followupQuestions: string[]
  markdown?: string
}

export interface TeacherToolLogView {
  id: string
  label: string
  status: 'running' | 'done' | 'error' | 'skipped'
  detail: string
}

export function TeacherRunCard({ result, toolLogs = [], onJumpToMove }: {
  result?: StructuredTeacherResultView | null
  toolLogs?: TeacherToolLogView[]
  onJumpToMove?: (moveNumber: number) => void
}): ReactElement {
  if (!result) {
    return <div className="teacher-run-card teacher-run-card--empty">暂无结构化老师结果。</div>
  }
  return (
    <article className="teacher-run-card">
      <header>
        <span>老师结论</span>
        <h3>{result.headline}</h3>
        <p>{result.summary}</p>
      </header>

      {result.keyMistakes.length > 0 ? (
        <section className="teacher-section">
          <h4>关键问题手</h4>
          <div className="teacher-key-moves">
            {result.keyMistakes.map((move, index) => (
              <button key={`${move.moveNumber ?? index}-${move.errorType}`} className={`teacher-key-move teacher-key-move--${move.severity}`} onClick={() => move.moveNumber && onJumpToMove?.(move.moveNumber)}>
                <strong>{move.moveNumber ? `第 ${move.moveNumber} 手` : `问题 ${index + 1}`}</strong>
                <span>{move.errorType} · {move.severity}</span>
                <p>{move.explanation}</p>
                <small>{move.evidence}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {result.correctThinking.length > 0 ? (
        <section className="teacher-section">
          <h4>正确思路</h4>
          <ul>{result.correctThinking.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      {result.drills.length > 0 ? (
        <section className="teacher-section teacher-section--drills">
          <h4>训练建议</h4>
          <ul>{result.drills.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      {toolLogs.length > 0 ? (
        <details className="teacher-tool-log">
          <summary>工具调用记录</summary>
          {toolLogs.map((log) => (
            <div key={log.id} className={`teacher-tool-log-row teacher-tool-log-row--${log.status}`}>
              <span>{log.label}</span>
              <em>{log.status}</em>
              <p>{log.detail}</p>
            </div>
          ))}
        </details>
      ) : null}
    </article>
  )
}
