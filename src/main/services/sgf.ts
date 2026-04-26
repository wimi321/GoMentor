import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { libraryDir } from '@main/lib/store'
import type { GameMove, GameRecord, LibraryGame, StoneColor } from '@main/lib/types'

const GTP_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

function extract(tag: string, content: string): string {
  const match = content.match(new RegExp(`${tag}\\[([^\\]]*)\\]`))
  return match?.[1]?.trim() ?? ''
}

function sgfTitle(content: string, fileName: string): string {
  return extract('GN', content) || [extract('PB', content), 'vs', extract('PW', content)].filter(Boolean).join(' ') || fileName
}

function boardSize(content: string): number {
  const parsed = Number.parseInt(extract('SZ', content) || '19', 10)
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 19
}

function pointToMove(point: string, size: number): Pick<GameMove, 'point' | 'row' | 'col' | 'gtp' | 'pass'> {
  if (!point || point.length < 2) {
    return { point, row: null, col: null, gtp: 'pass', pass: true }
  }
  const col = point.charCodeAt(0) - 97
  const row = point.charCodeAt(1) - 97
  if (col < 0 || row < 0 || col >= size || row >= size) {
    return { point, row: null, col: null, gtp: 'pass', pass: true }
  }
  return {
    point,
    row,
    col,
    gtp: `${GTP_LETTERS[col] ?? '?'}${size - row}`,
    pass: false
  }
}

function parseMoves(content: string, size: number): GameMove[] {
  const moves: GameMove[] = []
  let index = 0

  function skipWhitespace(): void {
    while (/\s/.test(content[index] ?? '')) {
      index += 1
    }
  }

  function readIdentifier(): string {
    const propStart = index
    while (index < content.length && /[A-Za-z]/.test(content[index])) {
      index += 1
    }
    return content.slice(propStart, index).toUpperCase()
  }

  function readValue(): string {
    let value = ''
    let escaped = false
    if (content[index] !== '[') {
      return value
    }
    index += 1
    while (index < content.length) {
      const valueChar = content[index]
      index += 1
      if (escaped) {
        value += valueChar
        escaped = false
        continue
      }
      if (valueChar === '\\') {
        escaped = true
        continue
      }
      if (valueChar === ']') {
        break
      }
      value += valueChar
    }
    return value
  }

  function parseNode(): void {
    while (index < content.length) {
      skipWhitespace()
      if (!/[A-Za-z]/.test(content[index] ?? '')) {
        break
      }
      const property = readIdentifier()
      skipWhitespace()
      let firstValue = ''
      let hasValue = false
      while (content[index] === '[') {
        const value = readValue()
        if (!hasValue) {
          firstValue = value
          hasValue = true
        }
        skipWhitespace()
      }
      if ((property === 'B' || property === 'W') && hasValue) {
        const color = property as StoneColor
        const point = firstValue.toLowerCase()
        moves.push({
          moveNumber: moves.length + 1,
          color,
          ...pointToMove(point, size)
        })
      }
    }
  }

  function parseSequence(): void {
    while (index < content.length) {
      skipWhitespace()
      if (content[index] !== ';') {
        break
      }
      index += 1
      parseNode()
    }
  }

  function skipGameTree(): void {
    let depth = 0
    let inValue = false
    let escaped = false
    while (index < content.length) {
      const char = content[index]
      index += 1
      if (inValue) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === ']') {
          inValue = false
        }
        continue
      }
      if (char === '[') {
        inValue = true
        continue
      }
      if (char === '(') {
        depth += 1
      } else if (char === ')') {
        depth -= 1
        if (depth <= 0) {
          break
        }
      }
    }
  }

  function parseGameTree(): void {
    skipWhitespace()
    if (content[index] !== '(') {
      return
    }
    index += 1
    parseSequence()

    let followedFirstChild = false
    while (index < content.length) {
      skipWhitespace()
      if (content[index] === '(') {
        if (!followedFirstChild) {
          followedFirstChild = true
          parseGameTree()
        } else {
          skipGameTree()
        }
        continue
      }
      if (content[index] === ')') {
        index += 1
      }
      break
    }
  }

  parseGameTree()
  return moves
}

function sanitizeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

export function foxSgfPathForGameId(gameId: string): string {
  const targetDir = join(libraryDir, 'fox')
  return join(targetDir, `${sanitizeName(gameId) || 'fox-game'}.sgf`)
}

export function importSgfFile(filePath: string, source: LibraryGame['source'], sourceLabel: string): LibraryGame {
  const content = readFileSync(filePath, 'utf8')
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 12)
  const title = sgfTitle(content, basename(filePath, extname(filePath)))
  const storedName = `${sanitizeName(title) || 'game'}-${hash}.sgf`
  const targetDir = join(libraryDir, source)
  mkdirSync(targetDir, { recursive: true })
  const targetPath = join(targetDir, storedName)
  if (filePath !== targetPath) {
    copyFileSync(filePath, targetPath)
  }
  const createdAt = new Date().toISOString()
  return {
    id: hash,
    title,
    event: extract('EV', content),
    black: extract('PB', content),
    white: extract('PW', content),
    result: extract('RE', content),
    date: extract('DT', content),
    source,
    sourceLabel,
    filePath: targetPath,
    createdAt
  }
}

export function saveFoxSgf(content: string, title: string, sourceLabel: string, baseGame?: Partial<LibraryGame>): LibraryGame {
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 12)
  const id = baseGame?.id || hash
  const targetDir = join(libraryDir, 'fox')
  mkdirSync(targetDir, { recursive: true })
  const targetPath = baseGame?.id
    ? foxSgfPathForGameId(id)
    : join(targetDir, `${sanitizeName(title) || 'fox-game'}-${hash}.sgf`)
  writeFileSync(targetPath, content, 'utf8')
  return {
    id,
    title: sgfTitle(content, title),
    event: extract('EV', content),
    black: extract('PB', content),
    white: extract('PW', content),
    result: extract('RE', content),
    date: extract('DT', content),
    source: 'fox',
    sourceLabel,
    filePath: targetPath,
    createdAt: baseGame?.createdAt || new Date().toISOString(),
    downloadStatus: 'downloaded',
    remoteId: baseGame?.remoteId,
    remoteUid: baseGame?.remoteUid,
    moveCount: baseGame?.moveCount
  }
}

export function readGameRecord(game: LibraryGame): GameRecord {
  const content = readFileSync(game.filePath, 'utf8')
  const size = boardSize(content)
  return {
    game,
    boardSize: size,
    komi: extract('KM', content) || '0',
    handicap: extract('HA', content) || '0',
    moves: parseMoves(content, size)
  }
}
