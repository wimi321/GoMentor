import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('Sprint 7 UI Gallery route and mock data are present', () => {
  assert.equal(existsSync(join(root, 'src/renderer/src/features/gallery/UiGallery.tsx')), true)
  assert.equal(existsSync(join(root, 'src/renderer/src/features/gallery/uiGalleryMock.ts')), true)
  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /#\/ui-gallery/)
  assert.match(app, /UiGallery/)
})

test('GoBoardV2 renders polished stone and candidate layers', () => {
  const board = read('src/renderer/src/features/board/GoBoardV2.tsx')
  assert.match(board, /ks-stone-highlight/)
  assert.match(board, /ks-board-bevel/)
  assert.match(board, /ks-candidate-soft-glow/)
})

test('WinrateTimelineV2 exposes hover tooltip and area rendering', () => {
  const timeline = read('src/renderer/src/features/board/WinrateTimelineV2.tsx')
  assert.match(timeline, /ks-timeline-tooltip/)
  assert.match(timeline, /ks-timeline-area/)
  assert.match(timeline, /hoveredMove/)
})

test('TeacherRunCardPro renders structured product modules', () => {
  const teacher = read('src/renderer/src/features/teacher/TeacherRunCardPro.tsx')
  assert.match(teacher, /一句话结论/)
  assert.match(teacher, /推荐思路/)
  assert.match(teacher, /可继续追问/)
  assert.match(teacher, /ks-teacher-pro-evidence/)
})

test('StudentRailCard includes training focus and visual QA capture exists', () => {
  const student = read('src/renderer/src/features/student/StudentRailCard.tsx')
  assert.match(student, /trainingFocus/)
  assert.match(student, /student-training-focus/)
  assert.equal(existsSync(join(root, 'scripts/capture_ui_gallery.mjs')), true)
  assert.equal(existsSync(join(root, 'docs/VISUAL_QA_CAPTURE.md')), true)
})
