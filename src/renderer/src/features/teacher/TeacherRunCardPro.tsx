import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { TeacherKeyMoveActions, type TeacherKeyMoveActionItem } from './TeacherKeyMoveActions'
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

function pickStructured(result: unknown): AnyRecord {
  const record = asRecord(result)
  return asRecord(record.structured ?? record.structuredResult ?? record.result ?? record.analysisCard ?? result)
}

function pickSummary(structured: AnyRecord, markdown?: string): string {
  return stringValue(structured.headline) || stringValue(structured.summary) || stringValue(structured.oneLineSummary) || stringValue(structured.title) || (markdown ?? '').split('\n').find((line) => line.trim())?.trim() || '老师正在整理这盘棋的重点。'
}

function pickKeyMoves(structured: AnyRecord): AnyRecord[] {
  return arrayValue(structured.keyMoves ?? structured.keyMistakes ?? structured.turningPoints).map(asRecord).slice(0, 8)
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function pickTraining(structured: AnyRecord): string[] {
  const raw = structured.trainingPlan ?? structured.trainingSuggestions ?? structured.drills ?? structured.nextSteps
  if (Array.isArray(raw)) {
    return raw.map((item) => typeof item === 'string' ? item : stringValue(asRecord(item).text ?? asRecord(item).title)).filter(Boolean).slice(0, 5)
  }
  const text = stringValue(raw)
  return text ? [text] : []
}

function pickStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item : stringValue(asRecord(item).text ?? asRecord(item).title ?? asRecord(item).summary)).filter(Boolean)
  }
  const text = stringValue(value)
  return text ? [text] : []
}

function pickEvidence(structured: AnyRecord): string[] {
  const raw = structured.evidence ?? structured.katagoEvidence ?? structured.reasoningEvidence
  if (Array.isArray(raw)) {
    return raw.map((item) => typeof item === 'string' ? item : stringValue(asRecord(item).text ?? asRecord(item).label)).filter(Boolean).slice(0, 5)
  }
  const text = stringValue(raw)
  if (text) {
    return [text]
  }
  return pickKeyMoves(structured)
    .map((move) => stringValue(move.evidence))
    .filter(Boolean)
    .slice(0, 4)
}

function pickRecommendations(structured: AnyRecord): string[] {
  return pickStringList(structured.recommendations ?? structured.correctThinking ?? structured.suggestions ?? structured.nextThinking).slice(0, 5)
}

function pickFollowups(structured: AnyRecord): string[] {
  return pickStringList(structured.followupQuestions ?? structured.followups ?? structured.askNext).slice(0, 4)
}

function pickErrorTypes(structured: AnyRecord, keyMoves: AnyRecord[]): string[] {
  const explicit = pickStringList(structured.errorTypes ?? structured.mistakeTypes)
  const fromMoves = keyMoves.map((move) => stringValue(move.errorType ?? move.type ?? move.severity)).filter(Boolean)
  return Array.from(new Set([...explicit, ...fromMoves])).slice(0, 5)
}

function pickToolLogs(result: unknown): AnyRecord[] {
  return arrayValue(asRecord(result).toolLogs).map(asRecord)
}

function moveTitle(move: AnyRecord, index: number): string {
  const moveNumber = move.moveNumber ?? move.move ?? move.n
  const title = stringValue(move.title ?? move.label ?? move.problem)
  return title || `关键手 ${moveNumber ? `第 ${String(moveNumber)} 手` : index + 1}`
}

function keyMoveActions(moves: AnyRecord[]): TeacherKeyMoveActionItem[] {
  return moves.flatMap((move, index) => {
    const moveNumber = numberValue(move.moveNumber ?? move.n ?? move.moveNo ?? move.turn)
    if (moveNumber === undefined) {
      return []
    }
    return [{
      moveNumber,
      title: moveTitle(move, index),
      summary: stringValue(move.summary ?? move.reason ?? move.explanation ?? move.problem),
      severity: stringValue(move.severity ?? move.errorType ?? move.type)
    }]
  })
}

