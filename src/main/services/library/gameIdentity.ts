import { createHash } from 'node:crypto'

export interface GameIdentityInput {
  sgfText?: string
  source?: string
  sourceGameId?: string
  blackName?: string
  whiteName?: string
  date?: string
  result?: string
  moveCount?: number
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function sgfHash(sgfText: string): string {
  return createHash('sha256').update(sgfText.replace(/\r\n/g, '\n').trim(), 'utf8').digest('hex')
}

export function makeGameDedupeKey(input: GameIdentityInput): string {
  if (input.source && input.sourceGameId) {
    return `${normalize(input.source)}:${normalize(input.sourceGameId)}`
  }
  if (input.sgfText) {
    return `sgf:${sgfHash(input.sgfText)}`
  }
  return [
    'fuzzy',
    normalize(input.blackName),
    normalize(input.whiteName),
    normalize(input.date),
    normalize(input.result),
    String(input.moveCount ?? '')
  ].join(':')
}

export function isLikelySameGame(a: GameIdentityInput, b: GameIdentityInput): boolean {
  if (a.source && b.source && a.source === b.source && a.sourceGameId && a.sourceGameId === b.sourceGameId) {
    return true
  }
  if (a.sgfText && b.sgfText && sgfHash(a.sgfText) === sgfHash(b.sgfText)) {
    return true
  }
  const samePlayers = normalize(a.blackName) === normalize(b.blackName) && normalize(a.whiteName) === normalize(b.whiteName)
  const sameMeta = normalize(a.date) === normalize(b.date) && normalize(a.result) === normalize(b.result)
  const sameMoves = (a.moveCount ?? -1) === (b.moveCount ?? -2)
  return samePlayers && sameMeta && sameMoves
}
