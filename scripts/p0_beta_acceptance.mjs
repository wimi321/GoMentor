#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []
const passes = []

function checkPath(relativePath, { required = true, note = '' } = {}) {
  const ok = existsSync(join(root, relativePath))
  const line = `${relativePath}${note ? ` — ${note}` : ''}`
  if (ok) passes.push(line)
  else if (required) failures.push(line)
  else warnings.push(line)
}

function checkText(relativePath, pattern, label, { required = true } = {}) {
  const file = join(root, relativePath)
  if (!existsSync(file)) {
    failures.push(`${label}: missing ${relativePath}`)
    return
  }
  const text = readFileSync(file, 'utf8')
  const ok = typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)
  if (ok) passes.push(label)
  else if (required) failures.push(label)
  else warnings.push(label)
}

checkPath('package.json')
checkPath('src/main/services/diagnostics/index.ts')
checkPath('src/main/services/llm/openaiCompatibleProvider.ts')
checkPath('src/main/services/studentProfile.ts')
checkPath('src/main/services/teacherAgent.ts')
checkPath('data/knowledge/p0-cards.json')
checkPath('data/katago/manifest.json')
checkPath('scripts/check_katago_assets.mjs')
checkPath('src/renderer/src/features/board/GoBoardV2.tsx')
checkPath('src/renderer/src/features/board/WinrateTimelineV2.tsx')
checkPath('src/renderer/src/features/teacher/TeacherRunCardPro.tsx')
checkPath('src/renderer/src/features/diagnostics/DiagnosticsGate.tsx', { required: false, note: '如果诊断 gate 文件名不同，可忽略此 warning' })

checkText('package.json', /"typecheck"\s*:/, 'package.json has typecheck script')
checkText('package.json', /"build"\s*:/, 'package.json has build script')
checkText('package.json', /"test"\s*:/, 'package.json has test script')
checkText('.github/workflows/release.yml', /prepare.*katago|KataGo assets|check_katago_assets|prepare_katago_assets/i, 'release workflow prepares KataGo assets', { required: false })
checkText('src/main/index.ts', /diagnostics|katago-assets|student/i, 'main process exposes P0 IPC contracts')

try {
  const cards = JSON.parse(readFileSync(join(root, 'data/knowledge/p0-cards.json'), 'utf8'))
  const count = Array.isArray(cards) ? cards.length : Array.isArray(cards.cards) ? cards.cards.length : 0
  if (count >= 40) passes.push(`knowledge cards count >= 40 (${count})`)
  else failures.push(`knowledge cards count too low (${count})`)
} catch (error) {
  failures.push(`knowledge cards parse failed: ${error.message}`)
}

console.log('\nKataSensei P0 Beta Acceptance')
console.log('================================')
for (const line of passes) console.log(`✅ ${line}`)
for (const line of warnings) console.log(`⚠️  ${line}`)
for (const line of failures) console.log(`❌ ${line}`)
console.log('================================')
console.log(`passes=${passes.length} warnings=${warnings.length} failures=${failures.length}`)

if (failures.length > 0) {
  process.exit(1)
}
