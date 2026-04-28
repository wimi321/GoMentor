#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const electronBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzK4wAAAABJRU5ErkJggg=='

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolvePromise(address.port)
        } else {
          reject(new Error('Cannot allocate local port'))
        }
      })
    })
  })
}

function textFromPart(part) {
  if (typeof part === 'string') return part
  if (!part || typeof part !== 'object') return ''
  if (part.type === 'text') return String(part.text ?? '')
  return ''
}

function textFromMessage(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(textFromPart).join('\n')
  return ''
}

function hasImage(message) {
  return Array.isArray(message?.content) && message.content.some((part) => part?.type === 'image_url')
}

async function startMockLlmServer(port) {
  const requests = []
  const server = createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      const body = raw ? JSON.parse(raw) : {}
      requests.push(body)
      const allText = (body.messages ?? []).map(textFromMessage).join('\n')
      const isProbe = allText.includes('请只回答 OK') || allText.includes('只输出 OK')
      const content = isProbe ? 'OK' : JSON.stringify({
        taskType: 'current-move',
        headline: '本手要先抢全局最大点',
        summary: 'KataGo 证据显示，当前局面的重点是比较一选和实战手的效率差。',
        keyMistakes: [{
          moveNumber: 8,
          color: 'W',
          played: 'R3',
          recommended: 'P4',
          errorType: '方向',
          severity: 'mistake',
          evidence: 'mock LLM 已收到 KataGo facts、知识卡和棋盘图片。',
          explanation: '局部补棋价值低于全局大场，需要先看全盘。'
        }],
        correctThinking: ['先比较 KataGo 一选和实战手的胜率/目差', '再把推荐点放回全局厚薄判断'],
        drills: ['复盘 5 个布局阶段的一选大场', '每手棋先说出全局最大价值点'],
        followupQuestions: ['展开一选变化', '给我 3 道同类训练题'],
        knowledgeCardIds: ['direction_global_over_local'],
        profileUpdates: {
          errorTypes: ['方向'],
          patterns: ['局部过重'],
          trainingFocus: ['布局方向感']
        }
      })

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content } }],
        usage: { prompt_tokens: 1000, completion_tokens: 120, total_tokens: 1120 }
      }))
    })
  })

  await new Promise((resolvePromise) => server.listen(port, '127.0.0.1', resolvePromise))
  return {
    requests,
    close: () => new Promise((resolvePromise, reject) => {
      server.close((error) => error ? reject(error) : resolvePromise())
    })
  }
}

async function seedSmokeHome(homeRoot) {
  const appHome = join(homeRoot, '.gomentor')
  const libraryDir = join(appHome, 'library', 'upload')
  await mkdir(libraryDir, { recursive: true })
  const sgfPath = join(libraryDir, 'teacher-smoke.sgf')
  const sgf = [
    '(;GM[1]FF[4]CA[UTF-8]SZ[19]KM[7.5]',
    'PB[SmokeBlack]PW[SmokeWhite]RE[B+R]DT[2026-04-25]GN[Teacher LLM Smoke]',
    ';B[pd];W[dd];B[qp];W[dp];B[fc];W[cf];B[nc];W[qq];B[oq];W[dc];B[cn];W[fq])'
  ].join('')
  await writeFile(sgfPath, sgf, 'utf8')
  await writeFile(join(appHome, 'library.json'), JSON.stringify({
    games: [{
      id: 'teacher-smoke-game',
      title: 'SmokeBlack vs SmokeWhite',
      event: '',
      black: 'SmokeBlack',
      white: 'SmokeWhite',
      result: 'B+R',
      date: '2026-04-25',
      source: 'upload',
      sourceLabel: 'Smoke fixture',
      filePath: sgfPath,
      createdAt: '2026-04-25T00:00:00.000Z'
    }]
  }, null, 2), 'utf8')
  return { appHome, sgfPath }
}

