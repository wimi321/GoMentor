import type { PointerEvent, ReactElement } from 'react'
import { useMemo, useState } from 'react'
import type { GameRecord, KataGoMoveAnalysis } from '@main/lib/types'
import {
  getBoardSize,
  normalizeWinrate,
  renderCandidates,
  renderStones,
  type BoardPoint,
  type RenderCandidate,
  type RenderKeyMove
} from './boardGeometry'
import { CandidateTooltip, type CandidateTooltipMove, type CandidateTooltipPosition } from './CandidateTooltip'
import './board-v2.css'

interface GoBoardV2Props {
  record: GameRecord
  moveNumber: number
  analysis?: KataGoMoveAnalysis | null
  keyMoves?: RenderKeyMove[]
  compact?: boolean
  onPointClick?: (point: BoardPoint) => void
  onCandidateHover?: (candidate: RenderCandidate | null) => void
}

const VIEWBOX = 920
const EDGE = 54
const INNER = VIEWBOX - EDGE * 2
const STAR_CONFIG: Record<number, number[]> = {
  19: [3, 9, 15],
  13: [3, 6, 9],
  9: [2, 4, 6]
}

type HoveredCandidate = {
  candidate: CandidateTooltipMove
  position: CandidateTooltipPosition
} | null

function valueOf(record: unknown, key: string): unknown {
  return typeof record === 'object' && record !== null ? (record as Record<string, unknown>)[key] : undefined
}

function xy(point: BoardPoint, boardSize: number): { x: number; y: number } {
  const cell = INNER / (boardSize - 1)
  return {
    x: EDGE + point.x * cell,
    y: EDGE + point.y * cell
  }
}

function coordinateLetters(boardSize: number): string[] {
  return 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.slice(0, boardSize).split('')
}

function starPoints(boardSize: number): BoardPoint[] {
  const anchors = STAR_CONFIG[boardSize] ?? (boardSize >= 15 ? [3, Math.floor(boardSize / 2), boardSize - 4] : [2, Math.floor(boardSize / 2), boardSize - 3])
  return anchors.flatMap((x) => anchors.map((y) => ({ x, y })))
}

function toTooltipMove(candidate: RenderCandidate): CandidateTooltipMove {
  return {
    order: candidate.rank,
    move: String(valueOf(candidate.raw, 'move') ?? candidate.label),
    gtp: String(valueOf(candidate.raw, 'gtp') ?? valueOf(candidate.raw, 'move') ?? candidate.label),
    winrate: valueOf(candidate.raw, 'winrate') as number | undefined,
    scoreLead: valueOf(candidate.raw, 'scoreLead') as number | undefined,
    visits: valueOf(candidate.raw, 'visits') as number | undefined,
    prior: valueOf(candidate.raw, 'prior') as number | undefined,
    note: candidate.rank === 1 ? 'KataGo 当前首选。' : undefined
  }
}

function formatCandidateWinrate(candidate: RenderCandidate): string {
  const normalized = normalizeWinrate(valueOf(candidate.raw, 'winrate'))
  if (normalized === null) {
    return candidate.winrateLabel?.replace('%', '') ?? '—'
  }
  return (normalized * 100).toFixed(1)
}

function formatCandidateVisits(candidate: RenderCandidate): string {
  const visits = valueOf(candidate.raw, 'visits')
  if (typeof visits !== 'number' || !Number.isFinite(visits)) {
    return candidate.visitsLabel ?? '—'
  }
  if (visits >= 10000) {
    return `${(visits / 10000).toFixed(visits >= 100000 ? 0 : 1)}w`
  }
  if (visits >= 1000) {
    return `${(visits / 1000).toFixed(visits >= 10000 ? 0 : 1)}k`
  }
  return String(Math.round(visits))
}

function formatCandidateScore(candidate: RenderCandidate): string {
  return candidate.scoreLabel ?? '0.0'
}

function tooltipPosition(point: { x: number; y: number }, svg: SVGSVGElement): CandidateTooltipPosition {
  const rect = svg.getBoundingClientRect()
  const x = (point.x / VIEWBOX) * rect.width + 14
  const y = (point.y / VIEWBOX) * rect.height - 14
  return {
    x: Math.min(Math.max(8, x), Math.max(8, rect.width - 250)),
    y: Math.min(Math.max(8, y), Math.max(8, rect.height - 132))
  }
}

