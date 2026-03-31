import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appHome } from '@main/lib/store'

const execFileAsync = promisify(execFile)

const runtimeRoot = join(appHome, 'runtime')
const venvRoot = join(runtimeRoot, 'venv')
const pythonPath = join(venvRoot, 'bin', 'python3')
const pipPath = join(venvRoot, 'bin', 'pip')
const stampPath = join(runtimeRoot, 'requirements.sha256')

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export async function ensurePythonRuntime(projectRoot: string): Promise<string> {
  await mkdir(runtimeRoot, { recursive: true })

  if (!(await pathExists(pythonPath))) {
    await execFileAsync('python3', ['-m', 'venv', venvRoot])
  }

  const requirementsPath = join(projectRoot, 'scripts', 'requirements.txt')
  const requirements = await readFile(requirementsPath, 'utf8')
  const digest = createHash('sha256').update(requirements).digest('hex')
  const installedDigest = (await pathExists(stampPath)) ? (await readFile(stampPath, 'utf8')).trim() : ''

  if (installedDigest !== digest) {
    await execFileAsync(pythonPath, ['-m', 'ensurepip', '--upgrade'])
    await execFileAsync(pipPath, ['install', '--upgrade', 'pip'])
    await execFileAsync(pipPath, ['install', '-r', requirementsPath])
    await writeFile(stampPath, `${digest}\n`, 'utf8')
  }

  return pythonPath
}
