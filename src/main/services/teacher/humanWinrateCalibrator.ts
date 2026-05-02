import type { CoachUserLevel, HumanWinrateCalibration } from '@main/lib/types'

interface CalibrateInput {
  aiWinrate?: number
  scoreLead: number
  moveNumber: number
  userLevel: CoachUserLevel
  boardSize?: number
}

const LEVEL_SCALE: Record<CoachUserLevel, number> = {
  beginner: 0.34,
  intermediate: 0.46,
  advanced: 0.62,
  dan: 0.78
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value))
}

function phaseVolatility(moveNumber: number): number {
  if (moveNumber <= 50) return 0.85
  if (moveNumber <= 160) return 1.15
  return 0.95
}

function confidenceFor(input: CalibrateInput): HumanWinrateCalibration['confidence'] {
  if (input.boardSize && input.boardSize !== 19) return 'low'
  if (Math.abs(input.scoreLead) >= 20) return 'medium'
  if (input.moveNumber > 0 && Number.isFinite(input.scoreLead)) return 'medium'
  return 'low'
}

export function calibrateHumanWinrate(input: CalibrateInput): HumanWinrateCalibration {
  const levelScale = LEVEL_SCALE[input.userLevel] ?? LEVEL_SCALE.intermediate
  const volatility = phaseVolatility(input.moveNumber)
  const normalized = input.scoreLead * levelScale / (8.5 * volatility)
  const estimated = clamp(sigmoid(normalized) * 100, 1, 99)
  const confidence = confidenceFor(input)
  const explanation = [
    `AI winrate is ${typeof input.aiWinrate === 'number' ? `${input.aiWinrate.toFixed(1)}%` : 'not provided'}, but teaching should be anchored on scoreLead=${input.scoreLead.toFixed(1)} for ${input.userLevel}.`,
    input.userLevel === 'beginner' || input.userLevel === 'intermediate'
      ? 'For this level, prefer score loss, shape purpose, and one executable next-game reminder over tiny winrate changes.'
      : 'For stronger students, winrate, score, and candidate-spread details can be shown together.'
  ].join(' ')
  return {
    aiWinrate: input.aiWinrate,
    humanWinrateEstimate: Math.round(estimated * 10) / 10,
    scoreLead: input.scoreLead,
    level: input.userLevel,
    confidence,
    explanation
  }
}

export function humanizeLossForTeaching(input: {
  winrateLoss: number
  scoreLoss: number
  userLevel: CoachUserLevel
}): string {
  const score = Math.round(input.scoreLoss * 10) / 10
  const winrate = Math.round(input.winrateLoss * 10) / 10
  if (input.userLevel === 'beginner') {
    if (score < 1.5 && winrate < 3) return '损失很小，重点是理解方向，不要把它当成大错。'
    return `这手主要可以理解为大约 ${score} 目的训练点，先别只盯胜率。`
  }
  if (input.userLevel === 'intermediate') {
    return `这手约亏 ${score} 目 / ${winrate}% 胜率；讲解应先说判断顺序，再说数字。`
  }
  return `这手约亏 ${score} 目 / ${winrate}% 胜率；可以进一步比较候选间距、PV 和 ownership。`
}
