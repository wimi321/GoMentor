import type { ReactElement } from 'react'

export interface TeacherKeyMoveActionItem {
  moveNumber: number
  title?: string
  summary?: string
  severity?: string
}

export interface TeacherKeyMoveActionsProps {
  moves: TeacherKeyMoveActionItem[]
  onJumpToMove?: (moveNumber: number) => void
  onAnalyzeMove?: (moveNumber: number) => void
}

export function TeacherKeyMoveActions({ moves, onJumpToMove, onAnalyzeMove }: TeacherKeyMoveActionsProps): ReactElement | null {
  if (!moves.length) {
    return null
  }

  return (
    <div className="teacher-keymove-actions">
      {moves.slice(0, 6).map((move) => (
        <div key={move.moveNumber} className="teacher-keymove-actions__row">
          <div>
            <strong>{move.title || `第 ${move.moveNumber} 手`}</strong>
            {move.summary ? <small>{move.summary}</small> : null}
          </div>
          <div className="teacher-keymove-actions__buttons">
            <button type="button" onClick={() => onJumpToMove?.(move.moveNumber)}>跳转</button>
            <button type="button" onClick={() => onAnalyzeMove?.(move.moveNumber)}>重析</button>
          </div>
        </div>
      ))}
    </div>
  )
}
