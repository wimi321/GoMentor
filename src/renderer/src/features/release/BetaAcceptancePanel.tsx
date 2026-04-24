import type { ReactElement } from 'react'

export interface BetaAcceptanceItem {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'unknown'
  detail?: string
}

export interface BetaAcceptancePanelProps {
  items: BetaAcceptanceItem[]
  onRunChecks?: () => void
}

const statusLabel: Record<BetaAcceptanceItem['status'], string> = {
  pass: '通过',
  warn: '警告',
  fail: '失败',
  unknown: '未检查'
}

export function BetaAcceptancePanel({ items, onRunChecks }: BetaAcceptancePanelProps): ReactElement {
  const failCount = items.filter((item) => item.status === 'fail').length
  const warnCount = items.filter((item) => item.status === 'warn').length
  const passCount = items.filter((item) => item.status === 'pass').length

  return (
    <section className="beta-acceptance-panel">
      <div className="beta-acceptance-panel__head">
        <div>
          <strong>P0 Beta 验收</strong>
          <small>{passCount} 通过 · {warnCount} 警告 · {failCount} 失败</small>
        </div>
        {onRunChecks ? <button type="button" onClick={onRunChecks}>重新检查</button> : null}
      </div>
      <div className="beta-acceptance-panel__list">
        {items.map((item) => (
          <article key={item.id} className={`beta-check beta-check--${item.status}`}>
            <span>{statusLabel[item.status]}</span>
            <div>
              <strong>{item.label}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
