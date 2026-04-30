# Changelog

All notable changes to GoMentor will be documented here.

This project follows semantic versioning once public releases begin.

## 0.3.4 - Settings Paste and Desktop Polish

### Added

- Native Electron edit menu and editable-field context menu so Base URL, model name, and API Key fields support normal copy/paste behavior.
- Settings can reveal the saved LLM API Key on demand for user verification without exposing it in the public dashboard payload.
- Contract coverage for LLM settings paste-friendly inputs and Electron native paste controls.

### Improved

- Reworked the desktop settings header into the light GoMentor visual system with compact KataGo/LLM readiness badges.
- LLM settings inputs now disable browser-style autocorrect/autocapitalization and use monospace text for easier API configuration checks.
- API Key helper copy was removed from the settings row so the expected workflow is clear: paste from the provider dashboard, optionally reveal to verify, then save.

## 0.3.3 - Teacher Pacing Control

### Added

- Current-move teacher analysis now includes internal pacing advice so common joseki can be explained briefly while middle-game fights receive deeper human-style commentary.
- Added teaching density modes: `minimal`, `branch`, `detailed`, and `caution`.
- Added variation teaching hints that tell the LLM when to explain purpose, expected reply, PV continuation, and practical result.

### Improved

- Current-move prompt now explicitly asks the teacher to control explanation length: say less for routine joseki, show key branches for joseki variations, and explain purpose/reply/follow-up for middle-game fighting.
- KataGo and knowledge tool results now carry `teachingPacing` to the agent without changing the visible UI into a report.
- Real LLM smoke now validates the agent runtime output instead of expecting the removed legacy `llm.multimodalTeacher` log.

## 0.3.2 - Agent Runtime and Analysis Polish

### Added

- Teacher runtime now follows a Claude Code-style tool loop: tool calls are executed, returned to the model, and the model continues until the final answer.
- Current-move teacher prompt now lightly requires board-image reading, KataGo evidence, and local knowledge matching without forcing a fixed report template.
- Teacher replies can be selected and copied, with a lightweight copy button on each assistant response.
- Tool calls in the teacher thread now show clean step titles with running-state animation instead of verbose engineering details.
- KataGo analysis runs can now be cancelled when the user changes game, move, or analysis mode.

### Improved

- Fast winrate graph generation uses a KaTrain-style low-visit sweep and refines suspected mistakes without blocking the first curve.
- KataGo candidate loss and issue ranking use first-choice versus played-move winrate loss from the player-to-move perspective.
- Board markers now distinguish the current move from the previous move with a subtler professional marker.
- Candidate overlays and variation preview behavior are more stable during hover.
- LLM provider handling now accepts tool-call turns and streamed tool-call deltas instead of treating empty text plus tools as an error.

### Fixed

- Teacher analysis no longer falls back to deterministic pseudo-explanations when the LLM fails.
- Teacher tool trace no longer exposes long result summaries, shell output, or implementation detail in the main chat.
- Right-side assistant output keeps auto-scroll behavior and supports copying during normal streamed answers.

## 0.3.1 - Teacher Smoke Fixes

### Fixed

- Teacher structured-result parsing now handles JSON followed by evidence verification notes.
- Pure JSON teacher responses are converted into readable markdown instead of being shown as raw JSON.
- Natural markdown teacher responses now populate a structured headline from the first meaningful line.
- Teacher runtime now supplies fallback training problem recommendations from weak or joseki-linked matches when strong tactical matches do not provide drills.
- Teacher LLM smoke now validates the evidence verifier happy path and no longer depends on removed legacy prompt wording.
- UI Gallery dark panel headers now have sufficient contrast for visual QA screenshots.

## 0.3.0 - Teaching Knowledge v5

### Added

- Built-in joseki database bundle with source manifest and licensing notes.
- Motif and joseki recognition services for stronger knowledge matching.
- Teacher evidence validation so LLM explanations stay tied to KataGo candidates, board state, and matched knowledge.
- Multilingual UI language option for Chinese, English, Japanese, Korean, Thai, and Vietnamese.
- Additional elite pattern and joseki knowledge cards for professional teaching explanations.
- Joseki bundle inspection script for release checks.

### Improved

- Current-move teacher analysis now includes recognized motifs, teaching evidence, and verification metadata in saved reports.
- Teacher prompts are shorter, more human, and grounded by evidence instead of rigid templates.
- Local knowledge source registry now records bundled joseki data sources and source-risk decisions.

### Known Issues

- Bundled KataGo binaries and models are still distributed through release assets/build preparation, not normal Git files.
- macOS packages may still require manual trust if unsigned/not notarized.
- Windows packages may still trigger SmartScreen when unsigned.

## 0.2.0-beta.1 - P0 Beta Candidate

### Added

- Three-column desktop workbench with library, board, winrate graph, and teacher chat.
- Fox public game sync by nickname or UID.
- SGF upload and mainline parsing.
- KTrain/Lizzie-inspired board with coordinates, stone assets, last-move marker, and candidate marks.
- Automatic low-visit full-game winrate graph on game load.
- KataGo runtime resolver with bundled-runtime and local fallback paths.
- Official KataGo model presets in settings.
- OpenAI-compatible multimodal LLM settings.
- Current-move multimodal teacher analysis.
- Full-game and recent-10-game teacher quick actions.
- Local knowledge search and long-term student profile storage.
- Markdown and JSON report output.
- Cross-platform CI for macOS, Windows, and Linux.
- GitHub Release workflow for macOS, Windows, and Linux artifacts.
- P0 release readiness checks for automation, assets, installers, signing, Windows smoke, and visual QA.
- Local release evidence collection under `release-evidence/`.

### Fixed

- GPT/reasoning model response parsing when no plain `content` field is returned.
- Fox-style SGF komi values such as `KM[375]`.
- SGF parser incorrectly reading comments and variations as mainline moves.
- Board and winrate graph layout overlap in the center workspace.

### Known Issues

- Windows ARM64 is not supported in the P0 beta because the bundled KataGo manifest only supports Windows x64.
- macOS public distribution requires Developer ID signing and notarization before tagging.
- Windows public distribution should use an EV/OV certificate or Microsoft Trusted Signing; unsigned installers are internal beta only.
- Windows 11 x64 real-machine smoke and visual QA evidence are required before creating `v0.2.0-beta.1`.
