import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function importProviderForTest() {
  const root = await mkdtemp(join(tmpdir(), 'katasensei-provider-test-'))
  const servicesDir = join(root, 'src/main/services')
  const providerDir = join(servicesDir, 'llm')
  await mkdir(providerDir, { recursive: true })

  const compilerOptions = {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: false
  }
  const llmResponseSource = await readFile(new URL('../src/main/services/llmResponse.ts', import.meta.url), 'utf8')
  const providerSource = (await readFile(new URL('../src/main/services/llm/openaiCompatibleProvider.ts', import.meta.url), 'utf8'))
    .replace("from '../llmResponse'", "from '../llmResponse.js'")

  await writeFile(
    join(servicesDir, 'llmResponse.js'),
    ts.transpileModule(llmResponseSource, { compilerOptions }).outputText,
    'utf8'
  )
  await writeFile(
    join(providerDir, 'openaiCompatibleProvider.js'),
    ts.transpileModule(providerSource, { compilerOptions }).outputText,
    'utf8'
  )

  const moduleUrl = pathToFileURL(join(providerDir, 'openaiCompatibleProvider.js')).href
  const provider = await import(`${moduleUrl}?t=${Date.now()}`)
  return {
    postOpenAICompatibleChat: provider.postOpenAICompatibleChat,
    streamOpenAICompatibleChat: provider.streamOpenAICompatibleChat,
    probeOpenAICompatibleProvider: provider.probeOpenAICompatibleProvider,
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}

async function withMockChatServer(handler, run) {
  const server = createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      const body = raw ? JSON.parse(raw) : {}
      const result = handler(body)
      response.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' })
      response.end(typeof result.payload === 'string' ? result.payload : JSON.stringify(result.payload))
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

function settings(baseUrl) {
  return {
    llmBaseUrl: baseUrl,
    llmApiKey: 'test-key',
    llmModel: 'gpt-5.4'
  }
}

function hasFinalTextReminder(body) {
  return body.messages?.some((message) =>
    typeof message.content === 'string' && message.content.includes('上一次请求没有返回可展示')
  )
}

test('retries OpenAI-compatible parameter variants until the proxy accepts one', async () => {
  const { postOpenAICompatibleChat, cleanup } = await importProviderForTest()
  const requests = []
  try {
    await withMockChatServer((body) => {
      requests.push(body)
      if ('max_completion_tokens' in body) {
        return {
          status: 400,
          payload: { error: { message: 'unsupported parameter max_completion_tokens' } }
        }
      }
      return {
        payload: {
          choices: [{ finish_reason: 'stop', message: { content: '兼容代理文本' } }],
          usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 }
        }
      }
    }, async (baseUrl) => {
      const text = await postOpenAICompatibleChat(settings(baseUrl), [{ role: 'user', content: 'hello' }], 128)
      assert.equal(text, '兼容代理文本')
    })

    assert.ok(requests.some((body) => 'max_tokens' in body))
  } finally {
    await cleanup()
  }
})

test('probe sends a valid PNG image payload to the multimodal provider', async () => {
  const { probeOpenAICompatibleProvider, cleanup } = await importProviderForTest()
  const requests = []
  try {
    await withMockChatServer((body) => {
      requests.push(body)
      return {
        payload: {
          choices: [{ finish_reason: 'stop', message: { content: 'OK' } }],
          usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 }
        }
      }
    }, async (baseUrl) => {
      const result = await probeOpenAICompatibleProvider(settings(baseUrl))
      assert.equal(result.ok, true)
      assert.equal(result.supportsImage, true)
    })

    const imagePart = requests[0].messages
      .flatMap((message) => Array.isArray(message.content) ? message.content : [])
      .find((part) => part.type === 'image_url')
    assert.ok(imagePart, 'probe should include an image part')
    const imageUrl = imagePart.image_url.url
    assert.ok(imageUrl.startsWith('data:image/png;base64,'))
    const bytes = Buffer.from(imageUrl.replace('data:image/png;base64,', ''), 'base64')
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(bytes.readUInt32BE(16), 64)
    assert.equal(bytes.readUInt32BE(20), 64)
  } finally {
    await cleanup()
  }
})

