import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = new URL('..', import.meta.url)
const repoPath = fileURLToPath(repoRoot)

async function text(path) {
  return readFile(new URL(path, repoRoot), 'utf8')
}

async function json(path) {
  return JSON.parse(await text(path))
}

test('v5 joseki bundle and source registry are present and traceable', async () => {
  const manifest = await json('data/knowledge/joseki-source-manifest.json')
  const registry = await json('data/knowledge/source-registry.json')
  const registryIds = new Set(registry.map((source) => source.id))
  const bundledSources = manifest.filter((source) => source.bundled)
  const sgfRoot = join(repoPath, 'data', 'knowledge', 'joseki-sgf')
  const sgfFiles = readdirSync(sgfRoot, { recursive: true }).filter((path) => String(path).endsWith('.sgf'))
  const sgfBytes = sgfFiles.reduce((sum, path) => sum + statSync(join(sgfRoot, String(path))).size, 0)

  assert.ok(Array.isArray(manifest) && bundledSources.length >= 2)
  assert.ok(registryIds.has('pachi-joseki-gpl2'))
  assert.ok(registryIds.has('josekle-mit-dictionary'))
  assert.ok(sgfFiles.length >= 5)
  assert.ok(sgfBytes > 150_000)
})

test('v5 teaching runtime wires motifs, evidence, verification, and multilingual settings', async () => {
  const teacher = await text('src/main/services/teacherAgent.ts')
  const evidence = await text('src/main/services/teacher/teachingEvidence.ts')
  const motif = await text('src/main/services/knowledge/motifRecognizer.ts')
  const joseki = await text('src/main/services/knowledge/josekiSgfDatabase.ts')
  const app = await text('src/renderer/src/App.tsx')
  const i18n = await text('src/renderer/src/i18n.ts')
  const types = await text('src/main/lib/types.ts')

  assert.match(teacher, /recognizeTeachingMotifs/)
  assert.match(teacher, /buildTeachingEvidence/)
  assert.match(teacher, /verifyTeacherMarkdown/)
  assert.match(teacher, /teachingEvidence/)
  assert.match(evidence, /buildHumanTeacherInstruction/)
  assert.match(evidence, /friendlyTeacherFallback/)
  assert.match(motif, /formatRecognizedMotifsForPrompt/)
  assert.match(joseki, /loadBundledJosekiSgfCards/)
  assert.match(app, /SUPPORTED_UI_LOCALES/)
  assert.match(app, /reviewLanguage/)
  assert.match(i18n, /th-TH/)
  assert.match(i18n, /vi-VN/)
  assert.match(types, /teachingEvidence\?: unknown/)
  assert.match(types, /verification\?: unknown/)
})
