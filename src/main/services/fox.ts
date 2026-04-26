import { existsSync } from 'node:fs'
import { upsertGames } from '@main/lib/store'
import type { FoxSyncRequest, FoxSyncResult, LibraryGame } from '@main/lib/types'
import { foxSgfPathForGameId, saveFoxSgf } from './sgf'

const BASE_URL = 'https://h5.foxwq.com/yehuDiamond/chessbook_local'
const QUERY_USER_URL = 'https://newframe.foxwq.com/cgi/QueryUserInfoPanel'
const FOX_SGF_URL = `${BASE_URL}/YHWQFetchChess`
const FOX_LIST_URL = `${BASE_URL}/YHWQFetchChessList`
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

interface FoxUserResponse {
  uid?: string | number
  username?: string
  name?: string
  englishname?: string
  result?: number
  errcode?: number
  resultstr?: string
  errmsg?: string
}

interface FoxListItem {
  chessid?: string | number
  starttime?: string
  blacknick?: string
  blacknickname?: string
  whitenick?: string
  whitenickname?: string
  blackname?: string
  whitename?: string
  blackenname?: string
  whiteenname?: string
  blackuid?: string | number
  whiteuid?: string | number
  movenum?: string | number
  winner?: string | number
  point?: string | number
  rule?: string | number
  title?: string
  dt?: string
  result?: string
}

interface FoxListResponse {
  result?: number
  resultstr?: string
  errmsg?: string
  data?: FoxListItem[]
  chesslist?: FoxListItem[]
}

