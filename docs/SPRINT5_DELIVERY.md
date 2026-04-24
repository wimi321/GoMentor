# Sprint 5 Delivery

## Sprint 5 目标

Sprint 5 不继续扩功能，而是把 P0 分支推到可开 PR、可做安装包实测、可发布 Release Candidate 的状态。

## 本包交付

### Scripts

- `scripts/p0_release_candidate_check.mjs`
  - 检查 package scripts、builder 资源配置、workflow、关键源码、知识库、文档、资源策略。
- `scripts/verify_release_artifacts.mjs`
  - 检查 `release/` 下 macOS / Windows 安装包是否存在，dev 模式允许无产物。
- `scripts/collect_release_evidence.mjs`
  - 采集当前 commit、package、检查结果、资源状态，输出到 `release-evidence/`。

### GitHub

- `.github/workflows/p0-release-candidate.yml`
  - 对 P0 分支和 PR 执行 RC readiness 检查。
- `.github/PULL_REQUEST_TEMPLATE/p0-beta.md`
  - P0 Beta PR 模板。

### Docs

- `docs/RC_RELEASE_GUIDE.md`
- `docs/RELEASE_SMOKE_MATRIX.md`
- `docs/VISUAL_QA_CAPTURE_GUIDE.md`
- `docs/KATAGO_RELEASE_ASSETS_CHECKLIST.md`
- `docs/P0_BETA_PR_DESCRIPTION.md`

### Renderer

- `ReleaseReadinessPanel.tsx`
- `release-readiness.css`

该组件是轻量展示组件，Codex 合入时可以接到 Settings Drawer 或 BetaAcceptancePanel 旁边。

## 本轮不做

- 不提交 KataGo 大二进制和模型。
- 不生成真实安装包。
- 不直接创建 GitHub Release。
- 不合并 main。

## Sprint 5 完成后建议

- 创建 PR：`feature/p0-productization` → `main`
- 在 PR 内跑 P0 RC workflow
- 在本地/CI 准备真实 KataGo assets
- 分别在 Windows/macOS 生成安装包并人工 smoke test
- 若通过，打 `v0.2.0-beta.1`
