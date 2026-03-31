# KataSensei

专业围棋复盘桌面应用。用 KataGo 做判断，用大语言模型做讲解，把“AI 觉得哪里不对”翻译成“学生能听懂、能马上改”的训练建议。

[English](./README_EN.md) | [日本語](./README_JA.md) | [한국어](./README_KO.md)

## 这是什么

KataSensei 是一个面向普通围棋用户的本地优先桌面程序，核心目标只有一个:

- 上传 SGF 就能复盘
- 输入野狐昵称或 UID 就能同步公开棋谱
- 用 KataGo 找出关键错手
- 用 LLM 解释“为什么错、正确思路是什么、怎么练”
- 让小白用户尽量不用碰命令行

## 亮点

- `一键复盘`: 上传棋谱后直接生成 Markdown + JSON 复盘产物
- `野狐同步`: 参考 `lizzyzy-youhua` 的恢复链路，支持野狐昵称/UID 获取公开棋谱
- `KataGo 优先`: 所有关键错手都由 KataGo 数值与变化支撑
- `LLM 解说`: 可接 OpenAI 兼容接口，把专业变化翻成学生能读懂的话
- `自管 Python 运行时`: 应用会在 `~/.katasensei/runtime/venv` 准备自己的 Python 环境，避开系统 Python 限制
- `本地优先`: 棋谱和复盘结果默认保存在 `~/.katasensei`
- `多平台`: Electron 桌面应用，可打包 macOS / Windows / Linux

## 用户流程

1. 启动 KataSensei
2. 在右侧填入 `KataGo binary / config / model`
3. 选择一种导入方式
4. `上传 SGF`
5. 或 `同步野狐`
6. 填学生名字或野狐 ID
7. 点击 `开始复盘`
8. 在中间面板直接查看报告，也可以打开生成的 Markdown / JSON 文件

## 快速开始

### 方式一：开发环境直接运行

```bash
pnpm install
python3 -m pip install -r scripts/requirements.txt
pnpm dev
```

### 方式二：尽量一键

macOS / Linux:

```bash
bash scripts/bootstrap.sh
```

Windows PowerShell:

```powershell
./scripts/bootstrap.ps1
```

## 依赖要求

- Node.js 20+
- pnpm 10+
- Python 3.10+
- KataGo
- 一个可用的 KataGo 模型文件
- 可选: OpenAI 兼容 LLM API Key

## KataGo 准备

项目附带一个轻量准备脚本:

```bash
python3 scripts/install_katago_latest.py
```

它会尝试:

- 检查本机是否已有 `katago`
- 在 macOS 上通过 Homebrew 安装 KataGo
- 从 `katagotraining.org` 获取最新模型链接
- 建立 `~/.katago/models/latest-kata1.bin.gz`
- 生成一个基础 `analysis_example.cfg`

## 项目结构

```text
src/main            Electron 主进程、IPC、棋谱库、野狐同步、Python 调度
src/preload         安全桥接层
src/renderer        React UI
scripts/review_game.py
                    SGF + KataGo + 可选 LLM 复盘流水线
scripts/install_katago_latest.py
                    KataGo 安装辅助
docs/ARCHITECTURE.md
                    架构说明
```

## 复盘结果会输出什么

- `review.md`: 面向学生/教练的可读报告
- `review.json`: 结构化错手数据，可做后续统计或训练计划

默认输出目录:

```text
~/.katasensei/reviews/<game-id>/
```

## 当前阶段

这是一版已经可构建、可运行、主链路打通的产品化骨架，适合作为真正的 GitHub 项目继续演进。下一步最自然的增强方向是:

- 更完整的 KataGo JSON 分析字段接入
- 局部形势图 / 胜率图可视化
- 多盘批量复盘
- 用户画像、弱点统计、训练计划自动汇总
- 自动下载正式发布包

## 本轮真实测试

已在本机完成这些实际验证:

- 本机 `KataGo v1.16.4` 可正常调用
- 本机 `cliproxyapi` 在 `127.0.0.1:8317` 可用，`gpt-5-codex-mini` 可正常返回讲解
- `scripts/review_game.py` 已真实跑通，产出 Markdown / JSON 报告
- Electron 开发模式和打包后的 `.app` 都已实际启动
- 使用 `computer-use-macos` 运行时做了桌面窗口截图验证

## 开发命令

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm package
```

## CI

GitHub Actions 会自动执行:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm build`

## 致谢

- KataGo
- sgfmill
- Fox/野狐公开棋谱接口恢复思路参考 `lizzyzy-youhua`
