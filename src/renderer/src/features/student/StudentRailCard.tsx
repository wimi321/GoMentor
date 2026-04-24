import type { ReactElement } from 'react'
import './student.css'

export interface StudentRailCardProps {
  displayName?: string
  primaryFoxNickname?: string
  gameCount?: number
  lastAnalyzedAt?: string
  weaknessStats?: Record<string, number>
  onAnalyzeRecent?: () => void
}

export function StudentRailCard({ displayName, primaryFoxNickname, gameCount = 0, lastAnalyzedAt, weaknessStats = {}, onAnalyzeRecent }: StudentRailCardProps): ReactElement {
  const topWeakness = Object.entries(weaknessStats).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return (
    <section className="student-rail-card">
      <div className="student-rail-head">
        <span>当前学生</span>
        <strong>{displayName || primaryFoxNickname || '未绑定'}</strong>
      </div>
      {primaryFoxNickname ? <p>野狐：{primaryFoxNickname}</p> : <p>可上传 SGF 后绑定学生，或输入野狐昵称创建画像。</p>}
      <dl>
        <div><dt>棋谱</dt><dd>{gameCount} 盘</dd></div>
        <div><dt>最近分析</dt><dd>{lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleDateString() : '暂无'}</dd></div>
      </dl>
      <div className="student-weakness-list">
        {topWeakness.length > 0 ? topWeakness.map(([name, count]) => <span key={name}>{name} × {count}</span>) : <span>暂无稳定弱点</span>}
      </div>
      <button className="ghost-button" disabled={!onAnalyzeRecent || gameCount === 0} onClick={onAnalyzeRecent}>分析最近 10 局</button>
    </section>
  )
}