test('asks once more for final text after a stop response spends tokens but returns empty content', async () => {
  const { postOpenAICompatibleChat, cleanup } = await importProviderForTest()
  const requests = []
  try {
    await withMockChatServer((body) => {
      requests.push(body)
      if (hasFinalTextReminder(body)) {
        return {
          payload: {
            choices: [{ finish_reason: 'stop', message: { content: '最终给学生看的讲解文本' } }],
            usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 }
          }
        }
      }
      return {
        payload: {
          choices: [{ finish_reason: 'stop', message: { content: '' } }],
          usage: {
            prompt_tokens: 6977,
            completion_tokens: 1436,
            total_tokens: 8413,
            completion_tokens_details: { reasoning_tokens: 66 }
          }
        }
      }
    }, async (baseUrl) => {
      const text = await postOpenAICompatibleChat(settings(baseUrl), [{ role: 'user', content: '讲解当前手' }], 512)
      assert.equal(text, '最终给学生看的讲解文本')
    })

    assert.ok(requests.length > 1)
    assert.ok(hasFinalTextReminder(requests.at(-1)))
  } finally {
    await cleanup()
  }
})

test('falls back to streaming when a reasoning model returns empty non-stream content', async () => {
  const { postOpenAICompatibleChat, cleanup } = await importProviderForTest()
  const requests = []
  try {
    await withMockChatServer((body) => {
      requests.push(body)
      if (body.stream) {
        return {
          payload: [
            'data: {"choices":[{"delta":{"content":"流式"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{"content":"讲解"},"finish_reason":null}]}',
            'data: [DONE]',
            ''
          ].join('\n\n')
        }
      }
      return {
        payload: {
          choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: null, tool_calls: [] } }],
          usage: {
            prompt_tokens: 180,
            completion_tokens: 44,
            total_tokens: 224,
            completion_tokens_details: { reasoning_tokens: 37 }
          }
        }
      }
    }, async (baseUrl) => {
      const text = await postOpenAICompatibleChat(settings(baseUrl), [{ role: 'user', content: '讲解当前手' }], 512)
      assert.equal(text, '流式讲解')
    })

    assert.ok(requests.some((body) => body.stream === true))
  } finally {
    await cleanup()
  }
})

test('streamOpenAICompatibleChat emits visible deltas as they arrive', async () => {
  const { streamOpenAICompatibleChat, cleanup } = await importProviderForTest()
  const chunks = []
  try {
    await withMockChatServer((body) => {
      assert.equal(body.stream, true)
      return {
        payload: [
          'data: {"choices":[{"delta":{"content":"第一段"},"finish_reason":null}]}',
          'data: {"choices":[{"delta":{"content":"，继续"},"finish_reason":null}]}',
          'data: [DONE]',
          ''
        ].join('\n\n')
      }
    }, async (baseUrl) => {
      const text = await streamOpenAICompatibleChat(settings(baseUrl), [{ role: 'user', content: '讲解当前手' }], 512, (delta) => chunks.push(delta))
      assert.equal(text, '第一段，继续')
    })

    assert.deepEqual(chunks, ['第一段', '，继续'])
  } finally {
    await cleanup()
  }
})

test('does not retry empty responses caused by content filtering', async () => {
  const { postOpenAICompatibleChat, cleanup } = await importProviderForTest()
  let calls = 0
  try {
    await withMockChatServer(() => {
      calls += 1
      return {
        payload: {
          choices: [{ finish_reason: 'content_filter', message: { content: '' } }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        }
      }
    }, async (baseUrl) => {
      await assert.rejects(
        postOpenAICompatibleChat(settings(baseUrl), [{ role: 'user', content: 'hello' }], 128),
        /finish_reason=content_filter/
      )
    })

    assert.equal(calls, 1)
  } finally {
    await cleanup()
  }
})
