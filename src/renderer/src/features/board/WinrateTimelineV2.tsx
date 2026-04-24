import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { KataGoMoveAnalysis } from '@main/lib/types'
import { getAnalysisMoveNumber, getAnalysisWinrate, classifyMoveLoss, normalizeWinrate } from './boardGeometry'
import { moveFromPointer } from './timelineInteraction'
import './board-v2.css'

interface TimelinePoint {
  moveNumber: number
  winrate: number
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
}

function valueOf(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null ? (record as Record<string, unknown>)[key] : undefined
}

function extractLoss(item: unknown): number | undefined {
  const raw = valueOf(item, 'winrateLoss') ?? valueOf(item, 'loss') ?? valueOf(item, 'mistakeLoss')
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  const before = normalizeWinrate(valueOf(valueOf(item, 'before'), 'winrate'))
  const after = normalizeWinrate(valueOf(valueOf(item, 'after'), 'winrate'))
  if (before !== null && after !== null) {
    return before - after
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
      loss,
      severity: loss === undefined ? undefined : classifyMoveLoss(loss)
    }]
  }).filter((point) => point.moveNumber >= 0 && point.moveNumber <= totalMoves)
    .sort((a, b) => a.moveNumber - b.moveNumber)
}

export function WinrateTimelineV2({ evaluations, currentMoveNumber, totalMoves, loading = false, loadingLabel = '', onMove }: WinrateTimelineV2Props): ReactElement {
  const [dragging, setDragging] = useState(false)
  const [hoveredMove, setHoveredMove] = useState<number | null>(null)
  const [hoverLeft, setHoverLeft] = useState(0)
  const draggingRef = useRef(false)
  const points = useMemo(() => buildPoints(evaluations, totalMoves), [evaluations, totalMoves])
  const width = 980
  const height = 154
  const padX = 34
  const padY = 18
  const plotW = width - padX * 2
  const plotH = height - padY * 2
  const safeTotal = Math.max(1, totalMoves)
  const x = (move: number) => padX + (Math.max(0, Math.min(safeTotal, move)) / safeTotal) * plotW
  const y = (winrate: number) => padY + (1 - winrate) * plotH
  const path = points.length > 1
    ? points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.moveNumber).toFixed(1)} ${y(point.winrate).toFixed(1)}`).join(' ')
    : ''
  const areaPath = path && points.length > 1
    ? `${path} L ${x(points[points.length - 1].moveNumber).toFixed(1)} ${height - padY} L ${x(points[0].moveNumber).toFixed(1)} ${height - padY} Z`
    : ''
  const hoverPoint = hoveredMove === null
    ? null
    : points.reduce<TimelinePoint | null>((nearest, point) => {
      if (!nearest) return point
      return Math.abs(point.moveNumber - hoveredMove) < Math.abs(nearest.moveNumber - hoveredMove) ? point : nearest
    }, null)

  function moveFromEvent(event: React.PointerEvent<SVGSVGElement>): number {
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

  function selectMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (!onMove) return
    onMove(moveFromEvent(event))
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    setDragging(true)
    selectMove(event)
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    const move = moveFromEvent(event)
    const rect = event.currentTarget.getBoundingClientRect()
    const rawLeft = event.clientX - rect.left
    setHoveredMove(move)
    setHoverLeft(Math.min(Math.max(8, rawLeft + 10), Math.max(8, rect.width - 166)))
    if (draggingRef.current) {
      selectMove(event)
    }
  }

  function handlePointerEnd(event: React.PointerEvent<SVGSVGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    draggingRef.current = false
    setDragging(false)
    selectMove(event)
  }

  return (
    <div className="ks-timeline-v2">
      <div className="ks-timeline-head">
        <span>胜率走势</span>
        <small>{loading ? (loadingLabel || '分析中') : `${points.length}/${totalMoves || 0} 局面`}</small>
      </div>
      <svg
        className={`ks-timeline-canvas ${dragging ? 'is-dragging' : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={() => {
          if (!draggingRef.current) {
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
          <linearGradient id="ks-timeline-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(235,207,134,.32)" />
            <stop offset="1" stopColor="rgba(235,207,134,0)" />
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
        {areaPath ? <path className="ks-timeline-area" d={areaPath} /> : null}
        {path ? <path className="ks-timeline-line" d={path} /> : null}
        {points.map((point) => {
          const visibleLoss = typeof point.loss === 'number' && Math.abs(point.loss) >= 0.04
          return visibleLoss ? (
            <g key={`loss-${point.moveNumber}`} className={`ks-timeline-loss ks-timeline-loss--${point.severity ?? 'turning-point'}`}>
              <rect x={x(point.moveNumber) - 2} y={y(0.5)} width="4" height={Math.max(5, Math.abs(point.loss ?? 0) * plotH)} />
            </g>
          ) : null
        })}
        {points.filter((point) => point.severity === 'blunder' || point.severity === 'mistake').slice(0, 12).map((point) => (
          <circle key={`dot-${point.moveNumber}`} className={`ks-timeline-dot ks-timeline-dot--${point.severity}`} cx={x(point.moveNumber)} cy={y(point.winrate)} r="4.5" />
        ))}
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
      {hoverPoint ? (
        <div className="ks-timeline-tooltip" style={{ left: `${Math.round(hoverLeft)}px` }}>
          <strong>第 {hoverPoint.moveNumber} 手 · {Math.round(hoverPoint.winrate * 100)}%</strong>
          <span>目差估计 {(hoverPoint.winrate * 20 - 10).toFixed(1)} · {hoverPoint.severity === 'blunder' ? '重大问题' : hoverPoint.severity === 'mistake' ? '问题手' : hoverPoint.severity === 'inaccuracy' ? '缓手' : '走势点'}</span>
        </div>
      ) : null}
    </div>
  )
}
