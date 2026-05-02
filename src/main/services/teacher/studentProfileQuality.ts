import type { AnalysisConfidence, StudentProfile } from '@main/lib/types'

export interface ProfileWeaknessQuality {
  tag: string
  count: number
  avgLossWinrate: number
  avgLossScore: number
  confidence: AnalysisConfidence
  evidenceMoves: Array<{ gameId: string; moveNumber: number; lossWinrate: number; lossScore: number }>
  recommendation: string
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function confidenceFor(count: number, avgLossScore: number, gamesReviewed: number): AnalysisConfidence {
  if (count >= 5 && gamesReviewed >= 5 && avgLossScore >= 2) return 'high'
  if (count >= 3 || avgLossScore >= 3) return 'medium'
  return 'low'
}

function recommendationFor(tag: string, confidence: AnalysisConfidence): string {
  if (confidence === 'low') return `“${tag}” 目前只是观察信号，不要当成长期弱点。`
  if (/官子|先手|后手|逆收/.test(tag)) return '把每盘最后 60 手按目差损失排序，单独训练先后手判断。'
  if (/死活|眼|气|杀棋|对杀/.test(tag)) return '每天做短时死活，复盘时先数气和眼位，再看 AI 推荐。'
  if (/手筋|断点|连接|征子|枷/.test(tag)) return '复盘时把候选点按“打吃方向、连接、切断”三类重摆一遍。'
  if (/布局|大场|方向|厚薄/.test(tag)) return '开局阶段先写下全局最大压力点，再比较局部手是否值得。'
  return '保留为训练主题，但继续用更多对局确认。'
}

export function scoreProfileWeaknesses(profile: StudentProfile): ProfileWeaknessQuality[] {
  return profile.commonMistakes
    .map((mistake) => {
      const evidenceMoves = profile.typicalMoves
        .filter((move) => move.label.includes(mistake.tag) || mistake.tag.includes(move.label))
        .slice(0, 5)
      const avgLossWinrate = evidenceMoves.length
        ? evidenceMoves.reduce((sum, move) => sum + move.lossWinrate, 0) / evidenceMoves.length
        : 0
      const avgLossScore = evidenceMoves.length
        ? evidenceMoves.reduce((sum, move) => sum + move.lossScore, 0) / evidenceMoves.length
        : 0
      const confidence = confidenceFor(mistake.count, avgLossScore, profile.gamesReviewed)
      return {
        tag: mistake.tag,
        count: mistake.count,
        avgLossWinrate: round(avgLossWinrate, 2),
        avgLossScore: round(avgLossScore, 2),
        confidence,
        evidenceMoves,
        recommendation: recommendationFor(mistake.tag, confidence)
      }
    })
    .sort((a, b) =>
      (b.confidence === 'high' ? 3 : b.confidence === 'medium' ? 2 : 1) -
        (a.confidence === 'high' ? 3 : a.confidence === 'medium' ? 2 : 1) ||
      b.count - a.count ||
      b.avgLossScore - a.avgLossScore
    )
    .slice(0, 8)
}

export function summarizeProfileQualityForPrompt(profile: StudentProfile | null | undefined): string {
  if (!profile) return '无学生画像，不能臆造长期弱点。'
  const scored = scoreProfileWeaknesses(profile)
  if (!scored.length) return '样本不足，只能基于当前局面讲解。'
  return scored
    .slice(0, 4)
    .map((item) => `${item.tag}:${item.confidence}, ${item.count}次, 平均目差损失${item.avgLossScore}`)
    .join('；')
}

export function shouldPromoteWeakness(input: { count: number; gamesReviewed: number; avgLossScore: number; lastSeenDaysAgo?: number }): boolean {
  if ((input.lastSeenDaysAgo ?? 0) > 120) return false
  if (input.gamesReviewed < 3) return false
  return input.count >= 3 || input.avgLossScore >= 3.5
}
