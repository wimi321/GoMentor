# Contributing to KataSensei

Thanks for helping build KataSensei. This project sits at the intersection of Go education, local desktop engineering, KataGo analysis, and LLM agent design, so changes should be careful and grounded.

## Development Setup

```bash
pnpm install
python3 -m pip install -r scripts/requirements.txt
pnpm dev
```

Before opening a pull request:

```bash
pnpm typecheck
pnpm build
```

## Project Principles

- KataGo structured analysis is the source of truth.
- LLM output is teaching language, not factual authority.
- The right-side teacher should stay agentic. Prefer adding reusable tools and context over hard-coding narrow flows.
- Keep student data local by default.
- Do not commit API keys, private SGFs, local reports, KataGo model files, or platform-specific KataGo binaries.
- Match the existing UI direction: dense, professional, workbench-like, not a marketing landing page.

## Good First Areas

- Improve SGF compatibility with real-world exported files.
- Add focused KataGo analysis fields to the teacher prompt.
- Improve board and graph rendering without adding visual clutter.
- Add knowledge cards under `data/knowledge`.
- Improve cross-platform packaging and runtime discovery.

## Pull Request Checklist

- [ ] The change is scoped to one coherent problem.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] UI changes were checked in the desktop app.
- [ ] Privacy implications are documented if LLM or web-search data changes.
- [ ] New teacher-agent tools include a clear purpose and private-input notes.

## Teacher Agent Changes

Read [docs/TEACHER_AGENT.md](./docs/TEACHER_AGENT.md) before changing the agent runtime.

When adding a tool:

1. Add it to the tool catalog with a purpose and privacy notes.
2. Make tool calls visible in the chat log.
3. Keep raw SGF content, screenshots, local paths, and student-identifying data out of web search.
4. Save durable outputs through the report/profile layer where appropriate.

## Coding Style

- TypeScript for Electron and React code.
- Keep IPC boundaries explicit and typed in `src/main/lib/types.ts`.
- Prefer structured SGF/KataGo parsing over string heuristics.
- Keep local file access inside KataSensei-managed directories unless the user explicitly chooses files.

## Release Process

Maintainers cut releases with semver tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds macOS, Windows, and Linux artifacts and attaches them to the GitHub Release. Signing and notarization are expected to be configured before broad public distribution.
