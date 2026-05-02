import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { KataGoMoveAnalysis } from '@main/lib/types'
import { getAnalysisMoveNumber, getAnalysisWinrate, classifyMoveLoss, normalizeWinrate } from './boardGeometry'
import { moveFromPointer } from './timelineInteraction'
import './board-v2.css'

interface TimelinePoint {
  moveNumber: number
  winrate: number
  scoreLead?: number
  loss?: number
  severity?: 'blunder' | 'mistake' | 'inaccuracy' | 'turning-point'
}

interface WinrateTimelineV2Props {
  evaluations: KataGoMoveAnalysis[]
  currentMoveNumber: number
  totalMoves: number
  loading?: boolean
  loadingLabel?: string
  onMove?: (moveNumber: number) => void
  onRangeSelect?: (start: number, end: number) => void
  onRangeClear?: () => void
  rangeStart?: number | null
  rangeEnd?: number | null
  summary?: ReactNode
}

function valueOf(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null ? (record as Record<string, unknown>)[key] : undefined
}

function extractLoss(item: unknown): number | undefined {
  const raw = valueOf(valueOf(item, 'playedMove'), 'winrateLoss') ?? valueOf(item, 'winrateLoss') ?? valueOf(item, 'loss') ?? valueOf(item, 'mistakeLoss')
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.abs(raw))
  }
  const before = normalizeWinrate(valueOf(valueOf(item, 'before'), 'winrate'))
  const after = normalizeWinrate(valueOf(valueOf(item, 'after'), 'winrate'))
  if (before !== null && after !== null) {
    const color = valueOf(valueOf(item, 'currentMove'), 'color')
    const playerBefore = color === 'W' ? 1 - before : before
    const playerAfter = color === 'W' ? 1 - after : after
    return Math.max(0, (playerBefore - playerAfter) * 100)
  }
  return undefined
}

function severityLabel(severity: TimelinePoint['severity']): string {
  if (severity === 'blunder') return '重大问题'
  if (severity === 'mistake') return '问题手'
  if (severity === 'inaccuracy') return '缓手'
  return '走势点'
}

function formatWinrateLoss(loss: number | undefined): string {
  if (typeof loss !== 'number' || !Number.isFinite(loss)) {
    return '—'
  }
  return `${loss.toFixed(loss >= 10 ? 0 : 1)}%`
}

function extractScoreLead(item: unknown): number | undefined {
  const raw =
    valueOf(valueOf(item, 'after'), 'scoreLead') ??
    valueOf(valueOf(item, 'after'), 'scoreMean') ??
    valueOf(valueOf(item, 'after'), 'score') ??
    valueOf(item, 'scoreLead') ??
    valueOf(item, 'scoreMean')
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  return undefined
}

function buildPoints(evaluations: KataGoMoveAnalysis[], totalMoves: number): TimelinePoint[] {
  return evaluations.flatMap((item) => {
    const moveNumber = getAnalysisMoveNumber(item)
    const winrate = getAnalysisWinrate(item)
    if (moveNumber === null || winrate === null) {
      return []
    }
    const loss = extractLoss(item)
    return [{
      moveNumber,
      winrate,
      scoreLead: extractScoreLead(item),
      loss,
      severity: loss === undefined ? undefined : classifyMoveLoss(loss)
    }]
  }).filter((point) => point.moveNumber >= 0 && point.moveNumber <= totalMoves)
    .sort((a, b) => a.moveNumber - b.moveNumber)
}

