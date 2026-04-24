import type { ReactElement } from 'react'

export type ReleaseReadinessStatus = 'ready' | 'warning' | 'blocked' | 'unknown'

export interface ReleaseReadinessItem {
  label: string
  status: ReleaseReadinessStatus
  detail?: string
}

export interface ReleaseReadinessPanelProps {
  items: ReleaseReadinessItem[]
  title?: string
}

const statusLabel: Record<ReleaseReadinessStatus, string> = {
  ready: 'Ready',
  warning: 'Warning',
  blocked: 'Blocked',
  unknown: 'Unknown'
}

export function ReleaseReadinessPanel({
  items,
  title = 'P0 Beta readiness'
}: ReleaseReadinessPanelProps): ReactElement {
  const blocked = items.filter((item) => item.status === 'blocked').length
  const warnings = items.filter((item) => item.status === 'warning').length
  const ready = blocked === 0 && warnings === 0

  return (
    <section className={`release-readiness release-readiness--${ready ? 'ready' : blocked > 0 ? 'blocked' : 'warning'}`}>
      <div className="release-readiness__head">
        <div>
          <strong>{title}</strong>
          <p>{ready ? '可以进入 Beta 验收。' : blocked > 0 ? '仍有发布阻塞项。' : '可以继续验证，但仍有注意项。'}</p>
        </div>
        <span className="release-readiness__badge">{ready ? 'READY' : blocked > 0 ? `${blocked} BLOCKED` : `${warnings} WARN`}</span>
      </div>

      <div className="release-readiness__items">
        {items.map((item) => (
          <div key={item.label} className={`release-readiness__item release-readiness__item--${item.status}`}>
            <span className="release-readiness__dot" aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              {item.detail ? <p>{item.detail}</p> : null}
            </div>
            <em>{statusLabel[item.status]}</em>
          </div>
        ))}
      </div>
    </section>
  )
}
