import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// Contract-style tests: verify code structure since TS import with aliases
// is not available in the plain Node test runner.

const classifier = await readFile(new URL('../src/main/services/teacher/intentClassifier.ts', import.meta.url), 'utf8')

test('move-range classification requires gameId for parser-only path', () => {
  assert.match(classifier, /request\.gameId\s*&&\s*\(\s*request\.moveRange\s*\|\|\s*parseMoveRangeFromPrompt/)
})

test('mode=move-range always classifies regardless of gameId', () => {
  const modeBlock = classifier.match(/request\.mode\s*===\s*['"]move-range['"][\s\S]*?return\s*\{[^}]*intent:\s*['"]move-range['"]/)?.[0]
  assert.ok(modeBlock, 'should have a mode=move-range early return block')
  assert.doesNotMatch(modeBlock, /gameId/, 'mode=move-range block should not require gameId')
})

test('no standalone parseMoveRangeFromPrompt gate without gameId', () => {
  const lines = classifier.split('\n')
  let foundBareParserCheck = false
  for (const line of lines) {
    if (
      line.includes('parseMoveRangeFromPrompt') &&
      !line.includes('request.gameId') &&
      !line.includes('import') &&
      !line.includes('//') &&
      line.includes('request.prompt')
    ) {
      const prevLines = lines.slice(Math.max(0, lines.indexOf(line) - 5), lines.indexOf(line)).join('\n')
      if (!prevLines.includes('request.gameId') && line.includes('parseMoveRangeFromPrompt') && line.includes('if')) {
        foundBareParserCheck = true
      }
    }
  }
  assert.ok(!foundBareParserCheck, 'parseMoveRangeFromPrompt should not be used in an if-condition without gameId gate')
})

test('single-move prompt should not be move-range', () => {
  assert.match(classifier, /第\\s\*\\d\+\\s\*手/)
})

test('intentClassifier imports shared parser from moveRange', () => {
  assert.match(classifier, /import\s*\{[^}]*parseMoveRangeFromPrompt[^}]*\}\s*from\s*['"]@main\/lib\/moveRange['"]/)
})
