export type ToolLogStatus = 'running' | 'done' | 'error' | 'skipped'

export interface TeacherToolLog {
  id: string
  label: string
  status: ToolLogStatus
  detail: string
  startedAt?: string
  finishedAt?: string
  errorCode?: string
}

export function startToolLog(id: string, label: string, detail = ''): TeacherToolLog {
  return {
    id,
    label,
    status: 'running',
    detail,
    startedAt: new Date().toISOString()
  }
}

export function finishToolLog(log: TeacherToolLog, detail?: string): TeacherToolLog {
  return {
    ...log,
    status: 'done',
    detail: detail ?? log.detail,
    finishedAt: new Date().toISOString()
  }
}

export function failToolLog(log: TeacherToolLog, error: unknown, errorCode?: string): TeacherToolLog {
  return {
    ...log,
    status: 'error',
    detail: error instanceof Error ? error.message : String(error),
    errorCode,
    finishedAt: new Date().toISOString()
  }
}

export function skippedToolLog(id: string, label: string, detail: string): TeacherToolLog {
  return {
    id,
    label,
    status: 'skipped',
    detail,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString()
  }
}

export function compactToolLogsForPrompt(logs: TeacherToolLog[]): string {
  return logs.map((log) => `${log.label}: ${log.status} - ${log.detail}`).join('\n')
}
