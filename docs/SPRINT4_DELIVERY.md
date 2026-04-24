# Sprint 4 Delivery

## 目标

Sprint 4 聚焦 P0 Beta 发布前闭环：交互验收、关键手跳转、打包 smoke、视觉验收和 release readiness。

## 新增内容

### Renderer

- `CandidateTooltip`：候选点悬停详情。
- `KeyMoveNavigator`：关键手列表与跳转动作。
- `TeacherKeyMoveActions`：老师卡片内关键手动作按钮。
- `BetaAcceptancePanel`：设置页/诊断页展示 P0 Beta readiness。
- `timelineInteraction.ts`：胜率图拖拽/定位纯函数。

### Main

- `release/readiness.ts`：检查 P0 交付状态的服务草案。

### Scripts

- `p0_beta_acceptance.mjs`：静态验收脚本。
- `package_artifact_smoke.mjs`：打包产物 smoke check。

### Tests

- `sprint4-release-contract.test.mjs`：检查 Sprint 4 合同文件与关键导出。

### Docs

- `RELEASE_BETA_CHECKLIST.md`
- `VISUAL_QA_CHECKLIST.md`
- `P0_PR_REVIEW_TEMPLATE.md`

## 不做什么

- 不提交 KataGo binary/model。
- 不重写后端主链路。
- 不删除旧组件 fallback。
- 不把 Electron 自动更新做成 P0 阻塞项。

## Sprint 4 完成标准

- 老师卡片能跳转关键手。
- 棋盘候选点能显示 tooltip。
- 胜率图定位逻辑有测试。
- P0 Beta 脚本能跑出清晰结果。
- Windows/macOS release readiness 文档齐全。
