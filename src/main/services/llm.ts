import type { AppSettings, LlmSettingsTestRequest, LlmSettingsTestResult } from '@main/lib/types'
import { getSettings } from '@main/lib/store'

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzK4wAAAABJRU5ErkJggg=='

interface ChatChoice {
  finish_reason?: string | null
  native_finish_reason?: string | null
  text?: string
  message?: {
    content?: ChatMessageContent
    refusal?: string | null
    reasoning_content?: string | null
    tool_calls?: unknown[]
  }
}

type ChatContentPart =
  | string
  | {
      type?: string
      text?: string | { value?: string }
      content?: string
    }

type ChatMessageContent = string | ChatContentPart[] | null

interface ChatResponse {
  choices?: ChatChoice[]
  output_text?: string
  output?: Array<{
    content?: ChatContentPart[]
  }>
  usage?: unknown
}

interface ChatBody {
  model: string
  messages: unknown[]
  temperature?: number
  max_completion_tokens?: number
  max_tokens?: number
  reasoning_effort?: 'low'
}

interface RequestVariant {
  label: string
  body: ChatBody
}

function isReasoningModel(model: string): boolean {
  return /(^|[-_.:/])gpt-5($|[-_.:/])|^o\d|[-_.:/]o\d|reason|r1/i.test(model)
}

function textFromPart(part: ChatContentPart): string {
  if (typeof part === 'string') {
    return part
  }
  if (typeof part.text === 'string') {
    return part.text
  }
  if (part.text && typeof part.text.value === 'string') {
    return part.text.value
  }
  if (typeof part.content === 'string') {
    return part.content
  }
  return ''
}

function textFromContent(content: ChatMessageContent | undefined): string {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content.map(textFromPart).join('\n').trim()
  }
  return ''
}

function extractText(json: ChatResponse): string {
  const choice = json.choices?.[0]
  const messageText = textFromContent(choice?.message?.content)
  if (messageText) {
    return messageText
  }
  if (typeof choice?.text === 'string' && choice.text.trim()) {
    return choice.text.trim()
  }
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim()
  }
  const outputText = json.output
    ?.flatMap((item) => item.content ?? [])
    .map(textFromPart)
    .join('\n')
    .trim()
  return outputText ?? ''
}

function formatUsage(usage: unknown): string {
  if (!usage || typeof usage !== 'object') {
    return '无 usage'
  }
  const compact: Record<string, unknown> = {}
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens', 'output_tokens'] as const) {
    const value = (usage as Record<string, unknown>)[key]
    if (typeof value === 'number') {
      compact[key] = value
    }
  }
  const details = (usage as Record<string, unknown>).completion_tokens_details
  if (details && typeof details === 'object') {
    const reasoningTokens = (details as Record<string, unknown>).reasoning_tokens
    if (typeof reasoningTokens === 'number') {
      compact.reasoning_tokens = reasoningTokens
    }
  }
  return Object.keys(compact).length ? JSON.stringify(compact) : 'usage 格式未知'
}

function completionTokenCount(usage: unknown): number | null {
  if (!usage || typeof usage !== 'object') {
    return null
  }
  for (const key of ['completion_tokens', 'output_tokens'] as const) {
    const value = (usage as Record<string, unknown>)[key]
    if (typeof value === 'number') {
      return value
    }
  }
  return null
}

function finishReason(json: ChatResponse): string {
  return String(json.choices?.[0]?.finish_reason ?? json.choices?.[0]?.native_finish_reason ?? 'unknown')
}

function hasToolCall(json: ChatResponse): boolean {
  return Boolean(json.choices?.[0]?.message?.tool_calls && json.choices[0]?.message?.tool_calls?.length)
}

