import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { JosekiNextMove, JosekiPatternCard } from './josekiRecognizer'

interface BundledJosekiSource {
  id: string
  dir: string
  displayName: string
  license: string
  sourceQuality: string
  url: string
  familyByFile?: Record<string, string>
}

interface SgfMove {
  color: 'B' | 'W'
  sgf: string
  gtp: string
  relative: string
  comment?: string
}

interface ParsedNode {
  move?: SgfMove
  comment?: string
}

interface CardAccumulator {
  id: string
  source: BundledJosekiSource
  family: string
  file: string
  prefixMoves: SgfMove[]
  nextMoves: Map<string, JosekiNextMove>
  pathCount: number
}

const BOARD_SIZE = 19
const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

const BUNDLED_SOURCES: BundledJosekiSource[] = [
  {
    id: 'pachi-joseki-gpl2',
    dir: 'pachi',
    displayName: 'Pachi joseki SGF set',
    license: 'GPL-2.0-only',
    sourceQuality: 'bundled-open-source-gpl',
    url: 'https://github.com/pasky/pachi/tree/master/joseki',
    familyByFile: {
      'joseki_33.sgf': 'Pachi san-san 3-3 joseki',
      'joseki_34.sgf': 'Pachi komoku 3-4 joseki',
      'joseki_44.sgf': 'Pachi hoshi 4-4 joseki',
      'joseki_54.sgf': 'Pachi takamoku 5-4 joseki'
    }
  },
  {
    id: 'josekle-mit-dictionary',
    dir: 'josekle',
    displayName: 'Josekle dictionary SGF',
    license: 'MIT',
    sourceQuality: 'bundled-open-source-mit',
    url: 'https://github.com/okonomichiyaki/josekle/tree/master/sgf',
    familyByFile: {
      'dictionary.sgf': 'Josekle joseki explorer dictionary'
    }
  }
]

let cachedRoot = ''
let cachedCards: JosekiPatternCard[] | null = null

function parseSgfValue(input: string, start: number): { value: string; next: number } {
  let i = start
  let value = ''
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\\') {
      if (i + 1 < input.length) value += input[i + 1]
      i += 2
      continue
    }
    if (ch === ']') return { value, next: i + 1 }
    value += ch
    i += 1
  }
  return { value, next: i }
}

function parseNode(input: string, start: number): { node: ParsedNode; next: number } {
  const props: Record<string, string[]> = {}
  let i = start
  while (i < input.length) {
    const ch = input[i]
    if (ch === ';' || ch === '(' || ch === ')') break
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (!/[A-Za-z]/.test(ch)) {
      i += 1
      continue
    }
    let key = ''
    while (i < input.length && /[A-Za-z]/.test(input[i])) {
      key += input[i]
      i += 1
    }
    key = key.toUpperCase()
    const values: string[] = []
    while (i < input.length && input[i] === '[') {
      const parsed = parseSgfValue(input, i + 1)
      values.push(parsed.value)
      i = parsed.next
    }
    if (values.length) props[key] = [...(props[key] ?? []), ...values]
  }

  const comment = props.C?.[0]
  const color = props.B?.length ? 'B' : props.W?.length ? 'W' : undefined
  const raw = color ? props[color]?.[0] : undefined
  const move = color && raw !== undefined ? moveFromSgf(color, raw, comment) : undefined
  return { node: { move, comment }, next: i }
}

function moveFromSgf(color: 'B' | 'W', raw: string, comment?: string): SgfMove | undefined {
  const sgf = raw.trim().toLowerCase()
  if (!sgf || sgf === 'tt' || sgf.length < 2) return undefined
  const x = sgf.charCodeAt(0) - 97
  const yFromTop = sgf.charCodeAt(1) - 97
  if (x < 0 || x >= BOARD_SIZE || yFromTop < 0 || yFromTop >= BOARD_SIZE) return undefined
  const yFromBottom = BOARD_SIZE - 1 - yFromTop
  const gtp = `${GTP_COLUMNS[x]}${BOARD_SIZE - yFromTop}`
  const relative = `${Math.min(x + 1, BOARD_SIZE - x)}-${Math.min(yFromBottom + 1, BOARD_SIZE - yFromBottom)}`
  return { color, sgf, gtp, relative, comment }
}

function uniquePathKey(path: SgfMove[]): string {
  return path.map((move) => `${move.color}${move.sgf}`).join(' ')
}