function startElectron({ homeRoot, cdpPort }) {
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      GOMENTOR_APP_HOME: join(homeRoot, '.gomentor'),
      GOMENTOR_REMOTE_DEBUGGING_PORT: String(cdpPort),
      ELECTRON_ENABLE_LOGGING: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[electron] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[electron] ${chunk}`))
  return child
}

async function waitForRenderer(cdpPort, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
      const pages = await response.json()
      const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) {
        return page.webSocketDebuggerUrl
      }
    } catch (error) {
      lastError = String(error)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`Timed out waiting for Electron renderer CDP. ${lastError}`)
}

async function evaluateInRenderer(wsUrl, expression, timeoutMs = 180_000) {
  const socket = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const opened = new Promise((resolvePromise, reject) => {
    socket.onopen = resolvePromise
    socket.onerror = reject
  })
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    if (message.error) {
      item.reject(new Error(JSON.stringify(message.error)))
    } else {
      item.resolve(message.result)
    }
  }
  await opened

  function send(method, params = {}) {
    const id = nextId++
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolvePromise(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
    })
  }

  await send('Runtime.enable')
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs
  })
  socket.close()
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails))
  }
  return result.result.value
}

async function main() {
  const homeRoot = await mkdtemp(join(tmpdir(), 'gomentor-teacher-home-'))
  const mockPort = await freePort()
  const cdpPort = await freePort()
  const mock = await startMockLlmServer(mockPort)
  await seedSmokeHome(homeRoot)

  const child = startElectron({ homeRoot, cdpPort })
  try {
    const wsUrl = await waitForRenderer(cdpPort)
    const result = await evaluateInRenderer(wsUrl, `
      (async () => {
        const tinyPng = ${JSON.stringify(tinyPng)};
        const baseUrl = 'http://127.0.0.1:${mockPort}/v1';
        const probe = await window.gomentor.testLlmSettings({
          llmBaseUrl: baseUrl,
          llmApiKey: 'smoke-key',
          llmModel: 'gpt-5.4'
        });
        if (!probe.ok) throw new Error('LLM probe failed: ' + probe.message);
        const dashboard = await window.gomentor.updateSettings({
          llmBaseUrl: baseUrl,
          llmApiKey: 'smoke-key',
          llmModel: 'gpt-5.4',
          defaultPlayerName: 'SmokeBlack'
        });
        const game = dashboard.games[0];
        if (!game) throw new Error('No smoke game loaded');
        const record = await window.gomentor.getGameRecord(game.id);
        const moveNumber = Math.min(8, record.moves.length);
        const analysis = await window.gomentor.analyzePosition({
          gameId: game.id,
          moveNumber,
          maxVisits: 24
        });
        const result = await window.gomentor.runTeacherTask({
          mode: 'current-move',
          prompt: '请分析当前手，输出结构化 JSON 讲解。',
          gameId: game.id,
          moveNumber,
          boardImageDataUrl: tinyPng,
          prefetchedAnalysis: analysis
        });
        return {
          probe,
          gameTitle: game.title,
          moveNumber,
          bestMove: analysis.before.topMoves[0]?.move || '',
          candidateCount: analysis.before.topMoves.length,
          resultTitle: result.title,
          markdown: result.markdown,
          structured: result.structuredResult || result.structured,
          knowledgeCount: result.knowledge?.length || 0,
          knowledgeMatchCount: result.knowledgeMatches?.length || 0,
          recommendedProblemCount: result.recommendedProblems?.length || 0,
          knowledgeMatches: (result.knowledgeMatches ?? []).slice(0, 3).map((match) => ({
            title: match.title,
            matchType: match.matchType,
            confidence: match.confidence
          })),
          recommendedProblems: (result.recommendedProblems ?? []).slice(0, 3).map((problem) => ({
            title: problem.title,
            problemType: problem.problemType,
            difficulty: problem.difficulty
          })),
          toolLogs: result.toolLogs.map((log) => ({ name: log.name, status: log.status, detail: log.detail })),
          reportPath: result.reportPath || ''
        };
      })()
    `)

    assert.equal(result.probe.ok, true)
    assert.equal(result.structured?.headline, '本手要先抢全局最大点')
    assert.equal(result.structured?.taskType, 'current-move')
    assert.ok(result.candidateCount > 0, 'KataGo should return candidate moves')
    assert.ok(result.bestMove, 'KataGo should return a best move')
    assert.ok(result.knowledgeCount >= 2, 'Teacher runtime should retrieve local knowledge cards')
    assert.ok(result.knowledgeMatchCount >= 1, 'Teacher runtime should return structured knowledge matches')
    assert.ok(result.recommendedProblemCount >= 1, 'Teacher runtime should return recommended training problems')
    assert.ok(result.markdown.includes('本手要先抢全局最大点') || result.markdown.includes('KataGo'), 'Teacher markdown should be visible')
    for (const tool of ['board.captureTeachingImage', 'katago.analyzePosition', 'knowledge.searchLocal', 'llm.multimodalTeacher', 'teacher.verifyEvidence', 'studentProfile.write']) {
      assert.equal(result.toolLogs.find((log) => log.name === tool)?.status, 'done', `${tool} should finish`)
    }
    assert.ok(result.reportPath, 'Teacher runtime should persist a report')
    await stat(result.reportPath)

    const probeRequest = mock.requests.find((body) => (body.messages ?? []).some((message) => {
      const text = textFromMessage(message)
      return text.includes('请只回答 OK') || text.includes('只输出 OK')
    }))
    const teacherRequest = mock.requests.find((body) => (body.messages ?? []).some((message) => textFromMessage(message).includes('katagoFacts')))
    assert.ok(probeRequest, 'Mock LLM should receive probe request')
    assert.ok(teacherRequest, 'Mock LLM should receive teacher request with KataGo facts')
    assert.ok((teacherRequest.messages ?? []).some(hasImage), 'Teacher request should include board image')
    const teacherPayload = (teacherRequest.messages ?? []).map(textFromMessage).join('\n')
    assert.match(teacherPayload, /katagoFacts/)
    assert.match(teacherPayload, /knowledgePacket/)
    assert.match(teacherPayload, /knowledgeMatches/)
    assert.match(teacherPayload, /recommendedProblems/)
    assert.match(teacherPayload, /confidence|置信度|不能当成事实/)
    assert.match(teacherPayload, /studentProfile/)

    console.log('Teacher LLM smoke passed')
    console.log(JSON.stringify({
      gameTitle: result.gameTitle,
      moveNumber: result.moveNumber,
      bestMove: result.bestMove,
      candidateCount: result.candidateCount,
      knowledgeCount: result.knowledgeCount,
      knowledgeMatchCount: result.knowledgeMatchCount,
      recommendedProblemCount: result.recommendedProblemCount,
      knowledgeMatches: result.knowledgeMatches,
      recommendedProblems: result.recommendedProblems,
      toolLogs: result.toolLogs
    }, null, 2))
  } finally {
    child.kill()
    await mock.close().catch(() => {})
    await rm(homeRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
