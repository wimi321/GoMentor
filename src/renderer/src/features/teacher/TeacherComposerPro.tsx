import type { FormEvent, ReactElement } from 'react'
import './teacher-pro.css'

interface TeacherComposerProProps {
  value: string
  busy?: boolean
  actions?: Array<{
    label: string
    onClick: () => void
    disabled?: boolean
    primary?: boolean
  }>
  onChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onQuickPrompt?: (prompt: string) => void
}

const QUICK_PROMPTS = [
  '像老师一样讲这手',
  '只说我下次怎么想',
  '把变化讲短一点'
]

export function TeacherComposerPro({ value, busy = false, actions = [], onChange, onSubmit, onQuickPrompt }: TeacherComposerProProps): ReactElement {
  return (
    <form className="ks-composer-pro" onSubmit={onSubmit}>
      <div className="ks-composer-pro__chrome">
        <span>Ask GoMentor</span>
        {busy ? <small>Reading board...</small> : null}
      </div>
      {actions.length > 0 ? (
        <div className="ks-composer-pro__actions" aria-label="老师快捷动作">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? 'is-primary' : ''}
              onClick={action.onClick}
              disabled={busy || action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ks-composer-pro__quick">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onQuickPrompt?.(prompt)} disabled={busy}>
            {prompt}
          </button>
        ))}
      </div>
      <div className="ks-composer-pro__box">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="输入复盘问题..."
        />
        <button type="submit" disabled={busy || !value.trim()}>
          {busy ? '分析中' : '发送'}
        </button>
      </div>
    </form>
  )
}
