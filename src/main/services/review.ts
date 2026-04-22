import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findGame, getSettings, reviewsDir } from '@main/lib/store'
import type { ReviewArtifact, ReviewRequest, ReviewResult } from '@main/lib/types'
import { resolveKataGoRuntime } from './katagoRuntime'
import { ensurePythonRuntime } from './pythonRuntime'

interface PythonReviewOutput {
  markdown_path: string
  json_path: string
  summary: Record<string, unknown>
}

export async function runReview(request: ReviewRequest): Promise<ReviewResult> {
  const game = findGame(request.gameId)
  if (!game) {
    throw new Error('找不到要复盘的棋谱')
  }

  const settings = getSettings()
  const runtime = resolveKataGoRuntime(settings)
  if (!runtime.ready) {
    throw new Error(`${runtime.status}: ${runtime.notes.join('；')}`)
  }
  const pythonBin = await ensurePythonRuntime(process.cwd())
  const reviewRoot = join(reviewsDir, game.id)
  mkdirSync(reviewRoot, { recursive: true })

  const args = [
    join(process.cwd(), 'scripts', 'review_game.py'),
    '--sgf',
    game.filePath,
    '--out-dir',
    reviewRoot,
    '--katago-bin',
    runtime.katagoBin,
    '--katago-config',
    runtime.katagoConfig,
    '--katago-model',
    runtime.katagoModel,
    '--player-name',
    request.playerName.trim() || settings.defaultPlayerName.trim() || game.black,
    '--max-visits',
    String(request.maxVisits),
    '--min-winrate-drop',
    String(request.minWinrateDrop),
    '--language',
    settings.reviewLanguage
  ]

  if (request.useLlm !== false && settings.llmApiKey.trim()) {
    args.push('--llm-base-url', settings.llmBaseUrl.trim())
    args.push('--llm-api-key', settings.llmApiKey.trim())
    args.push('--llm-model', settings.llmModel.trim())
  }

  const output = await new Promise<PythonReviewOutput>((resolve, reject) => {
    const child = spawn(pythonBin || settings.pythonBin || 'python3', args, {
      cwd: process.cwd(),
      env: { ...process.env }
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `review_game.py exited with ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as PythonReviewOutput)
      } catch (error) {
        reject(new Error(`无法解析复盘输出: ${String(error)}\n${stdout}`))
      }
    })
  })

  const artifact: ReviewArtifact = {
    markdown: readFileSync(output.markdown_path, 'utf8'),
    markdownPath: output.markdown_path,
    jsonPath: output.json_path,
    summary: output.summary
  }

  return {
    game,
    status: 'done',
    artifact
  }
}
