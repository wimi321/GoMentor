import type { ReactElement } from 'react'
import { useState } from 'react'
import './teacher-pro.css'

interface TeacherRunCardProProps {
  result?: unknown
  markdown?: string
  running?: boolean
  onJumpToMove?: (moveNumber: number) => void
  onAnalyzeMove?: (moveNumber: number) => void
}

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return typeof value === 'object' && value !== null ? value as AnyRecord : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickToolLogs(result: unknown): AnyRecord[] {
  return arrayValue(asRecord(result).toolLogs).map(asRecord)
}

function pickAssistantText(result: unknown, markdown: string): string {
  if (markdown.trim()) return markdown.trim()
  const record = asRecord(result)
  const structured = asRecord(record.structured ?? record.structuredResult)
  return stringValue(record.markdown) || stringValue(structured.markdown)
}

function toolTitle(log: AnyRecord): string {
  const name = stringValue(log.name)
  const byName: Record<string, string> = {
    'library.findGames': '筛选棋谱',
    'sgf.readGameRecord': '读取棋谱',
    'katago.analyzePosition': 'KataGo 当前局面',
    'katago.analyzeGameBatch': 'KataGo 整盘分析',
    'board.captureTeachingImage': '读取棋盘图',
    'knowledge.searchLocal': '检索知识库',
    'studentProfile.read': '读取棋手画像',
    'studentProfile.write': '更新棋手画像',
    'system.detectEnvironment': '检查环境',
    'settings.writeAppConfig': '写入设置',
    'katago.verifyAnalysis': '验证 KataGo',
    'web.searchGoKnowledge': '联网检索',
    'filesystem.read': '读取文件',
    'shell.exec': '执行 Shell',
    'shell.kill': '停止 Shell',
    'report.saveAnalysis': '保存报告'
  }
  return byName[name] ?? stringValue(log.label ?? log.tool) ?? '调用工具'
}

export function TeacherRunCardPro({
  result,
  markdown = '',
  running = false
}: TeacherRunCardProProps): ReactElement {
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolLogs = pickToolLogs(result)
  const error = stringValue(asRecord(result).error)
  const assistantText = pickAssistantText(result, markdown)

  return (
    <article className={`ks-teacher-pro-card ks-agent-response ${running ? 'ks-teacher-pro-card--running' : ''}`}>
      <header className="ks-teacher-pro-card__header">
        <div>
          <span className="ks-teacher-pro-card__eyebrow">GoMentor</span>
          <h3>{running ? '正在思考…' : 'assistant response'}</h3>
        </div>
        <span className="ks-teacher-pro-card__status">{running ? '执行中' : error ? '需处理' : '完成'}</span>
      </header>

      {error ? <div className="ks-teacher-pro-error">{error}</div> : null}

      {running && !assistantText ? (
        <section className="ks-teacher-pro-summary ks-teacher-pro-summary--loading">
          <span>agent is working</span>
          <p>正在调用工具并组织回答…</p>
        </section>
      ) : null}

      {assistantText ? (
        <section className="ks-teacher-pro-markdown">
          {assistantText}
        </section>
      ) : null}

      {toolLogs.length > 0 ? (
        <section className="ks-tool-log-pro">
          <button type="button" onClick={() => setToolsOpen((value) => !value)}>
            {toolsOpen ? '收起工具调用' : `查看工具调用 · ${toolLogs.length}`}
          </button>
          {toolsOpen ? (
            <div className="ks-tool-log-pro__rows">
              {toolLogs.map((log, index) => (
                <div key={index} className={`ks-tool-log-pro__row ks-tool-log-pro__row--${stringValue(log.status) || 'done'}`}>
                  <span aria-hidden="true" />
                  <strong>{toolTitle(log)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}
