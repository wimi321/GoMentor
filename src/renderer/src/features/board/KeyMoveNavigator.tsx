import type { ReactElement } from 'react'
import { lossSeverityFromWinrateDrop, type LossSeverity } from './timelineInteraction'

export interface KeyMoveSummary {
  moveNumber: number
  color?: 'B' | 'W' | string
  label?: string
  gtp?: string
  reason?: string
  winrateDrop?: number
  scoreLoss?: number
  severity?: LossSeverity
}

export interface KeyMoveNavigatorProps {
  moves: KeyMoveSummary[]
  currentMoveNumber?: number
  onJump?: (moveNumber: number) => void
  onAnalyzeMove?: (moveNumber: number) => void
}

function severityLabel(severity: LossSeverity): string {
  switch (severity) {
    case 'blunder': return '重大问题'
    case 'mistake': return '问题手'
    case 'inaccuracy': return '缓手'
    default: return '轻微'
  }
}

export function KeyMoveNavigator({ moves, currentMoveNumber, onJump, onAnalyzeMove }: KeyMoveNavigatorProps): ReactElement | null {
  if (moves.length === 0) {
    return null
  }

  return (
    <section className="key-move-navigator" aria-label="关键问题手">
      <div className="key-move-navigator__head">
        <strong>关键问题手</strong>
        <small>{moves.length} 个重点</small>
      </div>
      <div className="key-move-navigator__list">
        {moves.slice(0, 8).map((move) => {
          const severity = move.severity ?? lossSeverityFromWinrateDrop(move.winrateDrop)
          const active = currentMoveNumber === move.moveNumber
          return (
            <article key={`${move.moveNumber}-${move.gtp ?? ''}`} className={`key-move-row key-move-row--${severity} ${active ? 'is-active' : ''}`}>
              <button type="button" onClick={() => onJump?.(move.moveNumber)}>
                <span>{move.moveNumber}</span>
                <strong>{move.label || move.gtp || `${move.color ?? ''} 第 ${move.moveNumber} 手`}</strong>
                <em>{severityLabel(severity)}</em>
              </button>
              {move.reason ? <p>{move.reason}</p> : null}
              <div className="key-move-row__actions">
                <button type="button" onClick={() => onJump?.(move.moveNumber)}>跳到这手</button>
                <button type="button" onClick={() => onAnalyzeMove?.(move.moveNumber)}>分析这手</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
