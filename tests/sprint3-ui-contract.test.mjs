import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const expectedFiles = [
  'src/renderer/src/features/board/GoBoardV2.tsx',
  'src/renderer/src/features/board/WinrateTimelineV2.tsx',
  'src/renderer/src/features/board/boardGeometry.ts',
  'src/renderer/src/features/teacher/TeacherRunCardPro.tsx',
  'src/renderer/src/features/teacher/TeacherComposerPro.tsx',
  'src/renderer/src/styles/design-tokens.css'
]

test('Sprint 3 UI files are present after overlay is applied', () => {
  for (const file of expectedFiles) {
    assert.equal(existsSync(join(root, file)), true, `${file} should exist`)
  }
})

test('GoBoardV2 keeps candidate, previous move, and key move layers', () => {
  const text = readFileSync(join(root, 'src/renderer/src/features/board/GoBoardV2.tsx'), 'utf8')
  assert.match(text, /ks-candidates-layer/)
  assert.match(text, /ks-variation-preview-layer/)
  assert.match(text, /ks-played-move-layer/)
  assert.match(text, /ks-previous-move/)
  assert.match(text, /ks-keymoves-layer/)
})

test('TeacherRunCardPro supports raw markdown display and folded tool logs', () => {
  const text = readFileSync(join(root, 'src/renderer/src/features/teacher/TeacherRunCardPro.tsx'), 'utf8')
  assert.match(text, /ks-teacher-pro-markdown/)
  assert.match(text, /setToolsOpen/)
})
