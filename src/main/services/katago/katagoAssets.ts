import { access, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { app } from 'electron'

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

function candidateRoots(): string[] {
  const roots = [join(process.cwd(), 'data', 'katago')]
  if (process.resourcesPath) {
    roots.push(join(process.resourcesPath, 'data', 'katago'))
  }
  try {
    roots.push(join(app.getPath('userData'), 'katago'))
  } catch {
    // app may not be ready in tests; ignore.
  }
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
