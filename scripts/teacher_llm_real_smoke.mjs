#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const electronBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Cannot allocate local port'))
        }
      })
    })
  })
}

function startElectron({ cdpPort }) {
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
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
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for Electron renderer CDP. ${lastError}`)
}

async function evaluateInRenderer(wsUrl, expression, timeoutMs = 240_000) {
  const socket = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const opened = new Promise((resolve, reject) => {
    socket.onopen = resolve
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
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
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

const smokeExpression = `
(async () => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function gtpToPoint(move, size) {
    if (!move || move.toLowerCase() === 'pass') return null;
    const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    const col = letters.indexOf(move[0].toUpperCase());
    const row = size - Number(move.slice(1));
    if (col < 0 || Number.isNaN(row) || row < 0 || row >= size) return null;
    return { row, col };
  }
  function computeBoard(record, moveNumber) {
    const board = Array.from({ length: record.boardSize }, () => Array.from({ length: record.boardSize }, () => ''));
    for (const move of record.moves.slice(0, moveNumber)) {
      if (move.row === null || move.col === null) continue;
      board[move.row][move.col] = move.color;
    }
    return board;
  }
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
  function renderBoardImage(record, moveNumber, analysis) {
    const size = record.boardSize;
    const canvas = document.createElement('canvas');
    canvas.width = 980;
    canvas.height = 980;
    const ctx = canvas.getContext('2d');
    const margin = 92;
    const edge = 28;
    const step = (canvas.width - margin * 2) / (size - 1);
    const board = computeBoard(record, moveNumber);
    const lastMove = record.moves[moveNumber - 1];
    const letters = 'ABCDEFGHJKLMNOPQRST'.split('');

    ctx.fillStyle = '#eef1ed';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(ctx, edge, edge, canvas.width - edge * 2, canvas.height - edge * 2, 18);
    ctx.fillStyle = '#d4aa61';
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.13;
    for (let i = 0; i < 42; i += 1) {
      ctx.strokeStyle = i % 2 ? '#6e411d' : '#f0d28e';
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(edge + i * 24, edge);
      ctx.bezierCurveTo(edge + i * 20, 280, edge + i * 28, 620, edge + i * 23, canvas.height - edge);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(31, 25, 17, 0.82)';
    for (let i = 0; i < size; i += 1) {
      const p = margin + i * step;
      ctx.lineWidth = i === 0 || i === size - 1 ? 2.3 : 1.25;
      ctx.beginPath();
      ctx.moveTo(margin, p);
      ctx.lineTo(canvas.width - margin, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, margin);
      ctx.lineTo(p, canvas.height - margin);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(26, 22, 17, 0.76)';
    for (const row of [3, 9, 15]) {
      for (const col of [3, 9, 15]) {
        ctx.beginPath();
        ctx.arc(margin + col * step, margin + row * step, 4.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.font = '600 18px Inter, Avenir Next, PingFang SC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(44, 35, 22, 0.62)';
    for (let i = 0; i < size; i += 1) {
      const p = margin + i * step;
      ctx.fillText(letters[i], p, 56);
      ctx.fillText(letters[i], p, canvas.height - 56);
      ctx.fillText(String(size - i), 55, p);
      ctx.fillText(String(size - i), canvas.width - 55, p);
    }

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const stone = board[row][col];
        if (!stone) continue;
        const x = margin + col * step;
        const y = margin + row * step;
        const radius = step * 0.47;
        const gradient = ctx.createRadialGradient(x - radius * 0.28, y - radius * 0.34, radius * 0.14, x, y, radius);
        if (stone === 'B') {
          gradient.addColorStop(0, '#68707a');
          gradient.addColorStop(0.38, '#24272b');
          gradient.addColorStop(1, '#050607');
        } else {
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(0.55, '#ede8dc');
          gradient.addColorStop(1, '#b9b2a5');
        }
        ctx.save();
        ctx.shadowColor = 'rgba(35, 25, 13, 0.34)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (lastMove?.row === row && lastMove?.col === col) {
          ctx.strokeStyle = stone === 'B' ? '#f4eadb' : '#232323';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(x, y, radius * 0.38, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    const candidates = (analysis?.before?.topMoves ?? []).slice(0, 5);
    const maxVisits = Math.max(...candidates.map((candidate) => candidate.visits ?? 0), 1);
    const colors = ['#2f9662', '#3f7fa6', '#b58a2d', '#845bb5', '#637083'];
    for (const [index, candidate] of candidates.entries()) {
      const point = gtpToPoint(candidate.move, size);
      if (!point) continue;
      const x = margin + point.col * step;
      const y = margin + point.row * step;
      const share = clamp((candidate.visits ?? 0) / maxVisits, 0.18, 1);
      const radius = step * (0.35 + share * 0.11);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = colors[index] ?? '#637083';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 253, 246, 0.92)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fffaf1';
      ctx.font = '800 15px Inter, Avenir Next, sans-serif';
      ctx.fillText(String(index + 1), x, y - radius * 0.45);
      ctx.font = '700 13px Inter, Avenir Next, sans-serif';
      ctx.fillText(Number(candidate.winrate ?? 0).toFixed(1) + '%', x, y - radius * 0.02);
      ctx.font = '600 12px Inter, Avenir Next, sans-serif';
      ctx.fillText(String(candidate.visits ?? 0), x, y + radius * 0.42);
    }
    ctx.fillStyle = 'rgba(25, 22, 18, 0.72)';
    ctx.font = '600 20px Inter, Avenir Next, PingFang SC, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Move ' + moveNumber + ' / ' + record.moves.length, margin, canvas.height - 30);
    return canvas.toDataURL('image/png');
  }

  const dashboard = await window.gomentor.getDashboard();
  if (!dashboard.systemProfile?.hasLlmApiKey) {
    throw new Error('No saved LLM API key. Configure settings before running real smoke.');
  }
  if (!dashboard.games?.length) {
    throw new Error('No public SGF games in the local library.');
  }
  const probe = await window.gomentor.testLlmSettings({ llmBaseUrl: '', llmApiKey: '', llmModel: '' });
  const game = dashboard.games[0];
  const record = await window.gomentor.getGameRecord(game.id);
  const moveNumber = Math.min(80, Math.max(1, record.moves.length));
  const analysis = await window.gomentor.analyzePosition({ gameId: game.id, moveNumber, maxVisits: 96 });
  const boardImageDataUrl = renderBoardImage(record, moveNumber, analysis);
  const result = await window.gomentor.runTeacherTask({
    mode: 'current-move',
    prompt: '这是一盘公开棋谱。请调用真实多模态能力，结合棋盘截图、KataGo 数据和本地知识库，给出当前手的结构化中文讲解。',
    gameId: game.id,
    moveNumber,
    boardImageDataUrl,
    prefetchedAnalysis: analysis
  });
  const llmLog = result.toolLogs.find((log) => log.name === 'llm.multimodalTeacher');
  const hasTeacherMarkdown = Boolean(String(result.markdown ?? '').trim());
  return {
    baseUrl: dashboard.settings.llmBaseUrl,
    model: dashboard.settings.llmModel,
    gameTitle: game.title,
    black: game.black,
    white: game.white,
    source: game.source,
    moveNumber,
    topMove: analysis.before?.topMoves?.[0]?.move ?? '',
    candidateCount: analysis.before?.topMoves?.length ?? 0,
    imageBytesApprox: Math.round(boardImageDataUrl.length * 0.75),
    probeOk: probe.ok,
    probeMessage: probe.message,
    llmStatus: llmLog?.status ?? (hasTeacherMarkdown ? 'done' : 'missing'),
    llmDetail: llmLog?.detail ?? (hasTeacherMarkdown ? 'Agent runtime produced streamed teacher markdown.' : ''),
    teachingPacing: result.teachingPacing,
    knowledgeCount: result.knowledge?.length ?? 0,
    knowledgeMatchCount: result.knowledgeMatches?.length ?? 0,
    recommendedProblemCount: result.recommendedProblems?.length ?? 0,
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
    reportPath: result.reportPath ?? '',
    headline: result.structuredResult?.headline ?? result.structured?.headline ?? '',
    markdownPreview: String(result.markdown ?? '').slice(0, 220),
    toolLogs: result.toolLogs.map((log) => ({ name: log.name, status: log.status, detail: log.detail }))
  };
})()
`

function redactUrl(raw) {
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return '<configured>'
  }
}

async function main() {
  const cdpPort = await freePort()
  const child = startElectron({ cdpPort })
  try {
    const wsUrl = await waitForRenderer(cdpPort)
    const result = await evaluateInRenderer(wsUrl, smokeExpression)
    assert.equal(result.probeOk, true, result.probeMessage)
    assert.equal(result.llmStatus, 'done', result.llmDetail)
    assert.ok(result.markdownPreview && !result.markdownPreview.includes('多模态 LLM 暂时不可用'), 'LLM should return usable teacher content')
    assert.ok(result.candidateCount > 0, 'KataGo should return candidate moves')
    assert.ok(result.knowledgeCount >= 2, 'Teacher runtime should retrieve local knowledge cards')
    assert.ok(result.knowledgeMatchCount >= 1, 'Teacher runtime should return structured knowledge matches')
    assert.ok(result.recommendedProblemCount >= 1, 'Teacher runtime should return recommended training problems')
    assert.ok(result.reportPath, 'Teacher runtime should persist a report')
    assert.ok(result.imageBytesApprox > 50_000, 'Teacher request should include a real board image, not a placeholder')
    assert.ok(result.teachingPacing?.teachingDensity, 'Teacher runtime should return teaching density advice')

    console.log('Real Teacher LLM smoke passed')
    console.log(JSON.stringify({
      baseUrl: redactUrl(result.baseUrl),
      model: result.model,
      gameTitle: result.gameTitle,
      black: result.black,
      white: result.white,
      source: result.source,
      moveNumber: result.moveNumber,
      topMove: result.topMove,
      candidateCount: result.candidateCount,
      imageBytesApprox: result.imageBytesApprox,
      probeOk: result.probeOk,
      probeMessage: result.probeOk ? 'OK' : result.probeMessage,
      knowledgeCount: result.knowledgeCount,
      knowledgeMatchCount: result.knowledgeMatchCount,
      recommendedProblemCount: result.recommendedProblemCount,
      knowledgeMatches: result.knowledgeMatches,
      recommendedProblems: result.recommendedProblems,
      headline: result.headline,
      markdownPreview: result.markdownPreview,
      toolLogs: result.toolLogs
    }, null, 2))
  } finally {
    child.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
