#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const manifestPath = join(root, 'data', 'katago', 'manifest.json')

function arg(name, fallback = '') {
  const prefix = `--${name}=`
  const found = process.argv.find((item) => item.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function platformKey() {
  return arg('platform', `${process.platform}-${process.arch}`)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function sha256(path) {
  const data = await readFile(path)
  return createHash('sha256').update(data).digest('hex')
}

async function copyIfProvided(source, target, label) {
  if (!source) {
    console.log(`[prepare-katago-assets] ${label}: no source provided, skip`)
    return false
  }
  const sourcePath = resolve(source)
  if (!(await exists(sourcePath))) {
    throw new Error(`${label} source does not exist: ${sourcePath}`)
  }
  await mkdir(dirname(target), { recursive: true })
  await copyFile(sourcePath, target)
  if (process.platform !== 'win32' && !target.endsWith('.bin.gz')) {
    await chmod(target, 0o755).catch(() => undefined)
  }
  console.log(`[prepare-katago-assets] copied ${label}: ${sourcePath} -> ${target}`)
  console.log(`[prepare-katago-assets] ${label} sha256=${await sha256(target)}`)
  return true
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const key = platformKey()
  const platform = manifest.supportedPlatforms?.[key]
  if (!platform) {
    throw new Error(`Unsupported platform key: ${key}. Supported: ${Object.keys(manifest.supportedPlatforms ?? {}).join(', ')}`)
  }

  const binarySource = arg('binary', process.env.KATASENSEI_KATAGO_BINARY ?? '')
  const modelSource = arg('model', process.env.KATASENSEI_KATAGO_MODEL ?? '')
  const assetDir = arg('asset-dir', process.env.KATASENSEI_KATAGO_ASSET_DIR ?? '')

  const binaryFallback = assetDir ? join(resolve(assetDir), platform.binaryPath) : ''
  const modelFallback = assetDir ? join(resolve(assetDir), manifest.modelPath) : ''

  const binaryTarget = join(root, 'data', 'katago', platform.binaryPath)
  const modelTarget = join(root, 'data', 'katago', manifest.modelPath)

  const copiedBinary = await copyIfProvided(binarySource || binaryFallback, binaryTarget, `binary ${key}`)
  const copiedModel = await copyIfProvided(modelSource || modelFallback, modelTarget, 'default model')

  if (!copiedBinary || !copiedModel) {
    console.log('[prepare-katago-assets] No complete asset pair copied. This is OK for local development but release packaging should provide both assets.')
  }
}

main().catch((error) => {
  console.error(`[prepare-katago-assets] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
