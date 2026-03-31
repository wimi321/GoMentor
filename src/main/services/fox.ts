import type { FoxSyncRequest, FoxSyncResult } from '@main/lib/types'
import { saveFoxSgf } from './sgf'

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
  blacknick?: string
  whitenick?: string
  blackname?: string
  whitename?: string
  title?: string
  dt?: string
  result?: string
}

interface FoxListResponse {
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

export async function syncFoxGames(request: FoxSyncRequest): Promise<FoxSyncResult> {
  const user = await resolveUser(request.keyword.trim())
  const list = await fetchList(user.uid)
  const saved = []
  for (const item of list.slice(0, request.maxGames)) {
    const chessId = String(item.chessid ?? '').trim()
    if (!chessId) continue
    try {
      const sgf = await fetchSgf(chessId)
      const title = first(item.title, `${first(item.blacknick, item.blackname)} vs ${first(item.whitenick, item.whitename)}`, chessId)
      saved.push(saveFoxSgf(sgf, title, `Fox ${user.nickname} / ${user.uid}`))
    } catch (error) {
      console.warn('fox sync skipped', chessId, error)
    }
  }
  return {
    nickname: user.nickname,
    uid: user.uid,
    saved
  }
}
