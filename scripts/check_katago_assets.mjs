#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const manifestPath = join(root, 'data', 'katago', 'manifest.json')

function arg(name, fallback = '') {
  const prefix = `--${name}=`
  const found = process.argv.find((item) => item.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function currentPlatformKey() {
  return arg('platform', `${process.platform}-${process.arch}`)
}

async function fileOk(path, executable = false) {
  try {
    await stat(path)
    if (executable && process.platform !== 'win32') {
      await access(path, constants.X_OK)
    }
    return true
  } catch {
    return false
  }
}

async function sha256(path) {
  const data = await readFile(path)
  return createHash('sha256').update(data).digest('hex')
}

async function main() {
  const mode = arg('mode', hasFlag('release') ? 'release' : 'dev')
  const key = currentPlatformKey()
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const platform = manifest.supportedPlatforms?.[key]
  if (!platform) {
    const message = `Unsupported platform ${key}. Supported: ${Object.keys(manifest.supportedPlatforms ?? {}).join(', ')}`
    if (mode === 'release') throw new Error(message)
    console.warn(`[check-katago-assets] warning: ${message}`)
    return
  }

  const binaryPath = join(root, 'data', 'katago', platform.binaryPath)
  const modelPath = join(root, 'data', 'katago', manifest.modelPath)
  const binaryOk = await fileOk(binaryPath, true)
  const modelOk = await fileOk(modelPath, false)

  if (binaryOk) {
    console.log(`[check-katago-assets] binary OK: ${platform.binaryPath}`)
    if (platform.sha256) {
      const actual = await sha256(binaryPath)
      if (actual !== platform.sha256) throw new Error(`Binary checksum mismatch: expected ${platform.sha256}, got ${actual}`)
    }
  } else {
    console.warn(`[check-katago-assets] missing binary: ${platform.binaryPath}`)
  }

  if (modelOk) {
    console.log(`[check-katago-assets] model OK: ${manifest.modelPath}`)
    if (manifest.modelSha256) {
      const actual = await sha256(modelPath)
      if (actual !== manifest.modelSha256) throw new Error(`Model checksum mismatch: expected ${manifest.modelSha256}, got ${actual}`)
    }
  } else {
    console.warn(`[check-katago-assets] missing model: ${manifest.modelPath}`)
  }

  if (mode === 'release' && (!binaryOk || !modelOk)) {
    throw new Error('Release packaging requires both KataGo binary and default model. Run scripts/prepare_katago_assets.mjs first.')
  }

  if (!binaryOk || !modelOk) {
    console.warn('[check-katago-assets] development warning only. Diagnostics should show missing assets to the user.')
  }
}

main().catch((error) => {
  console.error(`[check-katago-assets] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
