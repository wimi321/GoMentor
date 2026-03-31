# Architecture

KataSensei is a local-first desktop review studio for Go students.

## Layers

- `src/main`: Electron main process, local storage, file dialogs, Fox sync, Python job execution.
- `src/preload`: secure IPC bridge exposed to the renderer.
- `src/renderer`: React UI focused on one-click student workflows.
- `scripts/review_game.py`: SGF parsing, KataGo analysis, mistake detection, optional LLM coaching text.
- `scripts/install_katago_latest.py`: lightweight helper for preparing a usable local KataGo environment.

## Review pipeline

1. User uploads SGF or syncs Fox public games.
2. SGF is copied into `~/.katasensei/library`.
3. Renderer calls `review:start`.
4. Main process spawns `scripts/review_game.py`.
5. Python sends per-position queries to KataGo analysis mode.
6. Large student mistakes are ranked by estimated winrate loss.
7. Markdown + JSON artifacts are written into `~/.katasensei/reviews/<game-id>/`.
8. Renderer previews the Markdown immediately.

## Design principles

- Local-first: user SGF files and review artifacts stay on the user's machine.
- Beginner-proof: one primary action per step, visible settings, no terminal required after setup.
- Truth first: KataGo numbers are the source of truth; LLM text is explanatory only.
- Portable: Electron desktop app with scripts for macOS, Windows, and Linux.
