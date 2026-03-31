import Store from 'electron-store'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, LibraryGame } from './types'

export const appHome = join(app.getPath('home'), '.katasensei')
export const libraryDir = join(appHome, 'library')
export const reviewsDir = join(appHome, 'reviews')
export const cacheDir = join(appHome, 'cache')

for (const dir of [appHome, libraryDir, reviewsDir, cacheDir]) {
  mkdirSync(dir, { recursive: true })
}

const defaults: AppSettings = {
  katagoBin: '',
  katagoConfig: '',
  katagoModel: '',
  pythonBin: 'python3',
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: '',
  llmModel: 'gpt-5-mini',
  reviewLanguage: 'zh-CN',
  defaultPlayerName: ''
}

export const settingsStore = new Store<AppSettings>({
  name: 'settings',
  cwd: appHome,
  defaults
})

export const libraryStore = new Store<{ games: LibraryGame[] }>({
  name: 'library',
  cwd: appHome,
  defaults: { games: [] }
})

export function getSettings(): AppSettings {
  return { ...defaults, ...settingsStore.store }
}

export function setSettings(next: Partial<AppSettings>): AppSettings {
  settingsStore.set(next)
  return getSettings()
}

export function getGames(): LibraryGame[] {
  return [...libraryStore.get('games', [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function upsertGames(games: LibraryGame[]): LibraryGame[] {
  const byId = new Map(getGames().map((game) => [game.id, game]))
  for (const game of games) {
    byId.set(game.id, game)
  }
  const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  libraryStore.set('games', merged)
  return merged
}

export function findGame(gameId: string): LibraryGame | undefined {
  return getGames().find((game) => game.id === gameId)
}