function CandidateMark({
  candidate,
  boardSize,
  onHover
}: {
  candidate: RenderCandidate
  boardSize: number
  onHover?: (candidate: RenderCandidate | null, position?: CandidateTooltipPosition) => void
}): ReactElement {
  const p = xy(candidate, boardSize)
  const className = `ks-candidate ks-candidate--${candidate.emphasis} ks-candidate--rank-${candidate.rank}`
  const winrate = formatCandidateWinrate(candidate)
  const visits = formatCandidateVisits(candidate)
  const score = formatCandidateScore(candidate)
  return (
    <g
      className={className}
      transform={`translate(${p.x} ${p.y})`}
      onPointerEnter={(event) => {
        const svg = event.currentTarget.ownerSVGElement
        onHover?.(candidate, svg ? tooltipPosition(p, svg) : { x: p.x, y: p.y })
      }}
      onPointerLeave={() => onHover?.(null)}
    >
      <circle className="ks-candidate-soft-glow" r="27" />
      <circle className="ks-candidate-ring" r="25.5" />
      <circle className="ks-candidate-disc" r="23.5" />
      <circle className="ks-candidate-rank-badge" cx="18" cy="-19" r="9.2" />
      <text className="ks-candidate-rank" x="18" y="-19">{candidate.rank}</text>
      <text className="ks-candidate-winrate" y="-7">{winrate}</text>
      <text className="ks-candidate-visits" y="5.5">{visits}</text>
      <text className="ks-candidate-score" y="17">{score}</text>
    </g>
  )
}

function KeyMoveMark({ mark, boardSize }: { mark: RenderKeyMove; boardSize: number }): ReactElement {
  const p = xy(mark, boardSize)
  return (
    <g className={`ks-keymove ks-keymove--${mark.severity}`} transform={`translate(${p.x} ${p.y})`}>
      <circle r="31" />
      <text y="-33">{mark.label}</text>
    </g>
  )
}

