#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const args = new Set(process.argv.slice(2))
const mode = args.has('--mode=release') ? 'release' : 'dev'
const root = process.cwd()
const releaseRoot = join(root, 'release')

function collectFiles(directory) {
  if (!existsSync(directory)) return []
  const out = []
  const stack = [directory]
  while (stack.length) {
    const current = stack.pop()
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, name.name)
      if (name.isDirectory()) stack.push(full)
      else out.push(full)
    }
  }
  return out
}

const files = collectFiles(releaseRoot)
const artifactPatterns = [/\.dmg$/i, /\.zip$/i, /\.exe$/i, /\.AppImage$/i, /\.deb$/i, /\.tar\.gz$/i]
const artifacts = files.filter((file) => artifactPatterns.some((pattern) => pattern.test(file)))
const hasMac = artifacts.some((file) => /\.dmg$|mac|darwin/i.test(file))
const hasWin = artifacts.some((file) => /\.exe$|win|nsis|portable/i.test(file))

console.log('\nKataSensei Package Artifact Smoke Check')
console.log('======================================')
console.log(`mode=${mode}`)
console.log(`releaseRoot=${releaseRoot}`)
console.log(`artifactCount=${artifacts.length}`)
for (const artifact of artifacts.slice(0, 20)) console.log(`- ${artifact}`)

if (mode === 'release') {
  const failures = []
  if (!existsSync(releaseRoot)) failures.push('release directory missing')
  if (!hasMac) failures.push('macOS artifact missing')
  if (!hasWin) failures.push('Windows artifact missing')
  if (failures.length) {
    for (const failure of failures) console.error(`❌ ${failure}`)
    process.exit(1)
  }
  console.log('✅ release artifacts look present')
} else if (!existsSync(releaseRoot) || artifacts.length === 0) {
  console.log('⚠️  no release artifacts found; this is acceptable in dev mode before pnpm dist')
} else {
  console.log('✅ artifacts found')
}
