import Store from 'electron-store'
import { app, safeStorage } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, LibraryGame } from './types'

export const appHome = join(app.getPath('home'), '.katasensei')
export const libraryDir = join(appHome, 'library')
export const reviewsDir = join(appHome, 'reviews')
export const cacheDir = join(appHome, 'cache')
export const reportsDir = join(appHome, 'teacher-reports')

for (const dir of [appHome, libraryDir, reviewsDir, cacheDir, reportsDir]) {
  mkdirSync(dir, { recursive: true })
}

const defaults: AppSettings = {
  katagoBin: '',
  katagoConfig: '',
  katagoModel: '',
  katagoModelPreset: 'official-b18-recommended',
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

type SecretValue =
  | { mode: 'safeStorage'; value: string }
  | { mode: 'plain'; value: string }

export const secretStore = new Store<{ llmApiKey?: SecretValue }>({
  name: 'secrets',
  cwd: appHome,
  defaults: {}
})

export const libraryStore = new Store<{ games: LibraryGame[] }>({
  name: 'library',
  cwd: appHome,
  defaults: { games: [] }
})

export const profileStore = new Store<Record<string, unknown>>({
  name: 'student-profiles',
  cwd: appHome,
  defaults: {}
})

function encryptSecret(value: string): SecretValue {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      mode: 'safeStorage',
      value: safeStorage.encryptString(value).toString('base64')
    }
  }
  return { mode: 'plain', value }
}

function decryptSecret(secret?: SecretValue): string {
  if (!secret) {
    return ''
  }
  try {
    if (secret.mode === 'safeStorage') {
      return safeStorage.decryptString(Buffer.from(secret.value, 'base64'))
    }
    return secret.value
  } catch {
    return ''
  }
}

export function hasLlmApiKey(): boolean {
  return decryptSecret(secretStore.get('llmApiKey')).trim().length > 0
}

function saveLlmApiKey(value: string): void {
  const trimmed = value.trim()
  if (trimmed) {
    secretStore.set('llmApiKey', encryptSecret(trimmed))
  }
}

function migratePlaintextApiKey(settings: AppSettings): AppSettings {
  if (settings.llmApiKey.trim()) {
    saveLlmApiKey(settings.llmApiKey)
    settingsStore.set('llmApiKey', '')
    return { ...settings, llmApiKey: '' }
  }
  return settings
}

export function getSettings(): AppSettings {
  const persisted = migratePlaintextApiKey({ ...defaults, ...settingsStore.store })
  return { ...persisted, llmApiKey: decryptSecret(secretStore.get('llmApiKey')) }
}

export function setSettings(next: Partial<AppSettings>): AppSettings {
  if (typeof next.llmApiKey === 'string') {
    saveLlmApiKey(next.llmApiKey)
  }
  const { llmApiKey: _llmApiKey, ...safeNext } = next
  settingsStore.set(safeNext)
  return getSettings()
}

export function replaceSettings(next: AppSettings): AppSettings {
  if (next.llmApiKey.trim()) {
    saveLlmApiKey(next.llmApiKey)
  }
  settingsStore.store = { ...next, llmApiKey: '' }
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
