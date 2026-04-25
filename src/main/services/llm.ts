import type { AppSettings, LlmSettingsTestRequest, LlmSettingsTestResult } from '@main/lib/types'
import { getSettings } from '@main/lib/store'
import { postOpenAICompatibleChat, probeOpenAICompatibleProvider, streamOpenAICompatibleChat } from './llm/openaiCompatibleProvider'
import type { ChatMessage, ProviderSettings } from './llm/provider'

type LlmDeltaHandler = (delta: string) => void

function requireProviderSettings(settings: AppSettings): ProviderSettings {
  if (!settings.llmBaseUrl.trim() || !settings.llmApiKey.trim() || !settings.llmModel.trim()) {
    throw new Error('请先配置支持图片输入的 OpenAI-compatible 多模态 LLM 代理。')
  }
  return {
    llmBaseUrl: settings.llmBaseUrl,
    llmApiKey: settings.llmApiKey,
    llmModel: settings.llmModel
  }
}

export async function callMultimodalTeacher(
  settings: AppSettings,
  systemPrompt: string,
  textPayload: string,
  imageDataUrl: string,
  onDelta?: LlmDeltaHandler
): Promise<string> {
  const messages: ChatMessage[] = [
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
  ]
  const providerSettings = requireProviderSettings(settings)
  return onDelta
    ? streamOpenAICompatibleChat(providerSettings, messages, 4096, onDelta)
    : postOpenAICompatibleChat(providerSettings, messages, 4096)
}

export async function callTeacherText(
  settings: AppSettings,
  systemPrompt: string,
  textPayload: string,
  onDelta?: LlmDeltaHandler
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: textPayload
    }
  ]
  const providerSettings = requireProviderSettings(settings)
  return onDelta
    ? streamOpenAICompatibleChat(providerSettings, messages, 4096, onDelta)
    : postOpenAICompatibleChat(providerSettings, messages, 4096)
}

export async function testLlmSettings(payload: LlmSettingsTestRequest): Promise<LlmSettingsTestResult> {
  const saved = getSettings()
  const settings = {
    llmBaseUrl: payload.llmBaseUrl.trim() || saved.llmBaseUrl,
    llmApiKey: payload.llmApiKey.trim() || saved.llmApiKey,
    llmModel: payload.llmModel.trim() || saved.llmModel
  }
  const result = await probeOpenAICompatibleProvider(settings)
  return {
    ok: result.ok,
    message: result.technicalDetail ? `${result.message} ${result.technicalDetail}` : result.message
  }
}
