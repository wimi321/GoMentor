import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReleaseReadinessItem, ReleaseReadinessResult, ReleaseReadinessStatus } from '../../lib/types'

function item(id: string, label: string, status: ReleaseReadinessStatus, detail?: string): ReleaseReadinessItem {
  return { id, label, status, detail }
}

function aggregate(items: ReleaseReadinessItem[]): ReleaseReadinessStatus {
  if (items.some((entry) => entry.status === 'fail')) return 'fail'
  if (items.some((entry) => entry.status === 'warn')) return 'warn'
  if (items.some((entry) => entry.status === 'unknown')) return 'unknown'
  return 'pass'
}

export function inspectReleaseReadiness(projectRoot = process.cwd()): ReleaseReadinessResult {
  const requiredFiles = [
    'package.json',
    'data/knowledge/p0-cards.json',
    'data/katago/manifest.json',
    'scripts/check_katago_assets.mjs',
    'scripts/p0_beta_acceptance.mjs',
    'src/main/services/diagnostics/index.ts',
    'src/main/services/llm/openaiCompatibleProvider.ts',
    'src/main/services/studentProfile.ts',
    'src/main/services/teacherAgent.ts',
    'src/renderer/src/features/board/GoBoardV2.tsx',
    'src/renderer/src/features/teacher/TeacherRunCardPro.tsx'
  ]

  const items: ReleaseReadinessItem[] = requiredFiles.map((relativePath) => {
    const fullPath = join(projectRoot, relativePath)
    return existsSync(fullPath)
      ? item(relativePath, relativePath, 'pass')
      : item(relativePath, relativePath, 'fail', '缺少 P0 必备文件')
  })

  const katagoBinaryCandidates = [
    'data/katago/bin/darwin-arm64/katago',
    'data/katago/bin/darwin-x64/katago',
    'data/katago/bin/win32-x64/katago.exe'
  ]
  const presentBinaryCount = katagoBinaryCandidates.filter((relativePath) => existsSync(join(projectRoot, relativePath))).length
  items.push(
    presentBinaryCount > 0
      ? item('katago-binaries', 'KataGo 平台二进制', 'pass', `检测到 ${presentBinaryCount}/${katagoBinaryCandidates.length} 个候选二进制`)
      : item('katago-binaries', 'KataGo 平台二进制', 'warn', '源码仓库可不提交二进制，但 release 前必须通过 prepare assets 脚本准备')
  )

  const modelCandidates = [
    'data/katago/models/default.bin.gz',
    'data/katago/models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz'
  ]
  const hasModel = modelCandidates.some((relativePath) => existsSync(join(projectRoot, relativePath)))
  items.push(
    hasModel
      ? item('katago-model', 'KataGo 默认模型', 'pass')
      : item('katago-model', 'KataGo 默认模型', 'warn', '源码仓库可不提交模型，但 release 前必须准备默认模型')
  )

  return {
    status: aggregate(items),
    items
  }
}
