import { randomUUID } from 'node:crypto'
import { profileStore } from '@main/lib/store'
import type { CoachUserLevel, StudentProfile } from '@main/lib/types'

export type { StudentProfile } from '@main/lib/types'

interface ProfileIndex {
  version: 1
  aliasToId: Record<string, string>
  gameStudentMap: Record<string, string>
}

const INDEX_KEY = '__profile_index__'

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function profileId(name: string): string {
  const normalized = normalizeName(name)
  return normalized ? randomUUID() : 'default-student'
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyIndex(): ProfileIndex {
  return { version: 1, aliasToId: {}, gameStudentMap: {} }
}

function getIndex(): ProfileIndex {
  return (profileStore.get(INDEX_KEY) as ProfileIndex | undefined) ?? emptyIndex()
}

function saveIndex(index: ProfileIndex): void {
  profileStore.set(INDEX_KEY, index)
}

function mistakeArrayToStats(commonMistakes: StudentProfile['commonMistakes'] | undefined): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const item of commonMistakes ?? []) {
    stats[item.tag] = item.count
  }
  return stats
}

function statsToMistakeArray(stats: Record<string, number>): StudentProfile['commonMistakes'] {
  return Object.entries(stats)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
}

function hydrateProfile(raw: unknown, fallbackName = '默认学生'): StudentProfile | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const data = raw as Partial<StudentProfile>
  const name = data.name ?? data.displayName ?? fallbackName
  const createdAt = data.createdAt ?? data.updatedAt ?? nowIso()
  const weaknessStats = data.weaknessStats ?? mistakeArrayToStats(data.commonMistakes)
  const stableId = data.studentId ?? data.id ?? profileId(name)
  return {
    id: stableId,
    studentId: stableId,
    name,
    displayName: data.displayName ?? name,
    primaryFoxNickname: data.primaryFoxNickname,
    aliases: Array.from(new Set([...(data.aliases ?? []), name, data.displayName ?? ''].filter(Boolean))),
    createdFrom: data.createdFrom ?? 'legacy',
    userLevel: data.userLevel ?? 'intermediate',
    gamesReviewed: data.gamesReviewed ?? 0,
    weaknessStats,
    recentPatterns: data.recentPatterns ?? [],
    trainingFocus: data.trainingFocus ?? data.trainingThemes ?? [],
    recentGameIds: data.recentGameIds ?? [],
    commonMistakes: data.commonMistakes ?? statsToMistakeArray(weaknessStats),
    trainingThemes: data.trainingThemes ?? data.trainingFocus ?? [],
    typicalMoves: data.typicalMoves ?? [],
    updatedAt: data.updatedAt ?? createdAt,
    createdAt,
    lastAnalyzedAt: data.lastAnalyzedAt
  }
}

function saveStudentProfileInternal(profile: StudentProfile): StudentProfile {
  const next: StudentProfile = {
    ...profile,
    id: profile.studentId || profile.id,
    studentId: profile.studentId || profile.id,
    name: profile.displayName || profile.name,
    displayName: profile.displayName || profile.name,
    commonMistakes: statsToMistakeArray(profile.weaknessStats),
    trainingThemes: Array.from(new Set([...(profile.trainingThemes ?? []), ...(profile.trainingFocus ?? [])])).slice(0, 12),
    updatedAt: nowIso()
  }
  profileStore.set(next.studentId, next)

  const index = getIndex()
  for (const alias of [next.name, next.displayName, next.primaryFoxNickname ?? '', ...next.aliases]) {
    const normalized = normalizeName(alias)
    if (normalized) {
      index.aliasToId[normalized] = next.studentId
    }
  }
  saveIndex(index)
  return next
}

function allProfiles(): StudentProfile[] {
  return Object.entries(profileStore.store)
    .filter(([key]) => key !== INDEX_KEY)
    .map(([, value]) => hydrateProfile(value))
    .filter((profile): profile is StudentProfile => Boolean(profile))
}

