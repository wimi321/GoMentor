import type { FormEvent, ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { BoardInsightPanel } from '../board/BoardInsightPanel'
import { CandidateTooltip } from '../board/CandidateTooltip'
import { GoBoardV2 } from '../board/GoBoardV2'
import { KeyMoveNavigator } from '../board/KeyMoveNavigator'
import { WinrateTimelineV2 } from '../board/WinrateTimelineV2'
import { parseBoardPoint, type RenderKeyMove } from '../board/boardGeometry'
import { DiagnosticsPanel } from '../diagnostics/DiagnosticsPanel'
import { BetaAcceptancePanel } from '../release/BetaAcceptancePanel'
import { StudentBindingDialog } from '../student/StudentBindingDialog'
import { StudentRailCard } from '../student/StudentRailCard'
import { KataGoAssetsPanel } from '../settings/KataGoAssetsPanel'
import { RuntimeSettingsPanel } from '../settings/RuntimeSettingsPanel'
import { TeacherComposerPro } from '../teacher/TeacherComposerPro'
import { TeacherRunCardPro } from '../teacher/TeacherRunCardPro'
import {
  galleryAnalysis,
  galleryEvaluations,
  galleryKeyMoves,
  galleryReadinessFlags,
  galleryRecord,
  galleryStudent,
  galleryTeacherResult
} from './uiGalleryMock'
import './ui-gallery.css'

function keyMoveMarks(): RenderKeyMove[] {
  return galleryKeyMoves.flatMap((move) => {
    const point = parseBoardPoint(move.gtp, galleryRecord.boardSize)
    if (!point) {
      return []
    }
    const severity = move.severity && move.severity !== 'quiet' ? move.severity : 'turning-point'
    return [{
      ...point,
      moveNumber: move.moveNumber,
      severity,
      label: String(move.moveNumber)
    } satisfies RenderKeyMove]
  })
}

function noopForm(event: FormEvent): void {
  event.preventDefault()
}

export function UiGallery(): ReactElement {
  const [moveNumber, setMoveNumber] = useState(24)
  const [composerValue, setComposerValue] = useState('')
  const [dialogOpen, setDialogOpen] = useState(() => new URLSearchParams(window.location.search).has('dialog'))
  const boardKeyMoves = useMemo(() => keyMoveMarks(), [])

  return (
    <main className="ui-gallery">
      <header className="ui-gallery__hero">
        <div>
          <p className="eyebrow">Internal Visual QA</p>
          <h1>KataSensei UI Gallery</h1>
          <p>固定样例，不依赖真实 KataGo、LLM 或野狐同步。用于检查棋盘、老师智能体、学生栏、诊断与发布状态的视觉质量。</p>
        </div>
        <a href="/" className="ui-gallery__back">返回应用</a>
      </header>

      <section className="ui-gallery__grid ui-gallery__grid--main">
        <article className="ui-gallery__panel ui-gallery__panel--board">
          <div className="ui-gallery__panel-head">
            <strong>GoBoardV2 / CandidateTooltip</strong>
            <span>专业棋盘状态</span>
          </div>
          <GoBoardV2
            record={galleryRecord}
            moveNumber={moveNumber}
            analysis={galleryAnalysis}
            keyMoves={boardKeyMoves}
          />
          <div className="ui-gallery__floating-tooltip">
            <CandidateTooltip
              candidate={{
                order: 1,
                move: 'Q10',
                winrate: 0.6,
                scoreLead: 4.4,
                visits: 2410,
                prior: 0.19,
                note: '首选点：抢全局最大场，同时压住黑棋右边潜力。'
              }}
              position={{ x: 16, y: 16 }}
            />
          </div>
        </article>

        <article className="ui-gallery__panel ui-gallery__panel--teacher">
          <div className="ui-gallery__panel-head">
            <strong>TeacherRunCardPro</strong>
            <span>结构化讲解</span>
          </div>
          <TeacherRunCardPro
            result={galleryTeacherResult}
            markdown={galleryTeacherResult.markdown}
            onJumpToMove={setMoveNumber}
            onAnalyzeMove={setMoveNumber}
          />
          <TeacherRunCardPro running markdown="正在读取棋盘、调用 KataGo、检索教学卡并组织讲解..." />
          <TeacherComposerPro
            value={composerValue}
            busy={false}
            onChange={setComposerValue}
            onSubmit={noopForm}
            onQuickPrompt={setComposerValue}
          />
        </article>
      </section>

      <section className="ui-gallery__grid">
        <article className="ui-gallery__panel">
          <div className="ui-gallery__panel-head">
            <strong>WinrateTimelineV2</strong>
            <span>可拖拽胜率图</span>
          </div>
          <WinrateTimelineV2
            evaluations={galleryEvaluations}
            currentMoveNumber={moveNumber}
            totalMoves={72}
            onMove={setMoveNumber}
          />
          <KeyMoveNavigator
            moves={galleryKeyMoves}
            currentMoveNumber={moveNumber}
            onJump={setMoveNumber}
            onAnalyzeMove={setMoveNumber}
          />
        </article>

        <article className="ui-gallery__panel">
          <div className="ui-gallery__panel-head">
            <strong>BoardInsightPanel</strong>
            <span>候选点摘要</span>
          </div>
          <BoardInsightPanel analysis={galleryAnalysis} moveNumber={moveNumber} />
          <div className="ui-gallery__state-row">
            <div className="ui-gallery__state ui-gallery__state--empty">空棋盘：导入 SGF 后开始复盘</div>
            <div className="ui-gallery__state ui-gallery__state--error">LLM 暂时不可用：请检查多模态模型配置</div>
            <div className="ui-gallery__state ui-gallery__state--loading">KataGo 正在快速生成胜率图...</div>
          </div>
        </article>
      </section>

      <section className="ui-gallery__grid ui-gallery__grid--three">
        <article className="ui-gallery__panel">
          <div className="ui-gallery__panel-head">
            <strong>StudentRailCard</strong>
            <span>学生工作区</span>
          </div>
          <StudentRailCard
            displayName={galleryStudent.displayName}
            primaryFoxNickname={galleryStudent.primaryFoxNickname}
            gameCount={galleryStudent.recentGameIds.length}
            lastAnalyzedAt={galleryStudent.lastAnalyzedAt}
            weaknessStats={galleryStudent.weaknessStats}
            trainingFocus={galleryStudent.trainingFocus}
            onAnalyzeRecent={() => undefined}
          />
          <button className="ghost-button" type="button" onClick={() => setDialogOpen(true)}>打开 SGF 绑定弹窗</button>
        </article>

        <article className="ui-gallery__panel">
          <div className="ui-gallery__panel-head">
            <strong>DiagnosticsGate</strong>
            <span>启动诊断</span>
          </div>
          <DiagnosticsPanel
            report={{
              overall: 'fixable',
              summary: 'KataGo 已就绪，LLM 代理需要配置 API Key 后即可进行多模态讲解。',
              generatedAt: new Date().toISOString(),
              checks: [
                { id: 'katago', title: 'KataGo 引擎', status: 'pass', required: true, detail: '内置引擎和默认模型已找到。' },
                { id: 'llm', title: 'Claude 兼容代理', status: 'warn', required: false, detail: '尚未保存 API Key。', action: '进入设置页完成图片输入测试。' },
                { id: 'profile', title: '用户目录', status: 'pass', required: true, detail: '学生画像和报告目录可写。' }
              ]
            }}
            onRetry={() => undefined}
            onContinue={() => undefined}
          />
        </article>

        <article className="ui-gallery__panel">
          <div className="ui-gallery__panel-head">
            <strong>Settings / BetaAcceptance</strong>
            <span>运行设置</span>
          </div>
          <RuntimeSettingsPanel
            baseUrl="http://127.0.0.1:8317/v1"
            model="gpt-5.4"
            hasApiKey
            busy={false}
            testMessage="图片输入测试通过，老师可以接收棋盘截图。"
            onSubmit={() => undefined}
            onTest={() => undefined}
          />
          <KataGoAssetsPanel
            status={{
              platformKey: 'darwin-arm64',
              manifestFound: true,
              binaryPath: 'data/katago/bin/darwin-arm64/katago',
              binaryFound: true,
              binaryExecutable: true,
              modelPath: 'data/katago/models/default.bin.gz',
              modelFound: true,
              modelDisplayName: 'official b18 recommended',
              ready: true,
              detail: '开发样例：内置资源路径和运行时解析一致。'
            }}
            onRefresh={() => undefined}
          />
          <BetaAcceptancePanel
            flags={galleryReadinessFlags}
            items={[
              { id: 'automation', label: '自动化检查', status: 'pass', detail: '本地与 CI 检查通过。' },
              { id: 'assets', label: 'KataGo 资源', status: 'pass', detail: 'release layout 检查通过。' },
              { id: 'signing', label: '签名与公证', status: 'warn', detail: 'Public beta 前需要人工签名材料。' },
              { id: 'visual', label: '视觉 QA', status: 'warn', detail: '需要本页面截图证据。' }
            ]}
            onRunChecks={() => undefined}
          />
        </article>
      </section>

      <StudentBindingDialog
        open={dialogOpen}
        blackName={galleryRecord.game.black}
        whiteName={galleryRecord.game.white}
        suggestions={[galleryStudent]}
        onClose={() => setDialogOpen(false)}
        onSkip={() => setDialogOpen(false)}
        onBindExisting={() => setDialogOpen(false)}
        onCreateStudent={() => setDialogOpen(false)}
      />
    </main>
  )
}
