import type { StudentProfile } from '../profile/studentProfile'
import {
  attachGameToStudent,
  listStudents,
  resolveStudentByFoxNickname,
  upsertManualStudent,
  upsertStudentAlias
} from '../profile/studentProfile'

export interface GamePlayerNames {
  blackName?: string
  whiteName?: string
  source?: 'fox' | 'sgf' | string
  foxNickname?: string
}

export interface StudentBindingSuggestion {
  student: StudentProfile
  confidence: 'high' | 'medium' | 'low'
  reason: string
  color?: 'B' | 'W'
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function colorForName(name: string, game: GamePlayerNames): 'B' | 'W' | undefined {
  const wanted = normalize(name)
  if (wanted && wanted === normalize(game.blackName)) return 'B'
  if (wanted && wanted === normalize(game.whiteName)) return 'W'
  return undefined
}

export async function suggestStudentBindings(game: GamePlayerNames): Promise<StudentBindingSuggestion[]> {
  const students = await listStudents()
  const suggestions: StudentBindingSuggestion[] = []
  const candidates = [game.foxNickname, game.blackName, game.whiteName].filter(Boolean) as string[]
  const candidateSet = new Set(candidates.map(normalize))

  for (const student of students) {
    const names = [student.primaryFoxNickname, student.displayName, ...student.aliases].filter(Boolean) as string[]
    const matched = names.find((name) => candidateSet.has(normalize(name)))
    if (!matched) continue
    const color = colorForName(matched, game)
    const isFox = normalize(student.primaryFoxNickname) === normalize(game.foxNickname)
    suggestions.push({
      student,
      confidence: isFox ? 'high' : color ? 'medium' : 'low',
      reason: isFox ? '野狐昵称精确匹配' : color ? `棋手名匹配${color === 'B' ? '黑方' : '白方'}` : '别名匹配',
      color
    })
  }

  return suggestions.sort((a, b) => {
    const score = { high: 3, medium: 2, low: 1 }
    return score[b.confidence] - score[a.confidence]
  })
}

export async function bindFoxGamesToStudent(input: {
  foxNickname: string
  gameIds: string[]
  aliases?: string[]
}): Promise<StudentProfile> {
  let student = await resolveStudentByFoxNickname(input.foxNickname)
  for (const alias of input.aliases ?? []) {
    student = await upsertStudentAlias(student.id, alias)
  }
  for (const gameId of input.gameIds) {
    student = await attachGameToStudent(gameId, student.id)
  }
  return student
}

export async function bindSgfGameToStudent(input: {
  gameId: string
  studentId?: string
  createDisplayName?: string
  aliasFromPlayerName?: string
}): Promise<StudentProfile | null> {
  let student: StudentProfile | null = null
  if (input.studentId) {
    const all = await listStudents()
    student = all.find((item) => item.id === input.studentId) ?? null
    if (!student) throw new Error(`找不到学生画像: ${input.studentId}`)
  } else if (input.createDisplayName?.trim()) {
    student = await upsertManualStudent(input.createDisplayName.trim())
  }
  if (!student) return null
  if (input.aliasFromPlayerName?.trim()) {
    student = await upsertStudentAlias(student.id, input.aliasFromPlayerName.trim())
  }
  return attachGameToStudent(input.gameId, student.id)
}

export function selectStudentColor(game: GamePlayerNames, student: StudentProfile | null): 'B' | 'W' | null {
  if (!student) return null
  const names = [student.primaryFoxNickname, student.displayName, ...student.aliases].filter(Boolean) as string[]
  for (const name of names) {
    const color = colorForName(name, game)
    if (color) return color
  }
  return null
}
