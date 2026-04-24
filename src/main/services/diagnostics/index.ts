import { constants } from 'node:fs'
import { access, mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { appHome, getSettings, hasLlmApiKey } from '@main/lib/store'
import { resolveKataGoRuntime } from '../katagoRuntime'
import { probeOpenAICompatibleProvider } from '../llm/openaiCompatibleProvider'
import { inspectKataGoAssets } from '../katago/katagoAssets'
import type { DiagnosticCheck, DiagnosticsReport, DiagnosticsOverall } from './types'

function isReleaseRuntime(): boolean {
  return !process.env.ELECTRON_RENDERER_URL
}

async function checkWritableHome(): Promise<DiagnosticCheck> {
  try {
    await mkdir(appHome, { recursive: true })
    const probePath = join(appHome, '.katasensei-write-test')
    await writeFile(probePath, 'ok', 'utf8')
    await unlink(probePath)
    return {
      id: 'app-home-writable',
      title: '用户数据目录',
      status: 'pass',
      required: true,
      detail: `可写: ${appHome}`
    }
  } catch (error) {
    return {
      id: 'app-home-writable',
      title: '用户数据目录',
      status: 'fail',
      required: true,
      detail: '应用无法写入用户数据目录，棋谱、画像和报告无法保存。',
      action: '请检查目录权限，或把应用安装到有权限的位置。',
      technicalDetail: String(error)
    }
  }
}

async function checkKatagoBinary(): Promise<DiagnosticCheck> {
  const runtime = resolveKataGoRuntime(getSettings())
  const required = isReleaseRuntime()
  if (!runtime.katagoBin) {
    return {
      id: 'katago-binary',
      title: 'KataGo 引擎',
      status: required ? 'fail' : 'warn',
      required,
      detail: '未找到内置或本机 KataGo 引擎。',
      action: required
        ? '请确认安装包包含 data/katago/bin/<platform>-<arch>/katago。'
        : '开发环境可稍后运行 scripts/prepare_katago_assets.mjs 或使用系统 KataGo。'
    }
  }
  try {
    await access(runtime.katagoBin, constants.X_OK)
  } catch (error) {
    // Windows does not use POSIX executable bits; existence is enough there.
    if (process.platform !== 'win32') {
      return {
        id: 'katago-binary',
        title: 'KataGo 引擎',
        status: required ? 'fail' : 'warn',
        required,
        detail: `找到 ${basename(runtime.katagoBin)}，但没有执行权限。`,
        action: 'macOS/Linux 下请确保内置 katago 文件有可执行权限。',
        technicalDetail: String(error)
      }
    }
  }
  return {
    id: 'katago-binary',
    title: 'KataGo 引擎',
    status: 'pass',
    required,
    detail: `已找到: ${basename(runtime.katagoBin)}`
  }
}

async function checkKatagoModel(): Promise<DiagnosticCheck> {
  const runtime = resolveKataGoRuntime(getSettings())
  const required = isReleaseRuntime()
  if (!runtime.katagoModel) {
    return {
      id: 'katago-model',
      title: 'KataGo 默认模型',
      status: required ? 'fail' : 'warn',
      required,
      detail: '未找到默认 KataGo 模型。',
      action: required
        ? 'P0 安装包应该内置 b18 默认模型；请确认 data/katago/models 中存在默认模型文件。'
        : '开发环境可先保留 manifest，通过资源准备脚本或 CI release artifact 注入模型。'
    }
  }
  return {
    id: 'katago-model',
    title: 'KataGo 默认模型',
    status: 'pass',
    required,
    detail: `已找到: ${basename(runtime.katagoModel)}`
  }
}

async function checkBundledKataGoAssets(): Promise<DiagnosticCheck> {
  const status = await inspectKataGoAssets()
  const required = isReleaseRuntime()
  if (status.ready) {
    return {
      id: 'katago-assets',
      title: '内置 KataGo 资源',
      status: 'pass',
      required,
      detail: status.detail
    }
  }
  return {
    id: 'katago-assets',
    title: '内置 KataGo 资源',
    status: required ? 'fail' : 'warn',
    required,
    detail: status.detail,
    action: required
      ? '请重新安装完整安装包，或检查 data/katago 资源是否损坏。'
      : '开发环境可通过 scripts/prepare_katago_assets.mjs 准备资源。'
  }
}

async function checkLlmProxy(): Promise<DiagnosticCheck> {
  const settings = getSettings()
  const configured = Boolean(settings.llmBaseUrl.trim() && (settings.llmApiKey.trim() || hasLlmApiKey()) && settings.llmModel.trim())
  if (!configured) {
    return {
      id: 'llm-proxy',
      title: 'Claude 兼容代理',
      status: 'warn',
      required: false,
      detail: '还没有配置 Claude 兼容代理。KataGo 基础分析可用，但老师讲解不可用。',
      action: '在设置中填写 Base URL、API Key 和 Claude 模型名。'
    }
  }
  const result = await probeOpenAICompatibleProvider({
    llmBaseUrl: settings.llmBaseUrl,
    llmApiKey: settings.llmApiKey,
    llmModel: settings.llmModel
  })
  return {
    id: 'llm-proxy',
    title: 'Claude 兼容代理',
    status: result.ok ? 'pass' : 'warn',
    required: false,
    detail: result.message,
    action: result.ok ? undefined : '请检查代理是否启动、API Key 是否正确、模型是否支持图片输入。',
    technicalDetail: result.technicalDetail
  }
}

function summarize(checks: DiagnosticCheck[]): Pick<DiagnosticsReport, 'overall' | 'summary'> {
  const failedRequired = checks.filter((check) => check.required && check.status === 'fail')
  if (failedRequired.length > 0) {
    return {
      overall: 'blocked',
      summary: `有 ${failedRequired.length} 个必需项未通过，暂时无法进行完整复盘。`
    }
  }
  const warnings = checks.filter((check) => check.status === 'warn' || check.status === 'fail')
  if (warnings.length > 0) {
    return {
      overall: 'fixable',
      summary: `基础功能可用，但还有 ${warnings.length} 项建议处理。`
    }
  }
  return {
    overall: 'ready',
    summary: 'KataSensei 已准备好开始复盘。'
  }
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const checks = await Promise.all([
    checkWritableHome(),
    checkBundledKataGoAssets(),
    checkKatagoBinary(),
    checkKatagoModel(),
    checkLlmProxy()
  ])
  const result = summarize(checks)
  return {
    ...result,
    generatedAt: new Date().toISOString(),
    checks
  }
}

export type { DiagnosticCheck, DiagnosticsOverall, DiagnosticsReport }
