import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { basename, join } from 'node:path'
import { appHome } from '@main/lib/store'
import type { AppSettings, KataGoModelPreset, KataGoModelPresetId } from '@main/lib/types'

export const DEFAULT_KATAGO_MODEL_PRESET: KataGoModelPresetId = 'official-b18-recommended'

const OFFICIAL_NETWORKS_URL = 'https://katagotraining.org/networks/'
const OFFICIAL_NETWORK_CDN = 'https://media.katagotraining.org/uploaded/networks/models/kata1/'

function officialNetworkUrl(fileName: string): string {
  return `${OFFICIAL_NETWORK_CDN}${fileName}`
}

export const KATAGO_MODEL_PRESETS: KataGoModelPreset[] = [
  {
    id: 'official-b18-recommended',
    label: 'b18 README 日常推荐',
    badge: '日常推荐',
    group: '18b 官方推荐 / 日常教学',
    blockSize: 'b18',
    speedTier: 'balanced',
    sizeHint: '通用',
    description: 'KataGo README 推荐的一般首选：强、准、机器压力适中，适合日常教学和自动胜率图。',
    networkName: 'kata1-b18c384nbt-s9996604416-d4316597426',
    fileName: 'kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-b18c384nbt-s9996604416-d4316597426.bin.gz'),
    recommended: true
  },
  {
    id: 'official-b18-stable',
    label: 'b18 稳定备选',
    badge: '轻快',
    group: '18b 官方推荐 / 日常教学',
    blockSize: 'b18',
    speedTier: 'fast',
    sizeHint: '通用',
    description: '同为 b18c384nbt 的高分备选权重，适合希望保持轻快分析速度的机器。',
    networkName: 'kata1-b18c384nbt-s9967423488-d4308703317',
    fileName: 'kata1-b18c384nbt-s9967423488-d4308703317.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-b18c384nbt-s9967423488-d4308703317.bin.gz'),
    recommended: false
  },
  {
    id: 'official-b20-strong',
    label: 'b20 强力轻量',
    badge: '20b 强',
    group: '20b 快速分析 / 旧机友好',
    blockSize: 'b20',
    speedTier: 'balanced',
    sizeHint: '较快',
    description: 'b20c256x2 中较高评分的一档，适合 CPU 或入门 GPU 做快速胜率图和日常复盘。',
    networkName: 'kata1-b20c256x2-s5303129600-d1228401921',
    fileName: 'kata1-b20c256x2-s5303129600-d1228401921.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-b20c256x2-s5303129600-d1228401921.bin.gz'),
    recommended: false
  },
  {
    id: 'official-b20-balanced',
    label: 'b20 平衡备选',
    badge: '20b 快',
    group: '20b 快速分析 / 旧机友好',
    blockSize: 'b20',
    speedTier: 'fast',
    sizeHint: '较快',
    description: 'b20c256x2 的轻量备选，更偏速度和兼容性，适合先把整盘胜率曲线快速跑出来。',
    networkName: 'kata1-b20c256x2-s5055114240-d1149032340',
    fileName: 'kata1-b20c256x2-s5055114240-d1149032340.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-b20c256x2-s5055114240-d1149032340.bin.gz'),
    recommended: false
  },
  {
    id: 'official-b28-strong',
    label: 'zhizi b28 官网最强',
    badge: '官网最强',
    group: '官网推荐 zhizi 模型',
    blockSize: 'b28',
    speedTier: 'strong',
    sizeHint: '较慢',
    description: 'katagotraining.org 当前 Strongest confidently-rated network：zhizi b28，更适合关键局面精读，速度会慢一些。',
    networkName: 'kata1-zhizi-b28c512nbt-muonfd2',
    fileName: 'kata1-zhizi-b28c512nbt-muonfd2.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-zhizi-b28c512nbt-muonfd2.bin.gz'),
    recommended: false
  },
  {
    id: 'official-b28-latest',
    label: 'b28 最新训练线',
    badge: '28b 新',
    group: '28b 高强度精读',
    blockSize: 'b28',
    speedTier: 'strong',
    sizeHint: '较慢',
    description: '官方网络列表中较新的 b28c512nbt 训练线，适合高配置机器做更深的局面判断。',
    networkName: 'kata1-b28c512nbt-s12763923712-d5805955894',
    fileName: 'kata1-b28c512nbt-s12763923712-d5805955894.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-b28c512nbt-s12763923712-d5805955894.bin.gz'),
    recommended: false
  },
  {
    id: 'official-b40-latest',
    label: 'zhizi b40 官网最新',
    badge: '官网最新',
    group: '官网推荐 zhizi 模型',
    blockSize: 'b40',
    speedTier: 'maximum',
    sizeHint: '很慢',
    description: 'katagotraining.org 当前 Latest network：zhizi b40，更重、更强，适合高端 GPU 对关键局面做深度精读。',
    networkName: 'kata1-zhizi-b40c768nbt-fdx6c',
    fileName: 'kata1-zhizi-b40c768nbt-fdx6c.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-zhizi-b40c768nbt-fdx6c.bin.gz'),
    recommended: false
  },
  {
    id: 'official-b40-classic',
    label: 'b40 经典 c256',
    badge: '40b 稳',
    group: '40b 旗舰 / 高配机器',
    blockSize: 'b40',
    speedTier: 'maximum',
    sizeHint: '很慢',
    description: '经典 b40c256 高强度权重，适合需要 40b 级别判断但希望资源压力低于最新旗舰的场景。',
    networkName: 'kata1-b40c256-s12860905472-d3197353276',
    fileName: 'kata1-b40c256-s12860905472-d3197353276.bin.gz',
    sourceUrl: OFFICIAL_NETWORKS_URL,
    downloadUrl: officialNetworkUrl('kata1-b40c256-s12860905472-d3197353276.bin.gz'),
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
    process.env.GOMENTOR_KATAGO_BIN ?? '',
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
  const blockToken = preset.blockSize || preset.networkName.match(/b\d+/)?.[0] || ''
  const presetPatterns = [
    new RegExp(`^${escapeRegExp(preset.networkName)}\\.bin\\.gz$`),
    blockToken ? new RegExp(`^kata1-.*${escapeRegExp(blockToken)}.*\\.bin\\.gz$`) : null
  ].filter((pattern): pattern is RegExp => Boolean(pattern))
  const selectedPresetFiles = directories.map((directory) => join(directory, preset.fileName))
  const matchingPresetFiles = directories.flatMap((directory) => presetPatterns.flatMap((pattern) => globModelFiles(directory, pattern)))
  const compatibilityFiles = [
    settings?.katagoModel ?? '',
    ...directories.map((directory) => join(directory, 'latest-kata1.bin.gz')),
    ...directories.flatMap((directory) => globModelFiles(directory, /^kata1-.*b40.*\.bin\.gz$/)),
    ...directories.flatMap((directory) => globModelFiles(directory, /^kata1-.*b28.*\.bin\.gz$/)),
    ...directories.flatMap((directory) => globModelFiles(directory, /^kata1-.*b20.*\.bin\.gz$/)),
    ...directories.flatMap((directory) => globModelFiles(directory, /^kata1-b18c384nbt.*\.bin\.gz$/))
  ]
  return [...selectedPresetFiles, ...matchingPresetFiles, ...compatibilityFiles]
}

function saneInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !value) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.round(value)))
}

function defaultAnalysisThreads(): number {
  return Math.max(1, Math.min(4, os.cpus().length - 2))
}

function ensureAnalysisConfig(settings?: AppSettings): string {
  const configDir = join(appHome, 'katago', 'configs')
  mkdirSync(configDir, { recursive: true })
  const logDir = join(appHome, 'katago', 'logs')
  mkdirSync(logDir, { recursive: true })
  const configPath = join(configDir, 'analysis_builtin.cfg')
  const analysisThreads = saneInteger(settings?.katagoAnalysisThreads, defaultAnalysisThreads(), 1, 16)
  const searchThreadsPerAnalysisThread = saneInteger(settings?.katagoSearchThreadsPerAnalysisThread, 1, 1, 16)
  const maxBatchSize = saneInteger(settings?.katagoMaxBatchSize, 32, 1, 256)
  const cacheSizePowerOfTwo = saneInteger(settings?.katagoCacheSizePowerOfTwo, 20, 16, 28)
  writeFileSync(
    configPath,
    [
      `logDir = ${logDir}`,
      'logAllRequests = false',
      'logSearchInfo = false',
      'analysisPVLen = 12',
      'reportAnalysisWinratesAs = BLACK',
      `numAnalysisThreads = ${analysisThreads}`,
      `numSearchThreadsPerAnalysisThread = ${searchThreadsPerAnalysisThread}`,
      `nnMaxBatchSize = ${maxBatchSize}`,
      `nnCacheSizePowerOfTwo = ${cacheSizePowerOfTwo}`,
      ''
    ].join('\n'),
    'utf8'
  )
  return configPath
}

export function resolveKataGoRuntime(settings?: AppSettings): KataGoRuntime {
  const modelPreset = getKataGoModelPreset(settings?.katagoModelPreset)
  const katagoBin = firstExisting([...binaryCandidates(), settings?.katagoBin ?? ''])
  const katagoConfig = ensureAnalysisConfig(settings)
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
