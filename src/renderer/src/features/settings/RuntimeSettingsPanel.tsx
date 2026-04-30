import type { FormEvent, ReactElement } from 'react'
import { useState } from 'react'

export function RuntimeSettingsPanel({
  baseUrl,
  model,
  hasApiKey,
  busy,
  testMessage,
  onSubmit,
  onTest
}: {
  baseUrl: string
  model: string
  hasApiKey: boolean
  busy: boolean
  testMessage: string
  onSubmit: (form: HTMLFormElement) => void
  onTest: (form: HTMLFormElement) => void
}): ReactElement {
  const [showApiKey, setShowApiKey] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSubmit(event.currentTarget)
  }
  return (
    <form className="runtime-settings" onSubmit={submit}>
      <header>
        <p className="eyebrow">运行设置</p>
        <h2>Claude 兼容代理</h2>
        <p>产品主打 Claude 老师能力，但通过 OpenAI-compatible 代理接入，方便统一模型和多模态调用。</p>
      </header>
      <label>
        Base URL
        <input
          name="llmBaseUrl"
          defaultValue={baseUrl}
          placeholder="http://127.0.0.1:8317/v1"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <label>
        API Key
        <div className="llm-secret-input-row">
          <input
            name="llmApiKey"
            type={showApiKey ? 'text' : 'password'}
            placeholder={hasApiKey ? '已保存；留空继续使用' : '输入兼容代理 API Key'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="ghost-button" type="button" onClick={() => setShowApiKey((value) => !value)}>
            {showApiKey ? '隐藏' : '显示 Key'}
          </button>
        </div>
      </label>
      <label>
        模型名
        <input
          name="llmModel"
          defaultValue={model}
          placeholder="claude-3-5-sonnet-latest"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="settings-actions">
        <button className="ghost-button" type="button" disabled={busy} onClick={(event) => onTest(event.currentTarget.form!)}>图片测试</button>
        <button className="primary-button" type="submit" disabled={busy}>保存</button>
      </div>
      {testMessage ? <p className="test-message">{testMessage}</p> : null}
    </form>
  )
}
