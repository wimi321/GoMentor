import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Transform, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import { getKataGoModelPreset } from '../katagoRuntime'
import type { KataGoAssetInstallProgress, KataGoAssetInstallRequest, KataGoAssetInstallResult } from '@main/lib/types'

export interface KataGoPlatformAsset {
  binaryPath: string
  sha256?: string
}

export interface KataGoAssetManifest {
  version: number
  defaultModelId: string
  defaultModelFileName: string
  defaultModelDisplayName: string
  modelPath: string
  modelSha256?: string
  supportedPlatforms: Record<string, KataGoPlatformAsset>
  notes?: string[]
}

export interface KataGoAssetStatus {
  platformKey: string
  manifestFound: boolean
  binaryPath: string
  binaryFound: boolean
  binaryExecutable: boolean
  modelPath: string
  modelFound: boolean
  modelDisplayName: string
  ready: boolean
  detail: string
}

function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

function userKatagoRoot(): string | null {
  try {
    return join(app.getPath('userData'), 'katago')
  } catch {
    return null
  }
}

function candidateRoots(): string[] {
  const roots: string[] = []
  const userRoot = userKatagoRoot()
  if (userRoot) {
    roots.push(userRoot)
  }
  if (process.resourcesPath) {
    roots.push(join(process.resourcesPath, 'data', 'katago'))
  }
  roots.push(join(process.cwd(), 'data', 'katago'))
  return [...new Set(roots)]
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function executable(path: string): Promise<boolean> {
  if (process.platform === 'win32') return exists(path)
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function sha256(path: string): Promise<string> {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

function absoluteUrl(value: string): string {
  if (value.startsWith('//')) {
    return `https:${value}`
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  return new URL(value, 'https://katagotraining.org').toString()
}

async function discoverModelDownloadUrl(presetId?: string): Promise<string> {
  const preset = getKataGoModelPreset(presetId)
  if (preset.downloadUrl) {
    return preset.downloadUrl
  }
  if (/\.bin\.gz($|\?)/i.test(preset.sourceUrl)) {
    return preset.sourceUrl
  }
  const fallback = `https://media.katagotraining.org/uploaded/networks/models/kata1/${preset.fileName}`
  try {
    const response = await fetch(preset.sourceUrl, {
      headers: { 'User-Agent': 'GoMentor KataGo asset installer' }
    })
    if (!response.ok) {
      return fallback
    }
    const html = await response.text()
    const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => absoluteUrl(match[1]))
    const exact = links.find((link) => link.includes(preset.fileName))
    if (exact) {
      return exact
    }
    const byNetworkName = links.find((link) => link.includes(preset.networkName) && /\.bin\.gz($|\?)/i.test(link))
    return byNetworkName ?? fallback
  } catch {
    return fallback
  }
}

async function firstExisting(paths: string[]): Promise<string> {
  for (const path of paths) {
    if (await exists(path)) {
      return path
    }
  }
  return ''
}

function progressPercent(receivedBytes: number, totalBytes?: number): number | undefined {
  if (!totalBytes || totalBytes <= 0) {
    return undefined
  }
  return Math.max(0, Math.min(100, Math.round((receivedBytes / totalBytes) * 1000) / 10))
}

async function downloadFile(
  url: string,
  target: string,
  onProgress?: (progress: KataGoAssetInstallProgress) => void
): Promise<boolean> {
  const targetExists = await exists(target)
  if (targetExists) {
    onProgress?.({ stage: 'downloading-model', message: '官方权重已存在，跳过下载。', percent: 100 })
    return false
  }
  const tmp = `${target}.download`
  await mkdir(dirname(target), { recursive: true })
  await unlink(tmp).catch(() => undefined)
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GoMentor KataGo asset installer' }
  })
  if (!response.ok || !response.body) {
    throw new Error(`官方权重下载失败: HTTP ${response.status}`)
  }
  const totalBytes = Number(response.headers.get('content-length') ?? 0) || undefined
  let receivedBytes = 0
  const progressStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length
      onProgress?.({
        stage: 'downloading-model',
        message: '正在下载 KataGo 官方权重。',
        receivedBytes,
        totalBytes,
        percent: progressPercent(receivedBytes, totalBytes)
      })
      callback(null, chunk)
    }
  })
  await pipeline(Readable.fromWeb(response.body as never), progressStream, createWriteStream(tmp))
  await rename(tmp, target)
  onProgress?.({ stage: 'downloading-model', message: '官方权重下载完成。', receivedBytes, totalBytes, percent: 100 })
  return true
}

async function copyPlatformBinaryIfAvailable(root: string, manifest: KataGoAssetManifest, key: string): Promise<{ path: string; copied: boolean }> {
  const platform = manifest.supportedPlatforms[key]
  if (!platform) {
    return { path: '', copied: false }
  }
  const target = join(root, platform.binaryPath)
  if (await exists(target)) {
    if (process.platform !== 'win32') {
      await chmod(target, 0o755).catch(() => undefined)
    }
    return { path: target, copied: false }
  }
  const source = await firstExisting(candidateRoots()
    .filter((candidateRoot) => candidateRoot !== root)
    .map((candidateRoot) => join(candidateRoot, platform.binaryPath)))
  if (!source) {
    return { path: target, copied: false }
  }
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
  if (process.platform !== 'win32') {
    await chmod(target, 0o755).catch(() => undefined)
  }
  return { path: target, copied: true }
}

