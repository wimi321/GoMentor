import {
  completionTokenCount,
  extractText,
  finishReason,
  formatUsage,
  hasToolCall,
  responseShapeDiagnostics,
  type ChatChoice,
  type ChatResponse
} from '../llmResponse'
import type { ChatInput, ChatMessage, ChatResult, LlmProvider, ProviderProbeResult, ProviderSettings } from './provider'

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAeklEQVR42u3SMQ0AIAwAwcrBAQ7wLwEHTMxtsEFv+vmTi7Fm3rOza6Pz/GsQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQ8EELinI6hhXFUGQAAAAASUVORK5CYII='

function endpoint(settings: ProviderSettings): string {
  return `${settings.llmBaseUrl.replace(/\/$/, '')}/chat/completions`
}

function headers(settings: ProviderSettings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.llmApiKey}`
  }
}

function isReasoningModel(model: string): boolean {
  return /(^|[-_.:/])gpt-5($|[-_.:/])|^o\d|[-_.:/]o\d|claude|reason|r1/i.test(model)
}

function requestBodies(model: string, messages: ChatMessage[], maxTokens: number): Array<Record<string, unknown>> {
  const base = { model, messages }
  const reasoning = isReasoningModel(model)
  const variants = reasoning
    ? [
        { ...base, max_completion_tokens: maxTokens, reasoning_effort: 'low' },
        { ...base, max_completion_tokens: maxTokens, modalities: ['text'] },
        { ...base, max_completion_tokens: maxTokens },
        { ...base, max_tokens: maxTokens }
      ]
    : [
        { ...base, temperature: 0.25, max_completion_tokens: maxTokens },
        { ...base, temperature: 0.25, max_tokens: maxTokens },
        { ...base, max_tokens: maxTokens }
      ]
  const seen = new Set<string>()
  return variants.filter((body) => {
    const key = JSON.stringify(body)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function retryableParameterError(status: number, text: string): boolean {
  return status === 400 && /max_completion_tokens|max_tokens|temperature|reasoning_effort|modalities|unsupported|unknown parameter|unrecognized/i.test(text)
}

function shouldRetryBudgetAfterEmpty(json: ChatResponse, budget: number): boolean {
  const reason = finishReason(json).toLowerCase()
  if (/length|max.?tokens/.test(reason)) {
    return true
  }
  if (reason === 'stop' || reason === 'content_filter' || hasToolCall(json)) {
    return false
  }
  const used = completionTokenCount(json.usage)
  return used !== null && used >= Math.floor(budget * 0.9)
}

function shouldRetryFinalTextAfterEmpty(json: ChatResponse): boolean {
  const reason = finishReason(json).toLowerCase()
  if (reason === 'content_filter' || hasToolCall(json)) {
    return false
  }
  const used = completionTokenCount(json.usage)
  return used !== null && used > 0
}

function messagesWithFinalTextReminder(messages: ChatMessage[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '重要：本接口只接收最终可展示文本。',
        '必须把答案写入普通 message.content。',
        '不要只返回 reasoning_content、tool_calls、空 content 或隐藏推理。'
      ].join('\n')
    },
    ...messages,
    {
      role: 'user',
      content: [
        '上一次请求没有返回可展示给学生的最终文本。',
        '请直接输出最终中文讲解，并确保最终文本出现在普通 content 字段中。',
        '不要只返回 reasoning、tool_calls、空 content 或调试信息。',
        '如果需要结构化结果，请仍然按系统要求输出完整结果。'
      ].join('\n')
    }
  ]
}

function emptyResponseError(json: ChatResponse, model: string): Error {
  const choice = json.choices?.[0]
  const diagnostics = [
    `finish_reason=${finishReason(json)}`,
    formatUsage(json.usage),
    responseShapeDiagnostics(json)
  ]
  if (choice?.message?.refusal) {
    diagnostics.push(`refusal=${choice.message.refusal.slice(0, 120)}`)
  }
  if (choice?.message?.reasoning_content && !choice.message.content) {
    diagnostics.push('仅返回了 reasoning_content，没有最终讲解文本')
  }
  if (hasToolCall(json)) {
    diagnostics.push('模型返回了 tool_calls，但当前接口需要最终自然语言文本')
  }
  return new Error(`LLM 没有返回文本内容（model=${model}，${diagnostics.join('，')}）。如果 finish_reason 是 length，说明输出预算被推理过程耗尽。`)
}

type ChatAttemptResult =
  | { kind: 'text'; text: string }
  | { kind: 'empty'; json: ChatResponse }
  | { kind: 'error'; error: Error }

async function attemptOpenAICompatibleChat(
  settings: ProviderSettings,
  messages: ChatMessage[],
  maxTokens = 4096
): Promise<ChatAttemptResult> {
  let lastError = ''
  let lastEmptyResponse: ChatResponse | null = null
  const budgets = Array.from(new Set([maxTokens, Math.min(Math.max(maxTokens * 2, maxTokens + 1024), 8192)]))
  for (const budget of budgets) {
    const bodies = requestBodies(settings.llmModel, messages, budget)
    for (const [index, body] of bodies.entries()) {
      const response = await fetch(endpoint(settings), {
        method: 'POST',
        headers: headers(settings),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000)
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        if (retryableParameterError(response.status, text)) {
          lastError = `${response.status} ${text.slice(0, 240)}`
          continue
        }
        return { kind: 'error', error: new Error(`LLM 请求失败: ${response.status} ${text.slice(0, 240)}`) }
      }
      const json = (await response.json()) as ChatResponse
      const text = extractText(json)
      if (text) {
        return { kind: 'text', text }
      }
      lastEmptyResponse = json
      lastError = `empty response: finish_reason=${finishReason(json)} ${formatUsage(json.usage)}`
      if (budget < budgets[budgets.length - 1] && shouldRetryBudgetAfterEmpty(json, budget)) {
        break
      }
      return { kind: 'empty', json }
    }
  }
  if (lastEmptyResponse) {
    return { kind: 'empty', json: lastEmptyResponse }
  }
  return { kind: 'error', error: new Error(`LLM 没有返回文本内容。${lastError}`) }
}

function streamDeltaText(json: ChatResponse): string {
  const choice = json.choices?.[0] as (ChatChoice & {
    delta?: {
      content?: unknown
      text?: unknown
      output_text?: unknown
    }
  }) | undefined
  const delta = choice?.delta
  for (const value of [delta?.content, delta?.text, delta?.output_text, choice?.text, choice?.message?.content, json.output_text]) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return ''
}

async function readStreamText(response: Response): Promise<string> {
  if (!response.body) {
    return ''
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) {
        continue
      }
      const payload = trimmed.replace(/^data:\s*/, '')
      if (!payload || payload === '[DONE]') {
        continue
      }
      try {
        text += streamDeltaText(JSON.parse(payload) as ChatResponse)
      } catch {
        // Ignore malformed SSE keepalive chunks from compatible proxies.
      }
    }
  }
  return text.trim()
}

async function attemptOpenAICompatibleStream(
  settings: ProviderSettings,
  messages: ChatMessage[],
  maxTokens = 4096
): Promise<ChatAttemptResult> {
  let lastError = ''
  const bodies = requestBodies(settings.llmModel, messages, maxTokens)
  for (const body of bodies) {
    const response = await fetch(endpoint(settings), {
      method: 'POST',
      headers: headers(settings),
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(180_000)
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      if (retryableParameterError(response.status, text)) {
        lastError = `${response.status} ${text.slice(0, 240)}`
        continue
      }
      return { kind: 'error', error: new Error(`LLM 流式请求失败: ${response.status} ${text.slice(0, 240)}`) }
    }
    const text = await readStreamText(response)
    if (text) {
      return { kind: 'text', text }
    }
    lastError = 'stream completed without visible content'
  }
  return { kind: 'error', error: new Error(`LLM 流式请求没有返回文本内容。${lastError}`) }
}

export async function postOpenAICompatibleChat(
  settings: ProviderSettings,
  messages: ChatMessage[],
  maxTokens = 4096
): Promise<string> {
  const firstAttempt = await attemptOpenAICompatibleChat(settings, messages, maxTokens)
  if (firstAttempt.kind === 'text') {
    return firstAttempt.text
  }
  if (firstAttempt.kind === 'error') {
    throw firstAttempt.error
  }

  if (shouldRetryFinalTextAfterEmpty(firstAttempt.json)) {
    const finalTextMessages = messagesWithFinalTextReminder(messages)
    const finalTextAttempt = await attemptOpenAICompatibleChat(settings, finalTextMessages, maxTokens)
    if (finalTextAttempt.kind === 'text') {
      return finalTextAttempt.text
    }
    if (finalTextAttempt.kind === 'error') {
      const streamAttempt = await attemptOpenAICompatibleStream(settings, finalTextMessages, maxTokens)
      if (streamAttempt.kind === 'text') {
        return streamAttempt.text
      }
      throw finalTextAttempt.error
    }
    const streamAttempt = await attemptOpenAICompatibleStream(settings, finalTextMessages, maxTokens)
    if (streamAttempt.kind === 'text') {
      return streamAttempt.text
    }
    throw emptyResponseError(finalTextAttempt.json, settings.llmModel)
  }

  throw emptyResponseError(firstAttempt.json, settings.llmModel)
}

export async function probeOpenAICompatibleProvider(settings: ProviderSettings): Promise<ProviderProbeResult> {
  if (!settings.llmBaseUrl.trim() || !settings.llmApiKey.trim() || !settings.llmModel.trim()) {
    return {
      ok: false,
      message: 'Claude 兼容代理未配置。',
      supportsImage: false
    }
  }
  try {
    const text = await postOpenAICompatibleChat(settings, [
      {
        role: 'system',
        content: [
          '你正在执行多模态连接测试。',
          '必须在最终可见 content 中只输出 OK 两个字母。',
          '不要调用工具，不要输出解释，不要只写隐藏推理。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请读取这张测试图片，并在最终答案中只输出 OK。' },
          { type: 'image_url', image_url: { url: tinyPng } }
        ]
      }
    ], 2048)
    return {
      ok: /ok/i.test(text),
      message: /ok/i.test(text) ? 'Claude 兼容代理连接成功，图片输入可用。' : `代理有返回，但未按预期回答: ${text}`,
      supportsImage: /ok/i.test(text)
    }
  } catch (error) {
    return {
      ok: false,
      message: 'Claude 兼容代理测试失败。',
      supportsImage: false,
      technicalDetail: String(error)
    }
  }
}

export async function chatOpenAICompatible(input: ChatInput): Promise<ChatResult> {
  const text = await postOpenAICompatibleChat(input.settings, input.messages, input.maxTokens ?? 4096)
  return { text }
}

export const openAICompatibleProvider: LlmProvider = {
  id: 'openai-compatible',
  label: 'OpenAI-compatible multimodal proxy',
  probe: probeOpenAICompatibleProvider,
  chat: chatOpenAICompatible
}
