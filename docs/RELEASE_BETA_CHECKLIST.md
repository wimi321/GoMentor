# KataSensei P0 Beta Release Checklist

## 1. 必备检查

- [ ] `pnpm install` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm build` 通过
- [ ] `pnpm check` 通过
- [ ] `node scripts/check_katago_assets.mjs --mode=release` 通过
- [ ] `node scripts/p0_beta_acceptance.mjs` 通过
- [ ] `node scripts/package_artifact_smoke.mjs --mode=release` 通过

## 2. macOS

- [ ] arm64 安装包可启动
- [ ] x64 安装包可启动
- [ ] 内置 KataGo 可执行
- [ ] 默认模型可读
- [ ] 首启诊断 ready 或 warning 可解释
- [ ] SGF 导入可用
- [ ] 野狐昵称同步可用
- [ ] 当前手分析可用
- [ ] 整盘分析可用
- [ ] 最近 10 局分析可用

## 3. Windows

- [ ] x64 安装包可启动
- [ ] 中文路径下可启动
- [ ] 内置 KataGo 可执行
- [ ] 默认模型可读
- [ ] 用户数据目录可写
- [ ] SGF 导入可用
- [ ] 野狐昵称同步可用
- [ ] Claude 兼容代理测试可用
- [ ] 当前手/整盘/最近 10 局分析可用

## 4. UI 验收

- [ ] 棋盘不再像开发工具
- [ ] 候选点不遮挡主要棋子
- [ ] 候选点 tooltip 清楚
- [ ] 老师卡片结构清楚
- [ ] 关键手能跳转
- [ ] 工具日志默认折叠
- [ ] 错误提示有用户可读文案

## 5. 发布文档

- [ ] README 当前状态更新
- [ ] `docs/KATAGO_ASSETS.md` 完整
- [ ] `docs/DIAGNOSTICS.md` 完整
- [ ] `docs/TEACHER_RUNTIME.md` 完整
- [ ] Release notes 写明 Beta 限制

## 6. 发布前禁止项

- [ ] 没有 token/API key
- [ ] 没有 `.env`
- [ ] 没有 zip 包误提交
- [ ] 没有 node_modules/out/release 误提交
- [ ] 没有未经策略确认的大模型/大二进制普通 Git 提交
