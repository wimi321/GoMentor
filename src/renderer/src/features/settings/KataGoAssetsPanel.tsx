import type { ReactElement } from 'react'
import type { KataGoAssetInstallProgress, KataGoModelPreset } from '@main/lib/types'

export interface KataGoAssetStatusView {
  platformKey: string
  manifestFound: boolean
  binaryPath: string
  binaryFound: boolean
  binaryExecutable: boolean
  modelPath: string
  modelFound: boolean
  modelDisplayName: string
  ready: boolean
  detail: string
}

function formatBytes(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) {
    return ''
  }
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.round(value / 1024)} KB`
}

function speedTierLabel(tier: KataGoModelPreset['speedTier'] | undefined): string {
  switch (tier) {
    case 'fast':
      return '速度优先'
    case 'balanced':
      return '教学平衡'
    case 'strong':
      return '精读强度'
    case 'maximum':
      return '旗舰强度'
    default:
      return '官方权重'
  }
}

export function KataGoAssetsPanel({
  status,
  selectedPreset,
  busy = false,
  installProgress,
  installMessage,
  onInstall,
  onRefresh
}: {
  status?: KataGoAssetStatusView | null
  selectedPreset?: KataGoModelPreset
  busy?: boolean
  installProgress?: KataGoAssetInstallProgress | null
  installMessage?: string
  onInstall?: () => void
  onRefresh?: () => void
}): ReactElement {
  const percent = installProgress?.percent
  const bytesLabel = installProgress?.receivedBytes
    ? `${formatBytes(installProgress.receivedBytes)}${installProgress.totalBytes ? ` / ${formatBytes(installProgress.totalBytes)}` : ''}`
    : ''
  return (
    <section className="runtime-card katago-assets-card">
      <header>
        <div>
          <strong>KataGo 官方资源</strong>
          <p>{selectedPreset ? `${selectedPreset.label} · ${selectedPreset.badge}` : '选择官方推荐权重后可一键安装。'}</p>
        </div>
        <span className={status?.ready ? 'runtime-pill runtime-pill--ready' : 'runtime-pill runtime-pill--warn'}>{status?.ready ? 'Ready' : 'Missing'}</span>
      </header>
      {selectedPreset ? (
        <div className="katago-preset-card">
          <div>
            <span>分组</span>
            <strong>{selectedPreset.group}</strong>
          </div>
          <div>
            <span>规格</span>
            <strong>{selectedPreset.blockSize} · {speedTierLabel(selectedPreset.speedTier)}</strong>
          </div>
          <div>
            <span>网络</span>
            <strong title={selectedPreset.networkName}>{selectedPreset.networkName}</strong>
          </div>
          <div>
            <span>来源</span>
            <strong>{selectedPreset.downloadUrl ? 'KataGo 官方直链' : 'KataGo 官方索引'}</strong>
          </div>
        </div>
      ) : null}
      {status ? (
        <div className="runtime-list">
          <div><span>平台</span><strong>{status.platformKey}</strong></div>
          <div><span>Manifest</span><strong>{status.manifestFound ? '已找到' : '缺失'}</strong></div>
          <div><span>引擎</span><strong>{status.binaryFound ? (status.binaryExecutable ? '可执行' : '不可执行') : '缺失'}</strong></div>
          <div><span>模型</span><strong>{status.modelFound ? status.modelDisplayName : '缺失'}</strong></div>
          <p>{status.detail}</p>
        </div>
      ) : <p>尚未读取资源状态。</p>}
      {installProgress ? (
        <div className="katago-install-progress" aria-live="polite">
          <div>
            <span>{installProgress.message}</span>
            {typeof percent === 'number' ? <strong>{percent.toFixed(percent % 1 === 0 ? 0 : 1)}%</strong> : null}
          </div>
          <div className="katago-install-progress__bar">
            <span style={{ width: `${Math.max(4, percent ?? 8)}%` }} />
          </div>
          {bytesLabel ? <small>{bytesLabel}</small> : null}
        </div>
      ) : null}
      {installMessage && !installProgress ? <p className="test-message">{installMessage}</p> : null}
      <div className="katago-assets-card__actions">
        <button className="primary-button" type="button" onClick={onInstall} disabled={!onInstall || busy}>
          {busy ? '安装中' : '一键安装官方权重'}
        </button>
        <button className="ghost-button" type="button" onClick={onRefresh}>重新检查</button>
      </div>
    </section>
  )
}