export function WinrateTimelineV2({ evaluations, currentMoveNumber, totalMoves, loading = false, loadingLabel = '', onMove, onRangeSelect, onRangeClear, rangeStart: activeRangeStart, rangeEnd: activeRangeEnd, summary }: WinrateTimelineV2Props): ReactElement {
  const [dragging, setDragging] = useState(false)
  const [hoveredMove, setHoveredMove] = useState<number | null>(null)
  const [hoverLeft, setHoverLeft] = useState(0)
  const [dragRangeStart, setDragRangeStart] = useState<number | null>(null)
  const [dragRangeEnd, setDragRangeEnd] = useState<number | null>(null)
  const [isRangeDragging, setIsRangeDragging] = useState(false)
  const draggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const points = useMemo(() => buildPoints(evaluations, totalMoves), [evaluations, totalMoves])
  const width = 980
  const height = 132
  const padX = 34
  const padY = 18
  const plotW = width - padX * 2
  const plotH = height - padY * 2
  const safeTotal = Math.max(1, totalMoves)
  const x = (move: number) => padX + (Math.max(0, Math.min(safeTotal, move)) / safeTotal) * plotW
  const y = (winrate: number) => padY + (1 - winrate) * plotH
  const scoreScale = Math.max(5, Math.ceil(Math.max(0, ...points.map((point) => Math.abs(point.scoreLead ?? 0))) / 5) * 5)
  const yScore = (scoreLead: number) => padY + plotH / 2 - Math.max(-scoreScale, Math.min(scoreScale, scoreLead)) * (plotH / 2 - 5) / scoreScale
  const path = points.length > 1
    ? points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.moveNumber).toFixed(1)} ${y(point.winrate).toFixed(1)}`).join(' ')
    : ''
  const scorePath = points.filter((point) => typeof point.scoreLead === 'number').length > 1
    ? points
      .filter((point): point is TimelinePoint & { scoreLead: number } => typeof point.scoreLead === 'number')
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.moveNumber).toFixed(1)} ${yScore(point.scoreLead).toFixed(1)}`)
      .join(' ')
    : ''
  const hoverPoint = hoveredMove === null
    ? null
    : points.reduce<TimelinePoint | null>((nearest, point) => {
      if (!nearest) return point
      return Math.abs(point.moveNumber - hoveredMove) < Math.abs(nearest.moveNumber - hoveredMove) ? point : nearest
    }, null)
  const currentPoint = points.find((point) => point.moveNumber === currentMoveNumber)
  const currentLossLabel = formatWinrateLoss(currentPoint?.loss)

  const hasActiveRange = activeRangeStart != null && activeRangeEnd != null
  const rangeLo = isRangeDragging
    ? Math.min(dragRangeStart ?? 0, dragRangeEnd ?? 0)
    : hasActiveRange ? Math.min(activeRangeStart!, activeRangeEnd!) : null
  const rangeHi = isRangeDragging
    ? Math.max(dragRangeStart ?? 0, dragRangeEnd ?? 0)
    : hasActiveRange ? Math.max(activeRangeStart!, activeRangeEnd!) : null

  function moveFromEvent(event: ReactPointerEvent<SVGSVGElement>): number {
    const rect = event.currentTarget.getBoundingClientRect()
    return moveFromPointer({
      clientX: event.clientX,
      rect: {
        left: rect.left + (padX / width) * rect.width,
        width: (plotW / width) * rect.width
      },
      totalMoves
    })
  }

  function selectMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!onMove) return
    onMove(moveFromEvent(event))
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.altKey) {
      event.preventDefault()
      containerRef.current?.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      const move = moveFromEvent(event)
      setIsRangeDragging(true)
      setDragRangeStart(move)
      setDragRangeEnd(move)
      return
    }
    if (hasActiveRange) {
      onRangeClear?.()
    }
    containerRef.current?.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    setDragging(true)
    selectMove(event)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (isRangeDragging) {
      setDragRangeEnd(moveFromEvent(event))
      return
    }
    const move = moveFromEvent(event)
    const rect = event.currentTarget.getBoundingClientRect()
    const rawLeft = event.clientX - rect.left
    setHoveredMove(move)
    setHoverLeft(Math.min(Math.max(8, rawLeft + 10), Math.max(8, rect.width - 166)))
    if (draggingRef.current) {
      selectMove(event)
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>): void {
    if (isRangeDragging) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      const endMove = moveFromEvent(event)
      setIsRangeDragging(false)
      if (dragRangeStart !== null && endMove !== dragRangeStart) {
        const lo = Math.min(dragRangeStart, endMove)
        const hi = Math.max(dragRangeStart, endMove)
        onRangeSelect?.(lo, hi)
      }
      setDragRangeStart(null)
      setDragRangeEnd(null)
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    draggingRef.current = false
    setDragging(false)
    selectMove(event)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' && hasActiveRange) {
      onRangeClear?.()
      return
    }
    if (!onMove || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
      return
    }
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    onMove(Math.max(0, Math.min(totalMoves, currentMoveNumber + delta)))
  }

  return (
    <div
      ref={containerRef}
      className="ks-timeline-v2"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="胜率图，点击后可用左右方向键切换手数"
    >
      <div className="ks-timeline-head">
        <div className="ks-timeline-title">
          <span>胜率走势</span>
          <small>{loading ? (loadingLabel || '分析中') : '胜率 / 目差曲线'}</small>
        </div>
        <div className="ks-timeline-move-count">{currentMoveNumber} / {totalMoves}</div>
        <div className={`ks-timeline-current-loss ks-timeline-current-loss--${currentPoint?.severity ?? 'quiet'}`}>
          <span>当前胜率差</span>
          <strong>{currentLossLabel}</strong>
        </div>
        <div className="ks-timeline-legend" aria-label="曲线说明">
          <span><i className="ks-timeline-legend__swatch ks-timeline-legend__swatch--winrate" />黑胜率</span>
          <span><i className="ks-timeline-legend__swatch ks-timeline-legend__swatch--score" />目差</span>
        </div>
        {summary ? <div className="ks-timeline-summary">{summary}</div> : null}
      </div>
      <svg
        className={`ks-timeline-canvas ${dragging ? 'is-dragging' : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={() => {
          if (!draggingRef.current && !isRangeDragging) {
            setHoveredMove(null)
          }
        }}
        role="img"
        aria-label="胜率图"
      >
        <defs>
          <linearGradient id="ks-timeline-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#171d24" />
            <stop offset="1" stopColor="#0d1116" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width={width - 12} height={height - 12} rx="14" fill="url(#ks-timeline-bg)" />
        {[0.25, 0.5, 0.75].map((row) => (
          <line key={row} className="ks-timeline-grid" x1={padX} y1={padY + row * plotH} x2={width - padX} y2={padY + row * plotH} />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((col) => (
          <line key={col} className="ks-timeline-grid ks-timeline-grid--vertical" x1={padX + col * plotW} y1={padY} x2={padX + col * plotW} y2={height - padY} />
        ))}
        <line className="ks-timeline-center" x1={padX} y1={y(0.5)} x2={width - padX} y2={y(0.5)} />
        {path ? <path className="ks-timeline-line ks-timeline-line--winrate" d={path} /> : null}
        {scorePath ? <path className="ks-timeline-line ks-timeline-line--score" d={scorePath} /> : null}
        {rangeLo !== null && rangeHi !== null ? (
          <g className="ks-timeline-range">
            <rect
              className="ks-timeline-range-highlight"
              x={x(rangeLo)}
              y={padY}
              width={x(rangeHi) - x(rangeLo)}
              height={plotH}
            />
          </g>
        ) : null}
        <line className="ks-timeline-current" x1={x(currentMoveNumber)} y1={padY} x2={x(currentMoveNumber)} y2={height - padY} />
        {hoverPoint ? (
          <g className="ks-timeline-hover">
            <line className="ks-timeline-hover-line" x1={x(hoverPoint.moveNumber)} y1={padY} x2={x(hoverPoint.moveNumber)} y2={height - padY} />
            <circle className="ks-timeline-hover-dot" cx={x(hoverPoint.moveNumber)} cy={y(hoverPoint.winrate)} r="5" />
          </g>
        ) : null}
        <g transform={`translate(${x(currentMoveNumber)} ${padY + 12})`}>
          <rect className="ks-timeline-current-label-bg" x="-21" y="-12" width="42" height="22" rx="11" />
          <text className="ks-timeline-current-label" y="4">{currentMoveNumber}</text>
        </g>
        {points.length === 0 ? <text className="ks-timeline-empty" x={width / 2} y={height / 2}>导入棋谱后生成胜率图</text> : null}
      </svg>
      {rangeLo !== null && rangeHi !== null && !isRangeDragging ? (
        <div className="ks-timeline-range-badge">
          {rangeLo} - {rangeHi}
        </div>
      ) : null}
      {hoverPoint ? (
        <div className="ks-timeline-tooltip" style={{ left: `${Math.round(hoverLeft)}px` }}>
          <strong>第 {hoverPoint.moveNumber} 手 · {Math.round(hoverPoint.winrate * 100)}%</strong>
          <span>胜率差 {formatWinrateLoss(hoverPoint.loss)} · {severityLabel(hoverPoint.severity)}</span>
        </div>
      ) : null}
    </div>
  )
}
