export type TeacherTaskType = 'current-move' | 'full-game' | 'recent-games' | 'freeform' | 'move-range'

export interface TeacherKeyMistake {
  moveNumber?: number
  color?: 'B' | 'W'
  played?: string
  recommended?: string
  errorType: string
  severity: 'inaccuracy' | 'mistake' | 'blunder'
  evidence: string
  explanation: string
}

export interface StructuredTeacherResult {
  taskType: TeacherTaskType
  headline: string
  summary: string
  keyMistakes: TeacherKeyMistake[]
  correctThinking: string[]
  drills: string[]
  followupQuestions: string[]
  markdown: string
  knowledgeCardIds: string[]
  profileUpdates: {
    errorTypes: string[]
    patterns: string[]
    trainingFocus: string[]
  }
}
