import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('official KataGo model installer is wired through main preload and settings', () => {
  const types = read('src/main/lib/types.ts')
  assert.match(types, /KataGoAssetInstallRequest/)
  assert.match(types, /KataGoAssetInstallProgress/)
  assert.match(types, /KataGoAssetInstallResult/)

  const service = read('src/main/services/katago/katagoAssets.ts')
  assert.match(service, /installOfficialKataGoModel/)
  assert.match(service, /discoverModelDownloadUrl/)
  assert.match(service, /preset\.downloadUrl/)
  assert.match(service, /katagotraining\.org/)
  assert.match(service, /Readable\.fromWeb/)
  assert.match(service, /copyPlatformBinaryIfAvailable/)

  const runtime = read('src/main/services/katagoRuntime.ts')
  assert.match(runtime, /official-b40-latest/)
  assert.match(runtime, /official-b20-strong/)
  assert.match(runtime, /official-b18-recommended/)
  assert.match(runtime, /官网推荐 zhizi 模型/)
  assert.match(runtime, /zhizi b28 官网最强/)
  assert.match(runtime, /zhizi b40 官网最新/)
  assert.match(runtime, /downloadUrl: officialNetworkUrl/)
  assert.match(runtime, /blockSize: 'b40'/)
  assert.match(runtime, /blockSize: 'b20'/)

  const main = read('src/main/index.ts')
  assert.match(main, /katago-assets:install-official-model/)
  assert.match(main, /katago-assets:install-progress/)

  const preload = read('src/preload/index.ts')
  assert.match(preload, /installKataGoOfficialModel/)
  assert.match(preload, /onKataGoAssetInstallProgress/)

  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /installOfficialKataGoModel/)
  assert.match(app, /katagoInstallProgress/)
  assert.match(app, /onKataGoAssetInstallProgress/)
  assert.match(app, /onInstallOfficialModel/)
  assert.match(app, /<optgroup/)
  assert.match(app, /groupedModelPresets/)
  assert.match(app, /官网推荐 zhizi 模型/)

  const panel = read('src/renderer/src/features/settings/KataGoAssetsPanel.tsx')
  assert.match(panel, /一键安装官方权重/)
  assert.match(panel, /katago-install-progress/)
  assert.match(panel, /selectedPreset/)
  assert.match(panel, /KataGo 官方直链/)
  assert.match(panel, /speedTierLabel/)
})
