# Sprint 2 Delivery Notes

## 目标

把 P0 从“基础设施已合入”推进到“用户级交付闭环”：启动诊断能 gate 工作台、SGF/野狐能绑定学生画像、Teacher runtime 能稳定输出结构化老师结果、KataGo 内置资源策略可以进入打包验收。

## 新增模块

### KataGo Assets

- `data/katago/manifest.json`
- `scripts/prepare_katago_assets.mjs`
- `scripts/check_katago_assets.mjs`
- `src/main/services/katago/katagoAssets.ts`

### Library / Student Binding

- `src/main/services/library/gameIdentity.ts`
- `src/main/services/library/studentBinding.ts`

### Teacher Runtime Helpers

- `src/main/services/teacher/structuredResultParser.ts`
- `src/main/services/teacher/toolLogBuilder.ts`

### Renderer Components

- `DiagnosticsGate.tsx`
- `StudentBindingDialog.tsx`
- `StudentRailCard.tsx`
- `KataGoAssetsPanel.tsx`
- `TeacherRunCard.tsx`

## 本包不做的事

- 不提交实际 KataGo binary/model。
- 不直接修改 GitHub 远端。
- 不强制替换现有 `App.tsx`。
- 不一次性重做棋盘视觉；棋盘高级化放 Sprint 3。

## 验收

Sprint 2 合入后至少应满足：

- diagnostics gate 能阻止 blocked 状态进入主界面。
- LLM 未配置不 blocked，但老师按钮提示配置代理。
- SGF 导入后可绑定学生。
- 野狐昵称同步可自动创建/复用学生画像。
- 最近 10 局分析按 studentId 取数据。
- Teacher 输出可结构化渲染，LLM markdown 可 fallback。
- KataGo 资源缺失时 dev warning，release fail-fast。
