import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { libraryDir } from '@main/lib/store'
import type { LibraryGame } from '@main/lib/types'

function extract(tag: string, content: string): string {
  const match = content.match(new RegExp(`${tag}\\[([^\\]]*)\\]`))
  return match?.[1]?.trim() ?? ''
}

function sgfTitle(content: string, fileName: string): string {
  return extract('GN', content) || [extract('PB', content), 'vs', extract('PW', content)].filter(Boolean).join(' ') || fileName
}

function sanitizeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
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

export function saveFoxSgf(content: string, title: string, sourceLabel: string): LibraryGame {
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 12)
  const targetDir = join(libraryDir, 'fox')
  mkdirSync(targetDir, { recursive: true })
  const targetPath = join(targetDir, `${sanitizeName(title) || 'fox-game'}-${hash}.sgf`)
  writeFileSync(targetPath, content, 'utf8')
  return {
    id: hash,
    title: sgfTitle(content, title),
    event: extract('EV', content),
    black: extract('PB', content),
    white: extract('PW', content),
    result: extract('RE', content),
    date: extract('DT', content),
    source: 'fox',
    sourceLabel,
    filePath: targetPath,
    createdAt: new Date().toISOString()
  }
}
