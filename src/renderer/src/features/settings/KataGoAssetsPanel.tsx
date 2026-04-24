import type { ReactElement } from 'react'

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

export function KataGoAssetsPanel({ status, onRefresh }: { status?: KataGoAssetStatusView | null; onRefresh?: () => void }): ReactElement {
  return (
    <section className="runtime-card">
      <header>
        <strong>KataGo 内置资源</strong>
        <span className={status?.ready ? 'runtime-pill runtime-pill--ready' : 'runtime-pill runtime-pill--warn'}>{status?.ready ? 'Ready' : 'Missing'}</span>
      </header>
      {status ? (
        <div className="runtime-list">
          <div><span>平台</span><strong>{status.platformKey}</strong></div>
          <div><span>Manifest</span><strong>{status.manifestFound ? '已找到' : '缺失'}</strong></div>
          <div><span>引擎</span><strong>{status.binaryFound ? (status.binaryExecutable ? '可执行' : '不可执行') : '缺失'}</strong></div>
          <div><span>模型</span><strong>{status.modelFound ? status.modelDisplayName : '缺失'}</strong></div>
          <p>{status.detail}</p>
        </div>
      ) : <p>尚未读取资源状态。</p>}
      <button className="ghost-button" onClick={onRefresh}>重新检查</button>
    </section>
  )
}