export function GoBoardV2({ record, moveNumber, analysis = null, keyMoves = [], compact = false, onPointClick, onCandidateHover }: GoBoardV2Props): ReactElement {
  const [hoveredCandidate, setHoveredCandidate] = useState<HoveredCandidate>(null)
  const boardSize = getBoardSize(record)
  const stones = useMemo(() => renderStones(record, moveNumber), [record, moveNumber])
  const candidates = useMemo(() => renderCandidates(analysis, boardSize), [analysis, boardSize])
  const lastStone = stones[stones.length - 1]
  const letters = coordinateLetters(boardSize)
  const lines = Array.from({ length: boardSize }, (_, index) => index)
  const activeCandidate = hoveredCandidate

  function handleCandidateHover(candidate: RenderCandidate | null, position?: CandidateTooltipPosition): void {
    setHoveredCandidate(candidate && position ? { candidate: toTooltipMove(candidate), position } : null)
    onCandidateHover?.(candidate)
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
    if (!onPointClick) {
      return
    }
    const svg = event.currentTarget
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const cursor = point.matrixTransform(svg.getScreenCTM()?.inverse())
    const cell = INNER / (boardSize - 1)
    const x = Math.round((cursor.x - EDGE) / cell)
    const y = Math.round((cursor.y - EDGE) / cell)
    if (x >= 0 && y >= 0 && x < boardSize && y < boardSize) {
      onPointClick({ x, y })
    }
  }

  return (
    <div className={`ks-board-shell ${compact ? 'ks-board-shell--compact' : ''}`}>
      <svg className="ks-go-board-v2" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} role="img" aria-label="围棋棋盘" onPointerDown={handlePointerDown}>
        <defs>
          <linearGradient id="ks-board-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ks-board-light, #d8ad6b)" />
            <stop offset="0.44" stopColor="var(--ks-board-mid, #bf8747)" />
            <stop offset="1" stopColor="var(--ks-board-dark, #7c5229)" />
          </linearGradient>
          <linearGradient id="ks-board-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0c987" />
            <stop offset="0.12" stopColor="#ba7c39" />
            <stop offset="0.86" stopColor="#6d431f" />
            <stop offset="1" stopColor="#3f2615" />
          </linearGradient>
          <filter id="ks-board-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="28" stdDeviation="22" floodColor="#000" floodOpacity="0.42" />
          </filter>
          <radialGradient id="ks-black-stone" cx="34%" cy="28%" r="72%">
            <stop offset="0" stopColor="#62676c" />
            <stop offset="0.14" stopColor="#2f3439" />
            <stop offset="0.58" stopColor="#080a0c" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          <radialGradient id="ks-white-stone" cx="32%" cy="24%" r="75%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.34" stopColor="#f4efe7" />
            <stop offset="0.78" stopColor="#cfc7ba" />
            <stop offset="1" stopColor="#91897f" />
          </radialGradient>
          <radialGradient id="ks-stone-highlight" cx="34%" cy="22%" r="50%">
            <stop offset="0" stopColor="rgba(255,255,255,.82)" />
            <stop offset="0.5" stopColor="rgba(255,255,255,.18)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <pattern id="ks-board-grain" width="92" height="46" patternUnits="userSpaceOnUse">
            <path d="M0 8 C24 0 46 18 92 8" stroke="rgba(70,35,10,.14)" strokeWidth="2" fill="none" />
            <path d="M0 31 C30 44 58 23 92 36" stroke="rgba(255,232,165,.10)" strokeWidth="1.5" fill="none" />
            <path d="M0 19 C18 15 38 24 58 17 S78 12 92 17" stroke="rgba(82,41,14,.08)" strokeWidth="1" fill="none" />
          </pattern>
        </defs>

        <rect className="ks-board-drop" x="20" y="20" width="880" height="880" rx="30" filter="url(#ks-board-shadow)" />
        <rect className="ks-board-bevel" x="25" y="25" width="870" height="870" rx="28" />
        <rect className="ks-board-surface-v2" x="34" y="34" width="852" height="852" rx="20" />
        <rect x="34" y="34" width="852" height="852" rx="20" fill="url(#ks-board-grain)" opacity="0.68" />

        <g className="ks-grid-lines">
          {lines.map((index) => {
            const start = xy({ x: 0, y: index }, boardSize)
            const end = xy({ x: boardSize - 1, y: index }, boardSize)
            const verticalStart = xy({ x: index, y: 0 }, boardSize)
            const verticalEnd = xy({ x: index, y: boardSize - 1 }, boardSize)
            return (
              <g key={index}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                <line x1={verticalStart.x} y1={verticalStart.y} x2={verticalEnd.x} y2={verticalEnd.y} />
              </g>
            )
          })}
        </g>

        <g className="ks-star-points">
          {starPoints(boardSize).map((point) => {
            const p = xy(point, boardSize)
            return <circle key={`${point.x}-${point.y}`} cx={p.x} cy={p.y} r="6" />
          })}
        </g>

        <g className="ks-board-coordinates-v2">
          {letters.map((letter, index) => {
            const top = xy({ x: index, y: 0 }, boardSize)
            const left = xy({ x: 0, y: index }, boardSize)
            return (
              <g key={letter}>
                <text x={top.x} y="31">{letter}</text>
                <text x={top.x} y="898">{letter}</text>
                <text x="30" y={left.y + 5}>{boardSize - index}</text>
                <text x="895" y={left.y + 5}>{boardSize - index}</text>
              </g>
            )
          })}
        </g>

        <g className="ks-keymoves-layer">
          {keyMoves.map((mark) => <KeyMoveMark key={`${mark.moveNumber}-${mark.label}`} mark={mark} boardSize={boardSize} />)}
        </g>

        <g className="ks-stones-layer">
          {stones.map((stone) => {
            const p = xy(stone, boardSize)
            const isLast = stone.moveNumber === lastStone?.moveNumber
            return (
              <g key={stone.moveNumber} className={`ks-stone ks-stone--${stone.color}`} transform={`translate(${p.x} ${p.y})`}>
                <circle className="ks-stone-shadow" r="24" />
                <circle className="ks-stone-body" r="22.2" />
                <ellipse className="ks-stone-highlight" cx="-6.5" cy="-8.2" rx="8.6" ry="5.2" />
                {isLast ? <circle className={`ks-last-move ks-last-move--${stone.color}`} r="8" /> : null}
              </g>
            )
          })}
        </g>

        <g className="ks-candidates-layer">
          {candidates.map((candidate) => (
            <CandidateMark key={`${candidate.rank}-${candidate.label}`} candidate={candidate} boardSize={boardSize} onHover={handleCandidateHover} />
          ))}
        </g>
      </svg>

      <CandidateTooltip
        candidate={activeCandidate?.candidate ?? null}
        position={activeCandidate?.position ?? null}
      />
    </div>
  )
}
