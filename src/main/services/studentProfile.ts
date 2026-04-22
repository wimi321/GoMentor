import { profileStore } from '@main/lib/store'
import type { CoachUserLevel, StudentProfile } from '@main/lib/types'

function profileId(name: string): string {
  return (name || 'default-student').trim().toLowerCase().replace(/\s+/g, '-')
}

function emptyProfile(name: string): StudentProfile {
  return {
    id: profileId(name),
    name: name || '默认学生',
    userLevel: 'intermediate',
    gamesReviewed: 0,
    commonMistakes: [],
    trainingThemes: [],
    typicalMoves: [],
    updatedAt: new Date().toISOString()
  }
}

export function getStudentProfile(name: string): StudentProfile {
  const id = profileId(name)
  return (profileStore.get(id) as StudentProfile | undefined) ?? emptyProfile(name)
}

export function saveStudentProfile(profile: StudentProfile): StudentProfile {
  const next = { ...profile, updatedAt: new Date().toISOString() }
  profileStore.set(next.id, next)
  return next
}

export function updateStudentProfile(
  name: string,
  update: {
    reviewedGames?: number
    userLevel?: CoachUserLevel
    mistakeTags?: string[]
    trainingThemes?: string[]
    typicalMoves?: StudentProfile['typicalMoves']
  }
): StudentProfile {
  const profile = getStudentProfile(name)
  const counts = new Map(profile.commonMistakes.map((item) => [item.tag, item.count]))
  for (const tag of update.mistakeTags ?? []) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }

  const themes = new Set([...profile.trainingThemes, ...(update.trainingThemes ?? [])])
  const typicalMoves = [...(update.typicalMoves ?? []), ...profile.typicalMoves]
    .sort((a, b) => b.lossWinrate - a.lossWinrate)
    .slice(0, 12)

  return saveStudentProfile({
    ...profile,
    userLevel: update.userLevel ?? profile.userLevel,
    gamesReviewed: profile.gamesReviewed + (update.reviewedGames ?? 0),
    commonMistakes: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    trainingThemes: [...themes].slice(0, 10),
    typicalMoves
  })
}
