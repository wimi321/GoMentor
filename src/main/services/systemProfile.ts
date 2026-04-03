import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { AppSettings, SystemProfile } from '@main/lib/types'

const execFileAsync = promisify(execFile)

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function firstExisting(paths: string[]): Promise<string> {
  for (const path of paths) {
    if (await exists(path)) {
      return path
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

async function detectKatago(): Promise<Pick<SystemProfile, 'katagoBin' | 'katagoConfig' | 'katagoModel' | 'notes'>> {
  const notes: string[] = []
  let katagoBin = await firstExisting([
    '/opt/homebrew/bin/katago',
    '/usr/local/bin/katago',
    '/opt/local/bin/katago',
    '/usr/bin/katago',
  ])

  if (!katagoBin) {
    try {
      const { stdout } = await execFileAsync('/usr/bin/which', ['katago'])
      katagoBin = stdout.trim()
    } catch {
      notes.push('未在常见位置或 PATH 中找到 katago。')
    }
  }

  const home = os.homedir()
  const katagoConfig = await firstExisting([
    join(home, '.katago/configs/analysis_macmini_m4pro_fast.cfg'),
    join(home, '.katago/configs/analysis_example.cfg'),
    join(home, '.katago/configs/gtp_analysis_compat.cfg'),
    join(home, '.katago/gtp.cfg'),
  ])
  const katagoModel = await firstExisting([
    join(home, '.katago/models/latest-kata1.bin.gz'),
    join(home, '.katago/models/kata1-b28c512nbt-s12584338688-d5758872665.bin.gz'),
    join(home, 'Developer/lizzyzy-youhua/weights/default.bin.gz'),
  ])

  if (katagoBin) {
    notes.push(`检测到 KataGo: ${katagoBin}`)
  }
  if (katagoConfig) {
    notes.push(`检测到分析配置: ${katagoConfig}`)
  }
  if (katagoModel) {
    notes.push(`检测到模型: ${katagoModel}`)
  }

  return { katagoBin, katagoConfig, katagoModel, notes }
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

export async function detectSystemProfile(): Promise<SystemProfile> {
  const katago = await detectKatago()
  const proxy = await detectCliproxy()
  return {
    katagoBin: katago.katagoBin,
    katagoConfig: katago.katagoConfig,
    katagoModel: katago.katagoModel,
    proxyBaseUrl: proxy.proxyBaseUrl,
    proxyApiKey: proxy.proxyApiKey,
    proxyModels: proxy.proxyModels,
    notes: [...katago.notes, ...proxy.notes],
  }
}

export async function applyDetectedDefaults(settings: AppSettings): Promise<AppSettings> {
  const detected = await detectSystemProfile()
  const preferredModel =
    detected.proxyModels.find((model) => model === 'gpt-5-codex-mini') ||
    detected.proxyModels.find((model) => model === 'gpt-5') ||
    detected.proxyModels[0] ||
    settings.llmModel
  return {
    ...settings,
    katagoBin: settings.katagoBin || detected.katagoBin,
    katagoConfig: settings.katagoConfig || detected.katagoConfig,
    katagoModel: settings.katagoModel || detected.katagoModel,
    llmBaseUrl: settings.llmBaseUrl === 'https://api.openai.com/v1' && detected.proxyBaseUrl ? detected.proxyBaseUrl : settings.llmBaseUrl,
    llmApiKey: settings.llmApiKey || detected.proxyApiKey,
    llmModel:
      (settings.llmModel && settings.llmModel !== 'gpt-5-mini')
        ? settings.llmModel
        : preferredModel,
  }
}
