import type { ReactElement } from 'react'
import { formatScoreLead, formatWinrate } from './timelineInteraction'

export interface CandidateTooltipMove {
  order?: number
  move?: string
  gtp?: string
  winrate?: number
  scoreLead?: number
  visits?: number
  prior?: number
  note?: string
}

export interface CandidateTooltipPosition {
  x: number
  y: number
}

export interface CandidateTooltipProps {
  candidate: CandidateTooltipMove | null
  position: CandidateTooltipPosition | null
  boardLabel?: string
}

function formatPrior(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—'
  }
  return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`
}

export function CandidateTooltip({ candidate, position, boardLabel }: CandidateTooltipProps): ReactElement | null {
  if (!candidate || !position) {
    return null
  }

  const title = candidate.move || candidate.gtp || boardLabel || '候选点'
  const order = candidate.order ? `#${candidate.order}` : '推荐'

  return (
    <div
      className="candidate-tooltip"
      style={{
        transform: `translate(${Math.round(position.x)}px, ${Math.round(position.y)}px)`
      }}
      role="tooltip"
    >
      <div className="candidate-tooltip__head">
        <strong>{title}</strong>
        <span>{order}</span>
      </div>
      <div className="candidate-tooltip__grid">
        <span>胜率</span>
        <strong>{formatWinrate(candidate.winrate)}</strong>
        <span>目差</span>
        <strong>{formatScoreLead(candidate.scoreLead)}</strong>
        <span>访问</span>
        <strong>{candidate.visits ?? '—'}</strong>
        <span>先验</span>
        <strong>{formatPrior(candidate.prior)}</strong>
      </div>
      {candidate.note ? <p>{candidate.note}</p> : null}
    </div>
  )
}
