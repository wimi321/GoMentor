#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))
const mode = modeArg ? modeArg.split('=')[1] : (args.has('--release') ? 'release' : 'dev')
const releaseDir = join(root, 'release')
const minSizeBytes = Number(process.env.KATASENSEI_MIN_ARTIFACT_BYTES ?? 1024 * 1024)

function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const files = walk(releaseDir)
const artifacts = files.filter((file) => /\.(dmg|zip|exe|AppImage|deb|tar\.gz|yml)$/i.test(file))
const mac = artifacts.filter((file) => /\.(dmg|zip)$/i.test(file) && /mac|darwin|KataSensei/i.test(file))
const win = artifacts.filter((file) => /\.(exe|zip)$/i.test(file) && /win|KataSensei/i.test(file))
const tiny = artifacts.filter((file) => statSync(file).size < minSizeBytes)

console.log(`Release artifact smoke (${mode})`)
console.log(`Found ${artifacts.length} artifact candidates under release/`)
for (const artifact of artifacts) {
  const size = statSync(artifact).size
  console.log(`- ${artifact.replace(root + '/', '')} (${Math.round(size / 1024)} KB)`)
}

const failures = []
const warnings = []
if (artifacts.length === 0) {
  if (mode === 'release') failures.push('No release artifacts found')
  else warnings.push('No release artifacts found in dev mode')
}
if (mode === 'release') {
  if (mac.length === 0) failures.push('No macOS artifact found (.dmg or .zip)')
  if (win.length === 0) failures.push('No Windows artifact found (.exe or .zip)')
  if (tiny.length > 0) failures.push(`Artifact too small: ${tiny.map((file) => file.replace(root + '/', '')).join(', ')}`)
} else if (tiny.length > 0) {
  warnings.push(`Artifact too small: ${tiny.map((file) => file.replace(root + '/', '')).join(', ')}`)
}

for (const warning of warnings) console.log(`! ${warning}`)
for (const failure of failures) console.log(`✗ ${failure}`)
console.log(`Summary: ${Math.max(0, artifacts.length - tiny.length)} artifact(s), ${warnings.length} warning(s), ${failures.length} failure(s)`)
process.exit(failures.length > 0 ? 1 : 0)
