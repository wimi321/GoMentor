#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))
const mode = modeArg ? modeArg.split('=')[1] : (args.has('--release') ? 'release' : 'dev')
const json = args.has('--json')
const p0BetaVersion = process.env.GOMENTOR_RELEASE_VERSION ?? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

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
  push(
    pkg.version === p0BetaVersion ? 'pass' : 'fail',
    'package-version',
    `package version is ${p0BetaVersion}`,
    `Found ${pkg.version ?? 'missing'}`
  )
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

  const winTargets = build.win?.target ?? []
  const winTargetText = JSON.stringify(winTargets)
  const hasWinX64 = winTargetText.includes('x64')
  const hasWinArm64 = winTargetText.includes('arm64')
  push(hasWinX64 ? 'pass' : 'fail', 'builder:win-x64', 'Windows x64 target is configured')
  push(!hasWinArm64 ? 'pass' : 'fail', 'builder:no-win-arm64', 'Windows ARM64 target is disabled for P0 beta')

  const artifactName = String(build.artifactName ?? '')
  push(
    artifactName.includes('${version}') && artifactName.includes('${os}') && artifactName.includes('${arch}')
      ? 'pass'
      : 'warning',
    'builder:artifact-name',
    'artifactName includes version, os, and arch',
    artifactName
  )
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
    'docs/P0_STATUS.md',
    'docs/MACOS_SIGNING_NOTARIZATION.md',
    'docs/WINDOWS_CODE_SIGNING.md',
    'docs/WINDOWS_SMOKE_TEST.md',
    'docs/VISUAL_QA_EVIDENCE_TEMPLATE.md',
    `docs/RELEASE_NOTES_v${p0BetaVersion}.md`
  ]
  for (const path of docs) file(path, { required: false })
  file('docs/RC_RELEASE_GUIDE.md', { required: false })
  file('docs/RELEASE_SMOKE_MATRIX.md', { required: false })
}

function checkManualReleaseBlockers() {
  const signingEvidence =
    process.env.GOMENTOR_SIGNING_READY === '1' ||
    existsSync(join(root, 'release-evidence', 'signing-ready.json'))
  const windowsSmokeEvidence =
    process.env.GOMENTOR_WINDOWS_SMOKE_READY === '1' ||
    existsSync(join(root, 'release-evidence', 'windows-smoke-ready.json'))
  const visualQaEvidence =
    process.env.GOMENTOR_VISUAL_QA_READY === '1' ||
    existsSync(join(root, 'release-evidence', 'visual-qa-ready.json'))

  push(
    signingEvidence ? 'pass' : 'warning',
    'manual:signing-ready',
    'macOS and Windows signing evidence is present',
    signingEvidence ? '' : 'Manual blocker before public beta: signed/notarized macOS app and signed Windows installer not verified'
  )
  push(
    windowsSmokeEvidence ? 'pass' : 'warning',
    'manual:windows-smoke-ready',
    'Windows real-machine smoke evidence is present',
    windowsSmokeEvidence ? '' : 'Manual blocker before tag: Windows 11 x64 smoke test required'
  )
  push(
    visualQaEvidence ? 'pass' : 'warning',
    'manual:visual-qa-ready',
    'Visual QA evidence is present',
    visualQaEvidence ? '' : 'Manual blocker before public beta: visual screenshots/checklist required'
  )
  push(
    signingEvidence && windowsSmokeEvidence && visualQaEvidence ? 'pass' : 'warning',
    'manual:public-beta-ready',
    'Public beta manual gates are complete',
    signingEvidence && windowsSmokeEvidence && visualQaEvidence
      ? ''
      : 'publicBetaReady=false until signing, Windows smoke, and visual QA evidence are all present'
  )
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
    const risky = git.stdout.split('\n').filter((line) => {
      const path = line.slice(3).trim().split(' -> ').pop() ?? ''
      return (
        /(^|\/)\.env/.test(path) ||
        /^(node_modules|out|release)\//.test(path) ||
        /\.(zip|dmg|exe)$/i.test(path)
      )
    })
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
checkManualReleaseBlockers()
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
