import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()

test('katago manifest includes P0 platform assets', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'data/katago/manifest.json'), 'utf8'))
  assert.equal(manifest.defaultModelId, 'official-b18-recommended')
  assert.ok(manifest.modelPath.includes('models/'))
  assert.ok(manifest.supportedPlatforms['darwin-arm64'])
  assert.ok(manifest.supportedPlatforms['darwin-x64'])
  assert.ok(manifest.supportedPlatforms['win32-x64'])
})

test('knowledge card payload remains available', async () => {
  const cards = JSON.parse(await readFile(join(root, 'data/knowledge/p0-cards.json'), 'utf8'))
  assert.ok(Array.isArray(cards))
  assert.ok(cards.length >= 40)
})
