import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { basename, join } from 'node:path'
import { appHome } from '@main/lib/store'
import type { AppSettings, KataGoModelPreset, KataGoModelPresetId } from '@main/lib/types'

export const DEFAULT_KATAGO_MODEL_PRESET: KataGoModelPresetId = 'official-b18-recommended'

export const KATAGO_MODEL_PRESETS: KataGoModelPreset[] = [
  {
    id: 'official-b18-recommended',
    label: '推荐通用 b18',
    badge: '最推荐',
    description: 'KataGo README 推荐的一般首选：强、准、机器压力适中，适合日常教学和自动胜率图。',
    networkName: 'kata1-b18c384nbt-s9996604416-d4316597426',
    fileName: 'kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
    sourceUrl: 'https://katagotraining.org/networks/',
    recommended: true
  },
  {
    id: 'official-b28-strong',
    label: '强力精读 b28',
    badge: '官网强力',
    description: 'katagotraining.org 当前 strongest confidently-rated 档位，更适合关键局面精读，速度会慢一些。',
    networkName: 'kata1-zhizi-b28c512nbt-muonfd2',
    fileName: 'kata1-zhizi-b28c512nbt-muonfd2.bin.gz',
    sourceUrl: 'https://katagotraining.org/networks/',
    recommended: false
  }
]

export interface KataGoRuntime {
  katagoBin: string
  katagoConfig: string
  katagoModel: string
  modelPreset: KataGoModelPreset
  ready: boolean
  status: string
  notes: string[]
}

function platformBinaryName(): string {
  return process.platform === 'win32' ? 'katago.exe' : 'katago'
}

function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

function unique(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))]
}

function firstExisting(paths: string[]): string {
  return unique(paths).find((path) => existsSync(path)) ?? ''
}

function globModelFiles(directory: string, pattern: RegExp): string[] {
  if (!existsSync(directory)) {
    return []
  }
  try {
    return readdirSync(directory)
      .filter((file) => pattern.test(file))
      .sort()
      .reverse()
      .map((file) => join(directory, file))
  } catch {
    return []
  }
}

export function getKataGoModelPreset(id?: string): KataGoModelPreset {
  return KATAGO_MODEL_PRESETS.find((preset) => preset.id === id) ?? KATAGO_MODEL_PRESETS[0]
}

function resourceRoots(): string[] {
  const roots = [
    join(process.cwd(), 'data', 'katago'),
    join(appHome, 'katago')
  ]
  if (process.resourcesPath) {
    roots.push(join(process.resourcesPath, 'data', 'katago'), join(process.resourcesPath, 'katago'))
  }
  return unique(roots)
}

function pathKatago(): string {
  try {
    return execFileSync('/usr/bin/which', ['katago'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function binaryCandidates(): string[] {
  const file = platformBinaryName()
  const roots = resourceRoots()
  return [
    process.env.KATASENSEI_KATAGO_BIN ?? '',
    ...roots.flatMap((root) => [
      join(root, 'bin', platformKey(), file),
      join(root, 'bin', process.platform, file),
      join(root, 'bin', file),
      join(root, file)
    ]),
    '/opt/homebrew/bin/katago',
    '/usr/local/bin/katago',
    '/opt/local/bin/katago',
    '/usr/bin/katago',
    pathKatago()
  ]
}

function modelDirectories(): string[] {
  return [
    ...resourceRoots().map((root) => join(root, 'models')),
    join(os.homedir(), '.katago', 'models')
  ]
}

function modelCandidates(preset: KataGoModelPreset, settings?: AppSettings): string[] {
  const directories = modelDirectories()
  const presetPatterns =
    preset.id === 'official-b18-recommended'
      ? [/^kata1-b18c384nbt.*\.bin\.gz$/]
      : [/^kata1-zhizi-b28c512nbt.*\.bin\.gz$/, /^kata1-b28c512nbt.*\.bin\.gz$/]
  const selectedPresetFiles = directories.map((directory) => join(directory, preset.fileName))
  const matchingPresetFiles = directories.flatMap((directory) => presetPatterns.flatMap((pattern) => globModelFiles(directory, pattern)))
  const compatibilityFiles = [
    settings?.katagoModel ?? '',
    ...directories.map((directory) => join(directory, 'latest-kata1.bin.gz')),
    ...directories.flatMap((directory) => globModelFiles(directory, /^kata1-(zhizi-)?b28c512nbt.*\.bin\.gz$/)),
    ...directories.flatMap((directory) => globModelFiles(directory, /^kata1-b18c384nbt.*\.bin\.gz$/))
  ]
  return [...selectedPresetFiles, ...matchingPresetFiles, ...compatibilityFiles]
}

function ensureAnalysisConfig(): string {
  const configDir = join(appHome, 'katago', 'configs')
  mkdirSync(configDir, { recursive: true })
  const logDir = join(appHome, 'katago', 'logs')
  mkdirSync(logDir, { recursive: true })
  const configPath = join(configDir, 'analysis_builtin.cfg')
  const analysisThreads = Math.max(2, Math.min(4, os.cpus().length - 2))
  writeFileSync(
    configPath,
    [
      `logDir = ${logDir}`,
      'logAllRequests = false',
      'logSearchInfo = false',
      'analysisPVLen = 12',
      'reportAnalysisWinratesAs = BLACK',
      `numAnalysisThreads = ${analysisThreads}`,
      'numSearchThreadsPerAnalysisThread = 1',
      'nnMaxBatchSize = 32',
      'nnCacheSizePowerOfTwo = 20',
      ''
    ].join('\n'),
    'utf8'
  )
  return configPath
}

export function resolveKataGoRuntime(settings?: AppSettings): KataGoRuntime {
  const modelPreset = getKataGoModelPreset(settings?.katagoModelPreset)
  const katagoBin = firstExisting([...binaryCandidates(), settings?.katagoBin ?? ''])
  const katagoConfig = ensureAnalysisConfig()
  const katagoModel = firstExisting(modelCandidates(modelPreset, settings))
  const notes: string[] = []

  if (katagoBin) {
    try {
      chmodSync(katagoBin, 0o755)
    } catch {
      // Some system-managed binaries cannot be chmodded; existing executable bits are enough.
    }
    notes.push(`KataGo 引擎: ${basename(katagoBin)}`)
  } else {
    notes.push('未找到内置 KataGo 引擎。')
  }

  const exactPreset = katagoModel ? basename(katagoModel) === modelPreset.fileName : false
  if (katagoModel) {
    notes.push(exactPreset ? `模型: ${modelPreset.label}` : `模型: ${basename(katagoModel)}`)
  } else {
    notes.push(`缺少模型文件: ${modelPreset.fileName}`)
  }

  const ready = Boolean(katagoBin && katagoConfig && katagoModel)
  const modelStatus = exactPreset ? modelPreset.label : '本机兼容模型'
  return {
    katagoBin,
    katagoConfig,
    katagoModel,
    modelPreset,
    ready,
    status: ready ? `${modelStatus} Ready` : 'KataGo Missing',
    notes
  }
}

export function hydrateKataGoSettings(settings: AppSettings): AppSettings {
  const runtime = resolveKataGoRuntime(settings)
  return {
    ...settings,
    katagoModelPreset: runtime.modelPreset.id,
    katagoBin: runtime.katagoBin,
    katagoConfig: runtime.katagoConfig,
    katagoModel: runtime.katagoModel
  }
}
