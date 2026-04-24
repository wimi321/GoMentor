# P0 Beta Visual QA Checklist

Visual QA is manual required before tagging `v0.2.0-beta.1`. Keep screenshots in `release-evidence/` or attach them to the PR/release discussion. Do not commit local screenshots by default.

Sprint 7 adds a stable mock route for visual QA:

```text
http://localhost:5173/#/ui-gallery
```

See `docs/VISUAL_QA_CAPTURE.md` for automated screenshot capture.

## 必备截图

- [ ] DiagnosticsGate
- [ ] Main workbench
- [ ] GoBoardV2
- [ ] CandidateTooltip
- [ ] WinrateTimelineV2
- [ ] BoardInsightPanel
- [ ] TeacherRunCardPro
- [ ] TeacherKeyMoveActions
- [ ] SGF bind dialog
- [ ] Student rail card
- [ ] Settings readiness panel
- [ ] UI Gallery overview
- [ ] Empty/error/loading states

## 棋盘

- [ ] 19 路棋盘完整显示
- [ ] 棋盘木纹自然，不显脏、不偏亮橙
- [ ] 坐标清晰但不抢眼
- [ ] 黑白棋子边缘/阴影自然
- [ ] 最后一手标记清楚
- [ ] 第一候选点最突出
- [ ] 次级候选点克制
- [ ] 推荐点文字可读
- [ ] 鼠标悬停显示候选点详情
- [ ] tooltip 不遮挡当前点

## 胜率图

- [ ] 当前手竖线准确
- [ ] 问题手标记清楚
- [ ] 拖拽/点击定位手数准确
- [ ] hover tooltip 显示手数、胜率、目差、损失类型
- [ ] 关键手导航呈现为分析 strip，不像普通按钮列表
- [ ] 空数据时有清楚占位
- [ ] 不因为图表重绘导致卡顿明显

## 老师区

- [ ] 总结卡第一屏可读
- [ ] 证据卡和训练卡层级清楚
- [ ] 工具日志默认折叠
- [ ] 展开工具日志后不破坏布局
- [ ] 关键手按钮能跳转棋盘
- [ ] markdown fallback 仍可显示

## 诊断/设置

- [ ] Ready/Warning/Blocked 视觉区分明确
- [ ] 缺 LLM 不阻塞基础使用
- [ ] 缺 KataGo 的提示可理解
- [ ] KataGo 资源状态展示路径和建议动作
- [ ] Release readiness 明确显示 publicBetaReady=false，直到签名、Windows smoke、视觉 QA 都完成

## 截图建议

发布前至少留 11 张截图：

1. 首启诊断 ready/warning 状态。
2. 设置页 readiness panel。
3. 主工作台三栏布局。
4. SGF 导入并绑定学生。
5. 野狐昵称同步后的学生卡。
6. 当前手分析：棋盘 + 老师卡片。
7. 候选点 tooltip。
8. 胜率图点击/拖拽状态。
9. BoardInsightPanel。
10. 整盘复盘：关键手列表 + 胜率图。
11. 最近 10 局训练计划。

## Evidence

Use `docs/VISUAL_QA_EVIDENCE_TEMPLATE.md` to record the final result.
