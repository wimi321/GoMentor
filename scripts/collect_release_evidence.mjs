#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))
const mode = modeArg ? modeArg.split('=')[1] : 'dev'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = join(root, 'release-evidence', stamp)
mkdirSync(outDir, { recursive: true })

function run(name, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  const payload = {
    name,
    command: [command, ...args],
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  }
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(payload, null, 2))
  return payload
}

function readMaybe(path) {
  try { return readFileSync(join(root, path), 'utf8') } catch { return '' }
}

const evidence = {
  mode,
  collectedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  gitHead: run('git-head', 'git', ['rev-parse', 'HEAD']).stdout.trim(),
  gitBranch: run('git-branch', 'git', ['branch', '--show-current']).stdout.trim(),
  packageJson: readMaybe('package.json'),
  katagoManifest: readMaybe('data/katago/manifest.json')
}

const checks = [
  run('git-status', 'git', ['status', '--short']),
  run('katago-assets', 'node', ['scripts/check_katago_assets.mjs', `--mode=${mode}`]),
  run('p0-beta-acceptance', 'node', ['scripts/p0_beta_acceptance.mjs']),
  run('package-artifact-smoke', 'node', ['scripts/package_artifact_smoke.mjs', `--mode=${mode}`]),
  run('p0-release-candidate', 'node', ['scripts/p0_release_candidate_check.mjs', `--mode=${mode}`]),
  run('verify-release-artifacts', 'node', ['scripts/verify_release_artifacts.mjs', `--mode=${mode}`])
]

evidence.checks = checks.map((item) => ({ name: item.name, status: item.status }))
writeFileSync(join(outDir, 'release-evidence-summary.json'), JSON.stringify(evidence, null, 2))
writeFileSync(join(outDir, 'README.md'), [
  '# KataSensei Release Evidence',
  '',
  `Mode: ${mode}`,
  `Collected at: ${evidence.collectedAt}`,
  `Git branch: ${evidence.gitBranch}`,
  `Git head: ${evidence.gitHead}`,
  '',
  'Open `release-evidence-summary.json` and each check JSON for details.'
].join('\n'))

console.log(`Release evidence written to ${outDir.replace(root + '/', '')}`)
const failures = checks.filter((item) => item.status !== 0)
process.exit(failures.length > 0 && mode === 'release' ? 1 : 0)