function first(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim())?.trim() ?? ''
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json,text/plain,*/*'
    }
  })
  if (!response.ok) {
    throw new Error(`Fox request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

async function resolveUser(keyword: string): Promise<{ uid: string; nickname: string }> {
  if (/^\d+$/.test(keyword)) {
    return { uid: keyword, nickname: keyword }
  }
  const query = new URL(QUERY_USER_URL)
  query.searchParams.set('srcuid', '0')
  query.searchParams.set('username', keyword)
  const json = await getJson<FoxUserResponse>(query.toString())
  const result = typeof json.result === 'number' ? json.result : json.errcode ?? -1
  if (result !== 0) {
    throw new Error(first(json.resultstr, json.errmsg) || `无法找到野狐用户：${keyword}`)
  }
  const uid = String(json.uid ?? '').trim()
  if (!uid) {
    throw new Error('野狐返回了空 UID，无法继续同步')
  }
  return {
    uid,
    nickname: first(json.username, json.name, json.englishname, keyword)
  }
}

async function fetchList(uid: string): Promise<FoxListItem[]> {
  const url = new URL(FOX_LIST_URL)
  url.searchParams.set('srcuid', '0')
  url.searchParams.set('dstuid', uid)
  url.searchParams.set('type', '1')
  url.searchParams.set('lastcode', '0')
  url.searchParams.set('searchkey', '')
  url.searchParams.set('uin', uid)
  const json = await getJson<FoxListResponse>(url.toString())
  if (typeof json.result === 'number' && json.result !== 0) {
    throw new Error(first(json.resultstr, json.errmsg) || `野狐棋谱列表返回错误：${json.result}`)
  }
  return json.data ?? json.chesslist ?? []
}

async function fetchSgf(chessId: string): Promise<string> {
  const url = new URL(FOX_SGF_URL)
  url.searchParams.set('chessid', chessId)
  const json = await getJson<{ chess?: string }>(url.toString())
  const sgf = (json.chess ?? '').replace(/\uFEFF/g, '').trim()
  if (!sgf.startsWith('(')) {
    throw new Error(`野狐棋谱 ${chessId} 返回内容异常`)
  }
  return sgf
}

function foxGameId(uid: string, chessId: string): string {
  return `fox:${uid}:${chessId}`
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function foxName(item: FoxListItem, ...keys: Array<keyof FoxListItem>): string {
  return first(...keys.map((key) => {
    const value = item[key]
    return value === undefined || value === null ? undefined : String(value)
  }))
}

function normalizeFoxDate(item: FoxListItem, fallbackIndex: number): { display: string; createdAt: string } {
  const raw = first(item.starttime, item.dt)
  const normalized = raw.replace(/\//g, '-').trim()
  const date = normalized.slice(0, 10)
  const parsed = Date.parse(normalized.includes('T') ? normalized : normalized.replace(' ', 'T'))
  return {
    display: date || normalized,
    createdAt: Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : new Date(Date.now() - fallbackIndex * 1000).toISOString()
  }
}

function formatFoxPoint(point: number | undefined): string {
  if (typeof point !== 'number' || !Number.isFinite(point)) {
    return ''
  }
  if (point < 0) {
    if (point === -1) return '+R'
    if (point === -2) return '+T'
    return '+'
  }
  return `+${(point / 100).toFixed(point % 100 === 0 ? 0 : 2).replace(/\.?0+$/, '')}`
}

function foxResult(item: FoxListItem): string {
  const explicit = first(item.result)
  if (explicit) {
    return explicit
  }
  const winner = numberValue(item.winner)
  if (winner === 1) return `B${formatFoxPoint(numberValue(item.point))}`
  if (winner === 2) return `W${formatFoxPoint(numberValue(item.point))}`
  return ''
}

function indexedFoxGame(item: FoxListItem, user: { uid: string; nickname: string }, index: number): LibraryGame | null {
  const chessId = String(item.chessid ?? '').trim()
  if (!chessId) {
    return null
  }
  const black = foxName(item, 'blacknick', 'blacknickname', 'blackname', 'blackenname')
  const white = foxName(item, 'whitenick', 'whitenickname', 'whitename', 'whiteenname')
  const title = first(item.title, [black, white].filter(Boolean).join(' vs '), chessId)
  const id = foxGameId(user.uid, chessId)
  const filePath = foxSgfPathForGameId(id)
  const date = normalizeFoxDate(item, index)
  const loaded = existsSync(filePath)
  return {
    id,
    title,
    event: first(item.title),
    black,
    white,
    result: foxResult(item),
    date: date.display,
    source: 'fox',
    sourceLabel: `Fox ${user.nickname} / ${user.uid}`,
    filePath,
    createdAt: date.createdAt,
    downloadStatus: loaded ? 'downloaded' : 'remote',
    remoteId: chessId,
    remoteUid: user.uid,
    moveCount: numberValue(item.movenum)
  }
}

export async function syncFoxGames(request: FoxSyncRequest): Promise<FoxSyncResult> {
  const user = await resolveUser(request.keyword.trim())
  const list = await fetchList(user.uid)
  const selectedItems = typeof request.maxGames === 'number' ? list.slice(0, request.maxGames) : list
  const saved = selectedItems
    .map((item, index) => indexedFoxGame(item, user, index))
    .filter((game): game is LibraryGame => Boolean(game))
  return {
    nickname: user.nickname,
    uid: user.uid,
    saved
  }
}

export async function ensureFoxGameDownloaded(game: LibraryGame): Promise<LibraryGame> {
  if (game.source !== 'fox' || game.downloadStatus === 'downloaded' || existsSync(game.filePath)) {
    const readyGame = {
      ...game,
      downloadStatus: game.source === 'fox' ? 'downloaded' : game.downloadStatus
    }
    if (game.source === 'fox' && game.downloadStatus !== 'downloaded') {
      upsertGames([readyGame])
    }
    return readyGame
  }
  const chessId = game.remoteId || game.id.split(':').pop() || ''
  if (!chessId) {
    throw new Error(`棋谱 ${game.title || game.id} 缺少野狐 chessid，无法下载。`)
  }
  const sgf = await fetchSgf(chessId)
  const readyGame = saveFoxSgf(sgf, game.title || chessId, game.sourceLabel, game)
  upsertGames([readyGame])
  return readyGame
}
