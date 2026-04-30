import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('LLM settings can reveal saved API key and keep paste-friendly inputs', () => {
  const types = read('src/main/lib/types.ts')
  assert.match(types, /LlmSavedApiKeyResult/)

  const main = read('src/main/index.ts')
  assert.match(main, /llm:get-saved-api-key/)
  assert.match(main, /getSettings\(\)/)

  const preload = read('src/preload/index.ts')
  assert.match(preload, /getSavedLlmApiKey/)

  const globals = read('src/renderer/src/global.d.ts')
  assert.match(globals, /getSavedLlmApiKey/)

  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /revealSavedLlmApiKey/)
  assert.match(app, /showLlmApiKey/)
  assert.match(app, /显示 Key/)
  assert.match(app, /当前 API/)
  assert.doesNotMatch(app, /copySavedLlmApiKey/)
  assert.match(app, /autoCapitalize="off"/)
  assert.match(app, /autoCorrect="off"/)
  assert.match(app, /spellCheck=\{false\}/)
  assert.match(app, /右键或 Cmd\/Ctrl\+V 可以粘贴新的 Key/)

  const runtimePanel = read('src/renderer/src/features/settings/RuntimeSettingsPanel.tsx')
  assert.match(runtimePanel, /showApiKey/)
  assert.match(runtimePanel, /显示 Key/)

  const styles = read('src/renderer/src/styles.css')
  assert.match(styles, /llm-secret-input-row/)
  assert.match(styles, /llm-config-input/)
  assert.match(styles, /desktop-preferences__heading/)
  assert.match(styles, /desktop-preferences__meta/)
})

test('Electron app exposes native paste controls for editable settings fields', () => {
  const main = read('src/main/index.ts')
  assert.match(main, /attachTextEditingContextMenu/)
  assert.match(main, /context-menu/)
  assert.match(main, /params\.isEditable/)
  assert.match(main, /role: 'paste'/)
  assert.match(main, /label: 'Edit'/)
  assert.match(main, /role: 'pasteAndMatchStyle'/)
})