export function TeacherRunCardPro({
  result,
  markdown = '',
  running = false,
  onJumpToMove,
  onAnalyzeMove
}: TeacherRunCardProProps): ReactElement {
  const [toolsOpen, setToolsOpen] = useState(false)
  const structured = useMemo(() => pickStructured(result), [result])
  const summary = pickSummary(structured, markdown)
  const keyMoves = pickKeyMoves(structured)
  const actionMoves = keyMoveActions(keyMoves)
  const training = pickTraining(structured)
  const evidence = pickEvidence(structured)
  const recommendations = pickRecommendations(structured)
  const followups = pickFollowups(structured)
  const errorTypes = pickErrorTypes(structured, keyMoves)
  const toolLogs = pickToolLogs(result)
  const error = stringValue(asRecord(result).error ?? structured.error)
  const detailSummary = stringValue(structured.summary)
  const responseSummary = detailSummary && detailSummary !== summary ? detailSummary : summary

  return (
    <article className={`ks-teacher-pro-card ks-agent-response ${running ? 'ks-teacher-pro-card--running' : ''}`}>
      <header className="ks-teacher-pro-card__header">
        <div>
          <span className="ks-teacher-pro-card__eyebrow">assistant response</span>
          <h3>{running ? '正在分析棋局…' : summary}</h3>
        </div>
        <span className="ks-teacher-pro-card__status">{running ? '执行中' : error ? '需处理' : '完成'}</span>
      </header>

      {error ? <div className="ks-teacher-pro-error">{error}</div> : null}

      {!running ? (
        <section className="ks-teacher-pro-summary">
          <span>一句话结论</span>
          <p>{responseSummary}</p>
        </section>
      ) : (
        <section className="ks-teacher-pro-summary ks-teacher-pro-summary--loading">
          <span>agent is working</span>
          <p>正在看棋盘、查 KataGo 候选点、检索教学卡，并把结果整理成学生能执行的训练建议。</p>
        </section>
      )}

      {evidence.length > 0 ? (
        <details className="ks-teacher-pro-section ks-agent-item">
          <summary><span>KataGo 证据</span><em>{evidence.length}</em></summary>
          <div className="ks-teacher-pro-evidence">
            {evidence.map((item, index) => <div key={`${index}-${item}`}><span>{index + 1}</span><p>{item}</p></div>)}
          </div>
        </details>
      ) : null}

      {errorTypes.length > 0 ? (
        <details className="ks-teacher-pro-section ks-agent-item">
          <summary><span>错误类型</span><em>{errorTypes.length}</em></summary>
          <div className="ks-teacher-pro-tags">
            {errorTypes.map((item) => <span key={item}>{item}</span>)}
          </div>
        </details>
      ) : null}

      {keyMoves.length > 0 ? (
        <details className="ks-teacher-pro-section ks-agent-item" open>
          <summary><span>关键问题手</span><em>{keyMoves.length}</em></summary>
          <div className="ks-keymove-card-list">
            {keyMoves.map((move, index) => (
              <div key={index} className="ks-keymove-card">
                <div className="ks-keymove-card__top">
                  <strong>{moveTitle(move, index)}</strong>
                  <span>{stringValue(move.severity ?? move.errorType ?? move.type) || '重点'}</span>
                </div>
                <p>{stringValue(move.explanation ?? move.reason ?? move.summary ?? move.problem) || '这手需要结合棋盘和 KataGo 候选点重点复盘。'}</p>
                {stringValue(move.bestMove ?? move.recommendation ?? move.suggestion) ? (
                  <small>建议：{stringValue(move.bestMove ?? move.recommendation ?? move.suggestion)}</small>
                ) : null}
              </div>
            ))}
          </div>
          <TeacherKeyMoveActions moves={actionMoves} onJumpToMove={onJumpToMove} onAnalyzeMove={onAnalyzeMove} />
        </details>
      ) : null}

      {training.length > 0 ? (
        <details className="ks-teacher-pro-section ks-agent-item">
          <summary><span>训练建议</span><em>{training.length}</em></summary>
          <ol className="ks-teacher-pro-training">
            {training.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ol>
        </details>
      ) : null}

      {recommendations.length > 0 ? (
        <details className="ks-teacher-pro-section ks-agent-item">
          <summary><span>推荐思路</span><em>{recommendations.length}</em></summary>
          <div className="ks-teacher-pro-recommendations">
            {recommendations.map((item, index) => <span key={`${index}-${item}`}>{item}</span>)}
          </div>
        </details>
      ) : null}

      {followups.length > 0 ? (
        <details className="ks-teacher-pro-section ks-agent-item">
          <summary><span>可继续追问</span><em>{followups.length}</em></summary>
          <div className="ks-teacher-pro-followups">
            {followups.map((item) => <button key={item} type="button">{item}</button>)}
          </div>
        </details>
      ) : null}

      {markdown && keyMoves.length === 0 && training.length === 0 ? (
        <section className="ks-teacher-pro-markdown">
          {markdown}
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
                  <strong>{stringValue(log.label ?? log.tool ?? log.name) || '工具调用'}</strong>
                  <span>{stringValue(log.detail ?? log.message ?? log.status) || '完成'}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}