function findByAlias(name: string): StudentProfile | null {
  const normalized = normalizeName(name)
  if (!normalized) {
    return null
  }
  const index = getIndex()
  const indexedId = index.aliasToId[normalized]
  if (indexedId) {
    const indexed = hydrateProfile(profileStore.get(indexedId), name)
    if (indexed) {
      return indexed
    }
  }
  return allProfiles().find((profile) =>
    [profile.name, profile.displayName, profile.primaryFoxNickname ?? '', ...profile.aliases]
      .map(normalizeName)
      .includes(normalized)
  ) ?? null
}

export function listStudents(): StudentProfile[] {
  return allProfiles().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function resolveStudentByName(displayName: string, createdFrom: StudentProfile['createdFrom'] = 'manual'): StudentProfile {
  const name = displayName.trim() || '默认学生'
  const existing = findByAlias(name)
  if (existing) {
    return saveStudentProfileInternal(existing)
  }
  const timestamp = nowIso()
  const id = profileId(name)
  return saveStudentProfileInternal({
    id,
    studentId: id,
    name,
    displayName: name,
    aliases: [name],
    createdFrom,
    userLevel: 'intermediate',
    gamesReviewed: 0,
    weaknessStats: {},
    recentPatterns: [],
    trainingFocus: [],
    recentGameIds: [],
    commonMistakes: [],
    trainingThemes: [],
    typicalMoves: [],
    createdAt: timestamp,
    updatedAt: timestamp
  })
}

export function upsertManualStudent(displayName: string): StudentProfile {
  return resolveStudentByName(displayName, 'manual')
}

export function resolveStudentByFoxNickname(nickname: string): StudentProfile {
  const name = nickname.trim() || '默认学生'
  const existing = findByAlias(name)
  if (existing) {
    return saveStudentProfileInternal({
      ...existing,
      displayName: existing.displayName || name,
      primaryFoxNickname: existing.primaryFoxNickname ?? name,
      aliases: Array.from(new Set([...existing.aliases, name])),
      createdFrom: existing.createdFrom === 'legacy' ? 'fox' : existing.createdFrom
    })
  }
  const student = resolveStudentByName(name, 'fox')
  return saveStudentProfileInternal({
    ...student,
    primaryFoxNickname: name,
    aliases: Array.from(new Set([...student.aliases, name]))
  })
}

export function upsertStudentAlias(studentId: string, alias: string): StudentProfile {
  const profile = hydrateProfile(profileStore.get(studentId), alias)
  if (!profile) {
    throw new Error(`找不到学生画像: ${studentId}`)
  }
  const normalizedAliases = new Set(profile.aliases.map(normalizeName))
  const nextAlias = alias.trim()
  if (nextAlias && !normalizedAliases.has(normalizeName(nextAlias))) {
    profile.aliases.push(nextAlias)
  }
  return saveStudentProfileInternal(profile)
}

export function attachGameToStudent(gameId: string, studentId: string): StudentProfile {
  const profile = hydrateProfile(profileStore.get(studentId))
  if (!profile) {
    throw new Error(`找不到学生画像: ${studentId}`)
  }
  const index = getIndex()
  index.gameStudentMap[gameId] = profile.studentId
  saveIndex(index)
  const nextGames = [gameId, ...profile.recentGameIds.filter((id) => id !== gameId)].slice(0, 80)
  return saveStudentProfileInternal({ ...profile, recentGameIds: nextGames })
}

export function readStudentForGame(gameId: string): StudentProfile | null {
  const studentId = getIndex().gameStudentMap[gameId]
  return studentId ? hydrateProfile(profileStore.get(studentId)) : null
}

export function getStudentProfile(name: string): StudentProfile {
  return resolveStudentByName(name || '默认学生')
}

export function saveStudentProfile(profile: StudentProfile): StudentProfile {
  return saveStudentProfileInternal(profile)
}

export function updateStudentProfile(
  name: string,
  update: {
    reviewedGames?: number
    userLevel?: CoachUserLevel
    mistakeTags?: string[]
    trainingThemes?: string[]
    typicalMoves?: StudentProfile['typicalMoves']
    recentPatterns?: string[]
    trainingFocus?: string[]
    gameId?: string
  }
): StudentProfile {
  const profile = getStudentProfile(name)
  const weaknessStats = { ...profile.weaknessStats }
  for (const tag of update.mistakeTags ?? []) {
    weaknessStats[tag] = (weaknessStats[tag] ?? 0) + 1
  }

  const trainingFocus = Array.from(new Set([
    ...(update.trainingFocus ?? []),
    ...(update.trainingThemes ?? []),
    ...profile.trainingFocus
  ])).slice(0, 12)
  const recentPatterns = Array.from(new Set([...(update.recentPatterns ?? []), ...profile.recentPatterns])).slice(0, 20)
  const typicalMoves = [...(update.typicalMoves ?? []), ...profile.typicalMoves]
    .sort((a, b) => b.lossWinrate - a.lossWinrate)
    .slice(0, 12)
  const recentGameIds = update.gameId
    ? [update.gameId, ...profile.recentGameIds.filter((id) => id !== update.gameId)].slice(0, 80)
    : profile.recentGameIds

  const saved = saveStudentProfileInternal({
    ...profile,
    userLevel: update.userLevel ?? profile.userLevel,
    gamesReviewed: profile.gamesReviewed + (update.reviewedGames ?? 0),
    weaknessStats,
    recentPatterns,
    trainingFocus,
    recentGameIds,
    typicalMoves,
    lastAnalyzedAt: nowIso()
  })
  if (update.gameId) {
    const index = getIndex()
    index.gameStudentMap[update.gameId] = saved.studentId
    saveIndex(index)
  }
  return saved
}

export function updateStudentAfterAnalysis(input: {
  studentId: string
  gameId?: string
  errorTypes: string[]
  patterns: string[]
  trainingFocus: string[]
}): StudentProfile {
  const profile = hydrateProfile(profileStore.get(input.studentId))
  if (!profile) {
    throw new Error(`找不到学生画像: ${input.studentId}`)
  }
  const weaknessStats = { ...profile.weaknessStats }
  for (const errorType of input.errorTypes) {
    weaknessStats[errorType] = (weaknessStats[errorType] ?? 0) + 1
  }
  const saved = saveStudentProfileInternal({
    ...profile,
    weaknessStats,
    recentPatterns: Array.from(new Set([...input.patterns, ...profile.recentPatterns])).slice(0, 20),
    trainingFocus: Array.from(new Set([...input.trainingFocus, ...profile.trainingFocus])).slice(0, 12),
    recentGameIds: input.gameId ? [input.gameId, ...profile.recentGameIds.filter((id) => id !== input.gameId)].slice(0, 80) : profile.recentGameIds,
    lastAnalyzedAt: nowIso()
  })
  if (input.gameId) {
    attachGameToStudent(input.gameId, saved.studentId)
  }
  return saved
}

export function formatStudentProfileForPrompt(student: StudentProfile | null): string {
  if (!student) {
    return '当前没有绑定学生画像。请按首次接触学生的方式讲解，不要臆造长期弱点。'
  }
  const weakness = Object.entries(student.weaknessStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}:${count}`)
    .join(', ') || '暂无稳定统计'
  return [
    `学生: ${student.displayName}`,
    `student_id: ${student.studentId}`,
    `野狐昵称: ${student.primaryFoxNickname ?? '未绑定'}`,
    `别名: ${student.aliases.join(', ') || '无'}`,
    `复盘局数: ${student.gamesReviewed}`,
    `常见问题: ${weakness}`,
    `近期模式: ${student.recentPatterns.join('；') || '暂无'}`,
    `训练重点: ${student.trainingFocus.join('；') || '暂无'}`
  ].join('\n')
}