function shouldRetryEmpty(json: ChatResponse, budget: number): boolean {
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

function emptyResponseError(json: ChatResponse, model: string): Error {
  const choice = json.choices?.[0]
  const diagnostics = [
    `finish_reason=${finishReason(json)}`,
    formatUsage(json.usage)
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

function requestVariants(model: string, messages: unknown[], maxTokens: number): RequestVariant[] {
  const base = { model, messages }
  const reasoning = isReasoningModel(model)
  const variants: RequestVariant[] = reasoning
    ? [
        { label: 'max_completion_tokens+reasoning_effort', body: { ...base, max_completion_tokens: maxTokens, reasoning_effort: 'low' } },
        { label: 'max_completion_tokens', body: { ...base, max_completion_tokens: maxTokens } },
        { label: 'max_tokens', body: { ...base, max_tokens: maxTokens } }
      ]
    : [
        { label: 'max_completion_tokens+temperature', body: { ...base, temperature: 0.25, max_completion_tokens: maxTokens } },
        { label: 'max_tokens+temperature', body: { ...base, temperature: 0.25, max_tokens: maxTokens } },
        { label: 'max_tokens', body: { ...base, max_tokens: maxTokens } }
      ]

  const seen = new Set<string>()
  return variants.filter((variant) => {
    const key = JSON.stringify(variant.body)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function retryableBodyError(text: string): boolean {
  return /max_completion_tokens|max_tokens|temperature|reasoning_effort|unsupported|unrecognized|unknown parameter/i.test(text)
}

function expandedTokenBudget(maxTokens: number): number {
  return Math.min(Math.max(maxTokens * 2, maxTokens + 1024), 8192)
}

async function postChat(
  settings: Pick<AppSettings, 'llmBaseUrl' | 'llmApiKey' | 'llmModel'>,
  messages: unknown[],
  maxTokens: number
): Promise<string> {
  const endpoint = `${settings.llmBaseUrl.replace(/\/$/, '')}/chat/completions`
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.llmApiKey}`
  }
  const budgets = [maxTokens, expandedTokenBudget(maxTokens)].filter((value, index, values) => values.indexOf(value) === index)
  let lastRetryableError = ''
  let lastEmptyResponse: ChatResponse | null = null

  for (const budget of budgets) {
    for (const variant of requestVariants(settings.llmModel, messages, budget)) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(variant.body),
        signal: AbortSignal.timeout(180_000)
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        if (response.status === 400 && retryableBodyError(text)) {
          lastRetryableError = `${response.status} ${text.slice(0, 240)}`
          continue
        }
        throw new Error(`LLM 请求失败: ${response.status} ${text.slice(0, 240)}`)
      }

      const json = (await response.json()) as ChatResponse
      const content = extractText(json)
      if (content) {
        return content
      }
      lastEmptyResponse = json
      if (budget < budgets[budgets.length - 1] && shouldRetryEmpty(json, budget)) {
        break
      }
      throw emptyResponseError(json, settings.llmModel)
    }
  }

  if (lastEmptyResponse) {
    throw emptyResponseError(lastEmptyResponse, settings.llmModel)
  }
  throw new Error(`LLM 请求失败: ${lastRetryableError || '请求参数不被当前 OpenAI-compatible 服务接受'}`)
}

export async function callMultimodalTeacher(
  settings: AppSettings,
  systemPrompt: string,
  textPayload: string,
  imageDataUrl: string
): Promise<string> {
  if (!settings.llmBaseUrl.trim() || !settings.llmApiKey.trim() || !settings.llmModel.trim()) {
    throw new Error('请先配置多模态 LLM API')
  }

  return postChat(settings, [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: textPayload },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ]
    }
  ], 4096)
}

export async function callTeacherText(
  settings: AppSettings,
  systemPrompt: string,
  textPayload: string
): Promise<string> {
  if (!settings.llmBaseUrl.trim() || !settings.llmApiKey.trim() || !settings.llmModel.trim()) {
    throw new Error('请先配置多模态 LLM API')
  }

  return postChat(settings, [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: textPayload
    }
  ], 4096)
}

export async function testLlmSettings(payload: LlmSettingsTestRequest): Promise<LlmSettingsTestResult> {
  try {
    const saved = getSettings()
    const text = await postChat({
      llmBaseUrl: payload.llmBaseUrl.trim() || saved.llmBaseUrl,
      llmApiKey: payload.llmApiKey.trim() || saved.llmApiKey,
      llmModel: payload.llmModel.trim() || saved.llmModel
    }, [
      {
        role: 'user',
        content: [
          { type: 'text', text: '请只回答 OK，确认你能读取图片输入。' },
          { type: 'image_url', image_url: { url: tinyPng } }
        ]
      }
    ], 512)
    return {
      ok: /ok/i.test(text),
      message: /ok/i.test(text) ? '多模态模型连接成功。' : `模型有返回，但未按图片测试预期回答: ${text}`
    }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
}
