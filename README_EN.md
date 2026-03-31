# KataSensei

A desktop Go review studio that combines KataGo analysis with LLM explanations so human students can understand not only what was wrong, but why it was wrong and how to improve.

[中文](./README.md) | [日本語](./README_JA.md) | [한국어](./README_KO.md)

## Highlights

- Import local `SGF` files
- Sync recent public Fox/野狐 games by nickname or UID
- Detect major mistakes with KataGo
- Produce student-friendly coaching notes with an OpenAI-compatible LLM
- Keep SGFs and reports local by default
- Build for macOS, Windows, and Linux

## Quick Start

```bash
pnpm install
python3 -m pip install -r scripts/requirements.txt
pnpm dev
```

Or use the helper bootstrap script:

```bash
bash scripts/bootstrap.sh
```

## Review Pipeline

1. Import an SGF or sync Fox games
2. Configure KataGo paths once
3. Click `Start Review`
4. KataSensei writes:
   - `review.md`
   - `review.json`

Default output location:

```text
~/.katasensei/reviews/<game-id>/
```

## Stack

- Electron
- React
- TypeScript
- Python
- KataGo
- sgfmill

## Commands

```bash
pnpm typecheck
pnpm build
pnpm package
```
