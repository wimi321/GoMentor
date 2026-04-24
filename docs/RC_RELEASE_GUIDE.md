# KataSensei P0 Release Candidate Guide

## 1. 目标

P0 RC 的目标不是功能扩张，而是验证：

1. 用户能安装应用。
2. 应用能自检 KataGo / Claude 兼容代理 / 用户目录。
3. 用户能导入 SGF。
4. 用户能输入野狐昵称同步棋谱。
5. 当前手、整盘、最近 10 局分析能跑通。
6. 学生画像能根据野狐昵称持续更新。
7. Windows + macOS 均可用。

## 2. 发布前必做

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check
node scripts/check_katago_assets.mjs --mode=dev
node scripts/p0_beta_acceptance.mjs
node scripts/package_artifact_smoke.mjs --mode=dev
node scripts/p0_release_candidate_check.mjs --mode=dev
node scripts/verify_release_artifacts.mjs --mode=dev
node scripts/collect_release_evidence.mjs --mode=dev
```

## 3. 准备真实 KataGo assets

P0 策略是不把大型 binary/model 普通 Git 提交。

Release 前必须在 runner 或本地准备：

```text
data/katago/bin/darwin-arm64/katago
data/katago/bin/darwin-x64/katago
data/katago/bin/win32-x64/katago.exe
data/katago/models/<default-b18-model>.bin.gz
```

然后运行：

```bash
node scripts/check_katago_assets.mjs --mode=release
node scripts/p0_release_candidate_check.mjs --mode=release
```

## 4. 生成安装包

macOS：

```bash
pnpm dist:mac
node scripts/verify_release_artifacts.mjs --mode=release
```

Windows：

```bash
pnpm dist:win
node scripts/verify_release_artifacts.mjs --mode=release
```

## 5. 人工 Smoke

详见：

- `docs/RELEASE_SMOKE_MATRIX.md`
- `docs/VISUAL_QA_CAPTURE_GUIDE.md`
- `docs/KATAGO_RELEASE_ASSETS_CHECKLIST.md`

## 6. Release Candidate 命名

建议：

```text
v0.2.0-beta.1
```

## 7. 不要发布的情况

出现以下任一情况不要发布：

- Windows 或 macOS 无法启动。
- KataGo release asset 缺失。
- SGF 导入后无法打开棋局。
- 野狐昵称同步失败且没有可理解错误。
- 老师分析输出为空或无法展示。
- 学生画像无法写入。
- 诊断页显示 blocked 但用户仍可进入分析主链路。