export function extractMovePathsFromSgf(input: string, maxMoves = 32): SgfMove[][] {
  const paths: SgfMove[][] = []
  const seen = new Set<string>()
  const stack: SgfMove[][] = []
  let current: SgfMove[] = []
  let i = 0

  const remember = () => {
    if (current.length < 2) return
    const clipped = current.slice(0, maxMoves)
    const key = uniquePathKey(clipped)
    if (seen.has(key)) return
    seen.add(key)
    paths.push(clipped)
  }

  while (i < input.length) {
    const ch = input[i]
    if (ch === '(') {
      stack.push(current.slice())
      i += 1
      continue
    }
    if (ch === ')') {
      remember()
      current = stack.pop() ?? []
      i += 1
      continue
    }
    if (ch === ';') {
      const parsed = parseNode(input, i + 1)
      if (parsed.node.move) {
        current = current.concat(parsed.node.move).slice(0, maxMoves)
        remember()
      }
      i = parsed.next
      continue
    }
    i += 1
  }
  remember()
  return paths
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function labelForNextMove(move: SgfMove, source: BundledJosekiSource): string {
  const tags: string[] = []
  if (move.comment?.includes('<dont>') || move.comment?.includes('<don\'t>') || move.comment?.includes('<bad>') || move.comment?.includes('<avoid>')) {
    tags.push('avoid/deviation response')
  }
  if (move.comment?.includes('<later>') || move.comment?.includes('<tenuki>')) tags.push('tenuki follow-up')
  const tag = tags.length ? ` (${tags.join(', ')})` : ''
  return `${source.displayName} branch${tag}`
}

function familyForFile(source: BundledJosekiSource, filename: string, firstMove?: SgfMove): string {
  if (source.familyByFile?.[filename]) return source.familyByFile[filename]
  if (firstMove?.relative) return `${source.displayName} ${firstMove.relative} family`
  return source.displayName
}

function makeAccumulatorId(source: BundledJosekiSource, filename: string, prefix: SgfMove[]): string {
  const prefixKey = prefix.map((move) => `${move.color}${move.relative}`).join('-')
  return `${source.id}:${filename}:${stableHash(prefixKey)}`
}

function buildCardsForFile(source: BundledJosekiSource, filename: string, content: string): JosekiPatternCard[] {
  const paths = extractMovePathsFromSgf(content)
  const byPrefix = new Map<string, CardAccumulator>()

  for (const path of paths) {
    const maxPrefix = Math.min(12, path.length - 1)
    for (let prefixLength = 2; prefixLength <= maxPrefix; prefixLength += 1) {
      const prefix = path.slice(0, prefixLength)
      const next = path[prefixLength]
      if (!next) continue
      const id = makeAccumulatorId(source, filename, prefix)
      const family = familyForFile(source, filename, path[0])
      const entry = byPrefix.get(id) ?? {
        id,
        source,
        family,
        file: filename,
        prefixMoves: prefix,
        nextMoves: new Map<string, JosekiNextMove>(),
        pathCount: 0
      }
      entry.pathCount += 1
      if (!entry.nextMoves.has(next.relative)) {
        entry.nextMoves.set(next.relative, {
          relativeMove: next.relative,
          label: labelForNextMove(next, source),
          condition: next.comment?.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined
        })
      }
      byPrefix.set(id, entry)
    }
  }

  return Array.from(byPrefix.values()).map((entry) => {
    const requiredRelativeStones = Array.from(new Set(entry.prefixMoves.map((move) => move.relative)))
    const sequence = entry.prefixMoves.map((move) => `${move.color}${move.relative}`).join(' → ')
    const commonNextMoves = Array.from(entry.nextMoves.values()).slice(0, 10)
    return {
      id: entry.id,
      name: `${entry.family}: ${sequence}`,
      family: entry.family,
      boardSize: BOARD_SIZE,
      sourceRefs: [entry.source.id],
      sourceQuality: entry.source.sourceQuality,
      requiredRelativeStones,
      sequenceSignals: [entry.family, basename(entry.file, '.sgf'), ...requiredRelativeStones],
      variationCount: Math.max(commonNextMoves.length, entry.pathCount),
      commonNextMoves,
      variations: commonNextMoves.map((move) => `${sequence} → ${move.relativeMove}`),
      recognition: `Bundled SGF database match from ${entry.source.displayName}. Treat this as a joseki-tree hypothesis and verify the final recommendation against KataGo for the current whole-board position.`,
      wrongThinking: 'Do not memorize this branch mechanically; joseki choice depends on ladder status, neighboring stones, sente value, and whole-board direction.',
      correctThinking: 'Identify the corner family, compare the SGF branch candidates with KataGo candidates, then explain whether the player should continue the local sequence, tenuki, simplify, or choose a different direction.',
      drillPrompt: 'Cover the next move and ask: which branch keeps the right direction in this whole-board position, and what outside stones would change the answer?'
    }
  })
}

function readSgfFiles(sourceRoot: string): Array<{ filename: string; content: string }> {
  if (!existsSync(sourceRoot)) return []
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sgf'))
    .map((entry) => ({ filename: entry.name, content: readFileSync(join(sourceRoot, entry.name), 'utf8') }))
}

export function loadBundledJosekiSgfCards(root: string): JosekiPatternCard[] {
  if (cachedCards && cachedRoot === root) return cachedCards
  const cards: JosekiPatternCard[] = []
  for (const source of BUNDLED_SOURCES) {
    const sourceRoot = join(root, 'knowledge', 'joseki-sgf', source.dir)
    for (const file of readSgfFiles(sourceRoot)) {
      cards.push(...buildCardsForFile(source, file.filename, file.content))
    }
  }
  const seen = new Set<string>()
  cachedCards = cards.filter((card) => {
    if (seen.has(card.id)) return false
    seen.add(card.id)
    return true
  })
  cachedRoot = root
  return cachedCards
}

export function summarizeBundledJosekiSgfCards(root: string): { sourceCount: number; cardCount: number; sources: string[] } {
  const cards = loadBundledJosekiSgfCards(root)
  const sources = Array.from(new Set(cards.flatMap((card) => card.sourceRefs ?? []))).sort()
  return { sourceCount: sources.length, cardCount: cards.length, sources }
}
