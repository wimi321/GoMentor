import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { AppSettings, SystemProfile } from '@main/lib/types'
import { hydrateKataGoSettings, KATAGO_MODEL_PRESETS, resolveKataGoRuntime } from './katagoRuntime'

const execFileAsync = promisify(execFile)

async function firstExisting(paths: string[]): Promise<string> {
  for (const path of paths) {
    try {
      await readFile(path)
      return path
    } catch {
      // Continue checking the remaining lightweight config candidates.
    }
  }
  return ''
}

function parseSimpleYamlValue(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'))
  return match?.[1]?.trim() ?? ''
}

function parseSimpleYamlListValue(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}:\\s*\\n\\s*-\\s*([^\\n]+)`, 'm'))
  return match?.[1]?.trim().replace(/^"|"$/g, '') ?? ''
}

async function detectCliproxy(): Promise<Pick<SystemProfile, 'proxyBaseUrl' | 'proxyApiKey' | 'proxyModels' | 'notes'>> {
  const notes: string[] = []
  let proxyBaseUrl = ''
  let proxyApiKey = ''
  let proxyModels: string[] = []
  const home = os.homedir()
  let configPath = ''

  try {
    const { stdout } = await execFileAsync('/bin/sh', [
      '-lc',
      "ps ax -o pid=,comm=,args= | grep cliproxyapi | grep -v grep | head -n 1",
    ])
    const line = stdout.trim()
    const configMatch =
      line.match(/(?:^|\s)--?config(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/) ??
      line.match(/(?:^|\s)-config(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/)
    configPath = configMatch?.[1] ?? configMatch?.[2] ?? configMatch?.[3] ?? ''
  } catch {
    notes.push('未检测到运行中的 cliproxyapi。')
  }

  if (!configPath) {
    configPath = await firstExisting([
      join(home, 'Developer/fixx/cliproxyapi-12auth.local.yaml'),
      join(home, '.config/cliproxyapi/config.yaml'),
      join(home, '.cliproxyapi/config.yaml'),
    ])
  }

  if (configPath) {
    try {
      const configText = await readFile(configPath, 'utf8')
      const host = parseSimpleYamlValue(configText, 'host') || '127.0.0.1'
      const port = parseSimpleYamlValue(configText, 'port') || '8317'
      proxyApiKey = parseSimpleYamlListValue(configText, 'api-keys')
      proxyBaseUrl = `http://${host}:${port}/v1`
      notes.push(`检测到 cliproxyapi: ${proxyBaseUrl}`)
      if (proxyApiKey) {
        notes.push('检测到本机代理 API key，可直接用于 LLM 讲解。')
      }
    } catch {
      notes.push(`检测到 cliproxy 配置文件，但读取失败: ${configPath}`)
    }
  }

  if (proxyBaseUrl && proxyApiKey) {
    try {
      const response = await fetch(`${proxyBaseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${proxyApiKey}`,
        },
      })
      if (response.ok) {
        const json = (await response.json()) as { data?: Array<{ id?: string }> }
        proxyModels = (json.data ?? []).map((item) => item.id ?? '').filter(Boolean)
        if (proxyModels.length > 0) {
          notes.push(`检测到 ${proxyModels.length} 个可用模型。`)
        }
      }
    } catch {
      notes.push('本机代理存在，但模型列表拉取失败。')
    }
  }

  return { proxyBaseUrl, proxyApiKey, proxyModels, notes }
}

export async function detectSystemProfile(settings?: AppSettings): Promise<SystemProfile> {
  const katago = resolveKataGoRuntime(settings)
  const proxy = await detectCliproxy()
  return {
    katagoBin: katago.katagoBin,
    katagoConfig: katago.katagoConfig,
    katagoModel: katago.katagoModel,
    katagoReady: katago.ready,
    katagoStatus: katago.status,
    katagoModelPreset: katago.modelPreset.id,
    katagoModelPresets: KATAGO_MODEL_PRESETS,
    proxyBaseUrl: proxy.proxyBaseUrl,
    proxyApiKey: proxy.proxyApiKey,
    proxyModels: proxy.proxyModels,
    hasLlmApiKey: false,
    notes: [...katago.notes, ...proxy.notes],
  }
}

export async function applyDetectedDefaults(settings: AppSettings): Promise<AppSettings> {
  const hydratedKatago = hydrateKataGoSettings(settings)
  const detected = await detectSystemProfile(hydratedKatago)
  const preferredModel =
    detected.proxyModels.find((model) => model === 'gpt-5-codex-mini') ||
    detected.proxyModels.find((model) => model === 'gpt-5') ||
    detected.proxyModels[0] ||
    settings.llmModel
  return {
    ...hydratedKatago,
    llmBaseUrl: settings.llmBaseUrl === 'https://api.openai.com/v1' && detected.proxyBaseUrl ? detected.proxyBaseUrl : settings.llmBaseUrl,
    llmApiKey: settings.llmApiKey || detected.proxyApiKey,
    llmModel:
      (settings.llmModel && settings.llmModel !== 'gpt-5-mini')
        ? settings.llmModel
        : preferredModel,
  }
}
