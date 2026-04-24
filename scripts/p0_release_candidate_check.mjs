#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))
const mode = modeArg ? modeArg.split('=')[1] : (args.has('--release') ? 'release' : 'dev')
const json = args.has('--json')

const results = []

function rel(path) {
  return path.replace(root + '/', '')
}

function push(status, id, title, detail = '') {
  results.push({ status, id, title, detail })
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return null
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function file(path, options = {}) {
  const full = join(root, path)
  if (!existsSync(full)) {
    push(options.required === false ? 'warning' : 'fail', `file:${path}`, `${path} exists`, 'Missing file')
    return false
  }
  if (options.minBytes) {
    const size = statSync(full).size
    if (size < options.minBytes) {
      push('warning', `file-size:${path}`, `${path} has expected size`, `Found ${size} bytes, expected >= ${options.minBytes}`)
      return true
    }
  }
  push('pass', `file:${path}`, `${path} exists`)
  return true
}

function contains(path, needles, title) {
  const text = readText(join(root, path))
  if (!text) {
    push('fail', `contains:${path}`, title ?? `${path} contains expected text`, 'Missing or unreadable file')
    return false
  }
  const missing = needles.filter((needle) => !text.includes(needle))
  if (missing.length > 0) {
    push('fail', `contains:${path}`, title ?? `${path} contains expected text`, `Missing: ${missing.join(', ')}`)
    return false
  }
  push('pass', `contains:${path}`, title ?? `${path} contains expected text`)
  return true
}

function checkPackageJson() {
  const pkg = readJson(join(root, 'package.json'))
  if (!pkg) {
    push('fail', 'package-json', 'package.json is readable')
    return
  }
  push('pass', 'package-json', 'package.json is readable')
  const scripts = pkg.scripts ?? {}
  for (const script of ['typecheck', 'build', 'check', 'dist:mac', 'dist:win']) {
    push(scripts[script] ? 'pass' : 'fail', `script:${script}`, `package script ${script} exists`)
  }
  if (scripts['rc:check'] || existsSync(join(root, 'scripts/p0_release_candidate_check.mjs'))) {
    push('pass', 'script:rc-check', 'RC readiness script exists')
  } else {
    push('warning', 'script:rc-check', 'RC readiness script exists', 'Add rc:check alias in package.json')
  }

  const build = pkg.build ?? {}
  const extra = JSON.stringify(build.extraResources ?? [])
  const unpack = JSON.stringify(build.asarUnpack ?? [])
  if (extra.includes('data/katago')) {
    push('pass', 'builder:extraResources', 'electron-builder includes data/katago extraResources')
  } else {
    push('fail', 'builder:extraResources', 'electron-builder includes data/katago extraResources')
  }
  if (unpack.includes('data/katago')) {
    push('pass', 'builder:asarUnpack', 'electron-builder unpacks data/katago')
  } else {
    push('warning', 'builder:asarUnpack', 'electron-builder unpacks data/katago', 'KataGo should not run from inside asar')
  }
}

function checkCoreFiles() {
  const required = [
    'src/main/services/diagnostics/index.ts',
    'src/main/services/llm/openaiCompatibleProvider.ts',
    'src/main/services/studentProfile.ts',
    'src/main/services/teacherAgent.ts',
    'data/knowledge/p0-cards.json',
    'data/katago/manifest.json',
    'scripts/check_katago_assets.mjs',
    'scripts/p0_beta_acceptance.mjs',
    'scripts/package_artifact_smoke.mjs'
  ]
  for (const path of required) {
    file(path)
  }
}

function checkKnowledgeCards() {
  const cards = readJson(join(root, 'data/knowledge/p0-cards.json'))
  if (!Array.isArray(cards)) {
    push('fail', 'knowledge:cards-array', 'P0 knowledge cards are an array')
    return
  }
  const count = cards.length
  push(count >= 48 ? 'pass' : 'fail', 'knowledge:cards-count', 'P0 knowledge cards count >= 48', `Found ${count}`)
  const missingCore = cards.filter((card) => !card.id || !card.title || !card.summary).length
  push(missingCore === 0 ? 'pass' : 'warning', 'knowledge:card-core-fields', 'Knowledge cards have core fields', `${missingCore} cards missing id/title/summary`)
}

function checkWorkflow() {
  const release = '.github/workflows/release.yml'
  const p0 = '.github/workflows/p0-release-candidate.yml'
  if (existsSync(join(root, release))) {
    const text = readText(join(root, release))
    const hasPrepare = text.includes('prepare_katago_assets') || text.includes('check_katago_assets') || text.includes('KataGo')
    push(hasPrepare ? 'pass' : 'warning', 'workflow:release-katago', 'Release workflow mentions KataGo asset preparation')
  } else {
    push('warning', 'workflow:release', 'Release workflow exists')
  }
  file(p0, { required: false })
}

function checkDocs() {
  const docs = [
    'docs/RELEASE_BETA_CHECKLIST.md',
    'docs/VISUAL_QA_CHECKLIST.md',
    'docs/KATAGO_ASSETS.md',
    'docs/P0_STATUS.md'
  ]
  for (const path of docs) file(path, { required: false })
  file('docs/RC_RELEASE_GUIDE.md', { required: false })
  file('docs/RELEASE_SMOKE_MATRIX.md', { required: false })
}

function checkKatagoAssets() {
  const manifest = readJson(join(root, 'data/katago/manifest.json'))
  if (!manifest) {
    push('fail', 'katago:manifest', 'KataGo manifest is readable')
    return
  }
  push('pass', 'katago:manifest', 'KataGo manifest is readable')

  const paths = []
  const manifestPath = (path) => {
    if (!path) return null
    return path.startsWith('data/katago/') ? path : `data/katago/${path}`
  }
  if (manifest.modelFileName) paths.push(`data/katago/models/${manifest.modelFileName}`)
  if (manifest.defaultModelFileName) paths.push(`data/katago/models/${manifest.defaultModelFileName}`)
  if (manifest.modelPath) paths.push(manifestPath(manifest.modelPath))
  if (manifest.defaultModel?.path) paths.push(manifestPath(manifest.defaultModel.path))
  const platformPaths = manifest.supportedPlatforms ?? manifest.platforms ?? {}
  if (Array.isArray(platformPaths)) {
    for (const item of platformPaths) {
      if (item.binaryPath) paths.push(manifestPath(item.binaryPath))
    }
  } else {
    for (const value of Object.values(platformPaths)) {
      if (typeof value === 'string') paths.push(manifestPath(value))
      if (value?.binaryPath) paths.push(manifestPath(value.binaryPath))
    }
  }

  const missing = [...new Set(paths)].filter((path) => !existsSync(join(root, path)))
  if (missing.length === 0 && paths.length > 0) {
    push('pass', 'katago:assets-present', 'KataGo manifest assets exist')
  } else if (mode === 'release') {
    push('fail', 'katago:assets-present', 'KataGo manifest assets exist', `Missing: ${missing.join(', ') || 'no paths declared'}`)
  } else {
    push('warning', 'katago:assets-present', 'KataGo assets missing in dev mode', `Missing: ${missing.join(', ') || 'no paths declared'}`)
  }
}

function checkNoObviousSecrets() {
  const candidates = ['.env', '.env.local', 'release', 'out', 'node_modules']
  for (const path of candidates) {
    if (existsSync(join(root, path))) {
      push('warning', `workspace:${path}`, `${path} not meant for commit`, 'Exists locally; verify not tracked')
    } else {
      push('pass', `workspace:${path}`, `${path} absent from workspace root`)
    }
  }

  const git = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  if (git.status === 0) {
    const risky = git.stdout.split('\n').filter((line) => /\.zip$|\.env|node_modules|release\//.test(line))
    push(risky.length === 0 ? 'pass' : 'fail', 'git:no-risky-files', 'No obvious risky files staged/modified', risky.join('\n'))
  } else {
    push('warning', 'git:status', 'git status available')
  }
}

checkPackageJson()
checkCoreFiles()
checkKnowledgeCards()
checkWorkflow()
checkDocs()
checkKatagoAssets()
checkNoObviousSecrets()

const failures = results.filter((item) => item.status === 'fail')
const warnings = results.filter((item) => item.status === 'warning')

if (json) {
  console.log(JSON.stringify({ mode, pass: results.length - failures.length - warnings.length, warnings: warnings.length, failures: failures.length, results }, null, 2))
} else {
  console.log(`P0 release candidate check (${mode})`)
  for (const item of results) {
    const icon = item.status === 'pass' ? '✓' : item.status === 'warning' ? '!' : '✗'
    console.log(`${icon} ${item.title}${item.detail ? ` — ${item.detail}` : ''}`)
  }
  console.log(`\nSummary: ${results.length - failures.length - warnings.length} pass / ${warnings.length} warnings / ${failures.length} failures`)
}

process.exit(failures.length > 0 ? 1 : 0)
