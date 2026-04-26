import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('Fox sync stores list metadata and defers SGF download until a game is opened', () => {
  const fox = read('src/main/services/fox.ts')
  assert.match(fox, /indexedFoxGame/)
  assert.match(fox, /downloadStatus:\s*loaded \? 'downloaded' : 'remote'/)
  assert.match(fox, /remoteId:\s*chessId/)
  assert.match(fox, /moveCount:\s*numberValue\(item\.movenum\)/)

  const syncBody = fox.match(/export async function syncFoxGames[\s\S]*?export async function ensureFoxGameDownloaded/)?.[0] ?? ''
  assert.match(syncBody, /fetchList\(user\.uid\)/)
  assert.match(syncBody, /indexedFoxGame\(item, user, index\)/)
  assert.doesNotMatch(syncBody, /fetchSgf\(/)
  assert.match(fox, /export async function ensureFoxGameDownloaded/)
  assert.match(fox, /const sgf = await fetchSgf\(chessId\)/)
  assert.match(fox, /upsertGames\(\[readyGame\]\)/)
})

test('all SGF consumers hydrate remote Fox games before reading filePath', () => {
  const main = read('src/main/index.ts')
  assert.match(main, /ensureFoxGameDownloaded/)
  assert.match(main, /const readyGame = await ensureFoxGameDownloaded\(game\)/)
  assert.match(main, /readGameRecord\(readyGame\)/)

  const katago = read('src/main/services/katago.ts')
  assert.match(katago, /const game = await ensureFoxGameDownloaded\(indexedGame\)/)
  assert.match(katago, /readGameRecord\(game\)/)

  const review = read('src/main/services/review.ts')
  assert.match(review, /const game = await ensureFoxGameDownloaded\(indexedGame\)/)
  assert.match(review, /game\.filePath/)

  const teacher = read('src/main/services/teacherAgent.ts')
  assert.match(teacher, /ensureFoxGameDownloaded/)
  assert.match(teacher, /const game = indexedGame \? await ensureFoxGameDownloaded\(indexedGame\) : undefined/)
  assert.match(teacher, /const game = await ensureFoxGameDownloaded\(indexedGame\)/)
})

test('library panel communicates remote list state and keeps pagination compact', () => {
  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /LIBRARY_PAGE_SIZE = 10/)
  assert.match(app, /game-row__badge--remote/)
  assert.match(app, /仅列表/)
  assert.match(app, /已缓存/)
  assert.match(app, /setDashboard\(\(current\) => \(\{[\s\S]*next\.game/s)
  assert.match(app, /game\.source !== 'fox' \|\| game\.downloadStatus === 'downloaded'/)
  assert.doesNotMatch(app, /setSelectedId\(result\.saved\[0\]\.id\)/)

  const styles = read('src/renderer/src/styles.css')
  assert.match(styles, /\.game-row__title/)
  assert.match(styles, /\.game-row__badge--remote/)
  assert.match(styles, /\.game-row__badge--downloaded/)
})
