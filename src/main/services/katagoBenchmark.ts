import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { basename, join } from 'node:path'
import { appHome, getSettings, setSettings } from '@main/lib/store'
import type { AppSettings, KataGoBenchmarkRequest, KataGoBenchmarkResult, KataGoBenchmarkThreadResult } from '@main/lib/types'
import { resolveKataGoRuntime } from './katagoRuntime'

function saneInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !value) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.round(value)))
}

function benchmarkThreadCandidates(requested?: number[]): number[] {
  if (requested?.length) {
    return [...new Set(requested.map((value) => saneInteger(value, 1, 1, 64)))].sort((a, b) => a - b)
  }
  const cpuCount = Math.max(1, os.cpus().length)
  const maxThreads = Math.min(Math.max(2, cpuCount), 16)
  return [...new Set([1, 2, 4, 6, 8, 12, 16, cpuCount].filter((value) => value <= maxThreads && value >= 1))]
    .sort((a, b) => a - b)
}

function writeBenchmarkConfig(settings: AppSettings): string {
  const configDir = join(appHome, 'katago', 'configs')
  const logDir = join(appHome, 'katago', 'logs')
  mkdirSync(configDir, { recursive: true })
  mkdirSync(logDir, { recursive: true })
  const configPath = join(configDir, 'benchmark_builtin.cfg')
  const currentThreads = saneInteger(settings.katagoBenchmarkThreads, settings.katagoAnalysisThreads || 2, 1, 64)
  const cacheSizePowerOfTwo = saneInteger(settings.katagoCacheSizePowerOfTwo, 20, 16, 28)
  writeFileSync(
    configPath,
    [
      `logDir = ${logDir}`,
      'logAllRequests = false',
      'logSearchInfo = false',
      `numSearchThreads = ${currentThreads}`,
      `nnCacheSizePowerOfTwo = ${cacheSizePowerOfTwo}`,
      ''
    ].join('\n'),
    'utf8'
  )
  return configPath
}

function runBenchmarkCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      child.kill()
      reject(new Error(`KataGo benchmark 超时。\n${tail(output)}`))
    }, timeoutMs)

    child.once('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.once('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (code !== 0 && code !== null) {
        reject(new Error(tail(output) || `KataGo benchmark exited with ${code}`))
        return
      }
      resolve(output)
    })
  })
}

function parseBenchmarkOutput(output: string): { results: KataGoBenchmarkThreadResult[]; recommendedThreads?: number } {
  const normalized = output.replace(/\r/g, '\n')
  const byThread = new Map<number, KataGoBenchmarkThreadResult>()
  for (const line of normalized.split('\n')) {
    const match = line.match(/numSearchThreads\s*=\s*(\d+):.*?visits\/s\s*=\s*([0-9]+(?:\.[0-9]+)?)/)
    if (!match) {
      continue
    }
    const threads = Number.parseInt(match[1], 10)
    const visitsPerSecond = Number.parseFloat(match[2])
    if (Number.isFinite(threads) && Number.isFinite(visitsPerSecond)) {
      byThread.set(threads, { threads, visitsPerSecond })
    }
  }

  const recommendedMatches = [...normalized.matchAll(/numSearchThreads\s*=\s*(\d+):[^\n]*\(recommended\)/g)]
  const recommendedThreads = recommendedMatches.length
    ? Number.parseInt(recommendedMatches[recommendedMatches.length - 1][1], 10)
    : undefined

  return {
    results: [...byThread.values()].sort((a, b) => a.threads - b.threads),
    recommendedThreads: Number.isFinite(recommendedThreads) ? recommendedThreads : undefined
  }
}

function tunedSettings(recommendedThreads: number, visitsPerSecond: number): Pick<
  AppSettings,
  | 'katagoAnalysisThreads'
  | 'katagoSearchThreadsPerAnalysisThread'
  | 'katagoMaxBatchSize'
  | 'katagoCacheSizePowerOfTwo'
  | 'katagoBenchmarkThreads'
  | 'katagoBenchmarkVisitsPerSecond'
  | 'katagoBenchmarkUpdatedAt'
> {
  const analysisThreads = Math.max(1, Math.min(4, recommendedThreads))
  const searchThreadsPerAnalysisThread = Math.max(1, Math.round(recommendedThreads / analysisThreads))
  const maxBatchSize = Math.max(16, Math.min(128, recommendedThreads >= 12 ? 64 : 32))
  return {
    katagoAnalysisThreads: analysisThreads,
    katagoSearchThreadsPerAnalysisThread: searchThreadsPerAnalysisThread,
    katagoMaxBatchSize: maxBatchSize,
    katagoCacheSizePowerOfTwo: 20,
    katagoBenchmarkThreads: recommendedThreads,
    katagoBenchmarkVisitsPerSecond: visitsPerSecond,
    katagoBenchmarkUpdatedAt: new Date().toISOString()
  }
}

function tail(text: string, maxLines = 36): string {
  return text.replace(/\r/g, '\n').split('\n').slice(-maxLines).join('\n').trim()
}

export async function benchmarkKataGo(request: KataGoBenchmarkRequest = {}): Promise<KataGoBenchmarkResult> {
  const settings = getSettings()
  const runtime = resolveKataGoRuntime(settings)
  if (!runtime.ready) {
    throw new Error(`${runtime.status}: ${runtime.notes.join('；')}`)
  }

  const benchmarkConfig = writeBenchmarkConfig(settings)
  const visits = saneInteger(request.visits, 160, 16, 2000)
  const numPositions = saneInteger(request.numPositions, 4, 1, 20)
  const secondsPerMove = saneInteger(request.secondsPerMove, 5, 1, 60)
  const threadCandidates = benchmarkThreadCandidates(request.threads)
  const args = [
    'benchmark',
    '-model',
    runtime.katagoModel,
    '-config',
    benchmarkConfig,
    '-v',
    String(visits),
    '-n',
    String(numPositions),
    '-time',
    String(secondsPerMove),
    '-t',
    threadCandidates.join(',')
  ]

  const output = await runBenchmarkCommand(runtime.katagoBin, args, Math.max(90_000, threadCandidates.length * numPositions * 12_000))
  const parsed = parseBenchmarkOutput(output)
  if (parsed.results.length === 0) {
    throw new Error(`KataGo benchmark 没有返回速度结果。\n${tail(output)}`)
  }

  const fastest = parsed.results.reduce((best, item) => item.visitsPerSecond > best.visitsPerSecond ? item : best, parsed.results[0])
  const recommended = parsed.recommendedThreads
    ? parsed.results.find((item) => item.threads === parsed.recommendedThreads) ?? fastest
    : fastest
  const next = tunedSettings(recommended.threads, recommended.visitsPerSecond)
  setSettings(next)

  return {
    recommendedThreads: recommended.threads,
    visitsPerSecond: recommended.visitsPerSecond,
    tested: parsed.results,
    analysisThreads: next.katagoAnalysisThreads,
    searchThreadsPerAnalysisThread: next.katagoSearchThreadsPerAnalysisThread,
    maxBatchSize: next.katagoMaxBatchSize,
    cacheSizePowerOfTwo: next.katagoCacheSizePowerOfTwo,
    command: `${basename(runtime.katagoBin)} ${args.map((arg) => arg.includes(' ') ? JSON.stringify(arg) : arg).join(' ')}`,
    outputTail: tail(output),
    updatedAt: next.katagoBenchmarkUpdatedAt
  }
}
