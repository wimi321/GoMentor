import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/main/services/llmResponse.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: false
  }
}).outputText
const { extractText, responseShapeDiagnostics } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

test('extracts standard chat completion content', () => {
  assert.equal(extractText({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: '老师讲解文本'
        }
      }
    ]
  }), '老师讲解文本')
})

test('extracts OpenAI-compatible object content parts', () => {
  assert.equal(extractText({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: {
            type: 'output_text',
            text: { value: '兼容字段文本' }
          }
        }
      }
    ]
  }), '兼容字段文本')
})

test('extracts Responses-style output text and skips reasoning items', () => {
  assert.equal(extractText({
    output: [
      {
        type: 'reasoning',
        content: [{ type: 'reasoning_text', text: '不要显示这个' }]
      },
      {
        type: 'message',
        content: [{ type: 'output_text', text: '最终讲解' }]
      }
    ]
  }), '最终讲解')
})

test('reports response shape without serializing content', () => {
  const shape = responseShapeDiagnostics({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: '敏感正文'
        }
      }
    ],
    usage: { total_tokens: 12 }
  })
  assert.match(shape, /"message":\["content"\]/)
  assert.doesNotMatch(shape, /敏感正文/)
})