export async function readKataGoAssetManifest(): Promise<{ manifest: KataGoAssetManifest | null; root: string }> {
  for (const root of candidateRoots()) {
    const manifestPath = join(root, 'manifest.json')
    if (await exists(manifestPath)) {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as KataGoAssetManifest
      return { manifest, root }
    }
  }
  return { manifest: null, root: candidateRoots()[0] }
}

export async function inspectKataGoAssets(): Promise<KataGoAssetStatus> {
  const key = platformKey()
  const { manifest, root } = await readKataGoAssetManifest()
  if (!manifest) {
    return {
      platformKey: key,
      manifestFound: false,
      binaryPath: '',
      binaryFound: false,
      binaryExecutable: false,
      modelPath: '',
      modelFound: false,
      modelDisplayName: '',
      ready: false,
      detail: '未找到 data/katago/manifest.json。'
    }
  }

  const platform = manifest.supportedPlatforms[key]
  if (!platform) {
    return {
      platformKey: key,
      manifestFound: true,
      binaryPath: '',
      binaryFound: false,
      binaryExecutable: false,
      modelPath: join(root, manifest.modelPath),
      modelFound: await exists(join(root, manifest.modelPath)),
      modelDisplayName: manifest.defaultModelDisplayName,
      ready: false,
      detail: `当前平台 ${key} 不在 manifest 支持列表中。`
    }
  }

  const binaryPath = join(root, platform.binaryPath)
  const modelPath = join(root, manifest.modelPath)
  const binaryFound = await exists(binaryPath)
  const binaryExecutable = binaryFound ? await executable(binaryPath) : false
  const modelFound = await exists(modelPath)
  let checksumDetail = ''

  try {
    if (binaryFound && platform.sha256) {
      const actual = await sha256(binaryPath)
      if (actual !== platform.sha256) checksumDetail += `KataGo checksum 不匹配；`
    }
    if (modelFound && manifest.modelSha256) {
      const actual = await sha256(modelPath)
      if (actual !== manifest.modelSha256) checksumDetail += `模型 checksum 不匹配；`
    }
  } catch (error) {
    checksumDetail += `checksum 校验失败: ${String(error)}；`
  }

  const ready = binaryFound && binaryExecutable && modelFound && !checksumDetail
  const detail = ready
    ? `已找到 ${basename(binaryPath)} 和 ${manifest.defaultModelDisplayName}。`
    : [
        binaryFound ? '' : `缺少引擎: ${platform.binaryPath}`,
        binaryFound && !binaryExecutable ? `引擎不可执行: ${platform.binaryPath}` : '',
        modelFound ? '' : `缺少模型: ${manifest.modelPath}`,
        checksumDetail
      ].filter(Boolean).join('；')

  return {
    platformKey: key,
    manifestFound: true,
    binaryPath,
    binaryFound,
    binaryExecutable,
    modelPath,
    modelFound,
    modelDisplayName: manifest.defaultModelDisplayName,
    ready,
    detail
  }
}

export async function installOfficialKataGoModel(
  request: KataGoAssetInstallRequest = {},
  onProgress?: (progress: KataGoAssetInstallProgress) => void
): Promise<KataGoAssetInstallResult> {
  const key = platformKey()
  const userRoot = userKatagoRoot()
  if (!userRoot) {
    throw new Error('应用用户目录尚不可用，无法安装 KataGo 官方权重。')
  }
  const preset = getKataGoModelPreset(request.presetId)
  const { manifest: baseManifest } = await readKataGoAssetManifest()
  if (!baseManifest) {
    throw new Error('缺少 data/katago/manifest.json，无法创建本机资源配置。')
  }
  onProgress?.({ stage: 'discovering', message: `准备安装 ${preset.label}。` })
  const downloadUrl = await discoverModelDownloadUrl(preset.id)
  const modelPath = join(userRoot, 'models', preset.fileName)
  const downloadedModel = await downloadFile(downloadUrl, modelPath, onProgress)

  onProgress?.({ stage: 'copying-binary', message: '正在检查当前平台 KataGo 引擎。' })
  const manifest: KataGoAssetManifest = {
    ...baseManifest,
    defaultModelId: preset.id,
    defaultModelFileName: preset.fileName,
    defaultModelDisplayName: `KataGo ${preset.label}`,
    modelPath: `models/${preset.fileName}`,
    modelSha256: await sha256(modelPath).catch(() => '')
  }
  const binary = await copyPlatformBinaryIfAvailable(userRoot, manifest, key)
  onProgress?.({ stage: 'writing-manifest', message: '正在写入本机 KataGo 资源配置。' })
  await mkdir(userRoot, { recursive: true })
  await writeFile(join(userRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const finalStatus = await inspectKataGoAssets()
  const detail = finalStatus.ready
    ? `${preset.label} 已安装，可用于胜率图和实时分析。`
    : `权重已安装；${finalStatus.detail || '仍需准备当前平台 KataGo 引擎。'}`
  onProgress?.({ stage: finalStatus.ready ? 'done' : 'error', message: detail, percent: finalStatus.modelFound ? 100 : undefined })
  return {
    ok: finalStatus.ready,
    presetId: preset.id,
    modelPath,
    binaryPath: binary.path,
    downloadedModel,
    copiedBinary: binary.copied,
    detail
  }
}
