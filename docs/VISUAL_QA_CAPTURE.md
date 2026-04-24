# KataSensei Visual QA Capture

Sprint 7 adds an internal UI Gallery for repeatable visual review. It uses mock data only and does not require real KataGo, LLM, Fox sync, or API keys.

## Open the Gallery

Start the app in development mode:

```bash
pnpm dev
```

Open either route:

```text
http://localhost:5173/#/ui-gallery
http://localhost:5173/?ui-gallery=1
```

## Capture Screenshots

If Playwright is available locally, run:

```bash
KATASENSEI_UI_GALLERY_URL="http://localhost:5173/#/ui-gallery" \
node scripts/capture_ui_gallery.mjs
```

The script writes screenshots to:

```text
release-evidence/ui-gallery/
```

Do not commit local screenshot evidence by default. Attach it to the PR or release evidence bundle when doing manual QA.

## Required Evidence

- UI Gallery overview
- GoBoardV2 with stones, coordinates, key move markers, and candidate points
- CandidateTooltip
- WinrateTimelineV2 hover/drag state
- KeyMoveNavigator strip
- BoardInsightPanel
- TeacherRunCardPro structured result
- TeacherComposerPro focus and busy states
- StudentRailCard
- SGF StudentBindingDialog
- DiagnosticsGate / DiagnosticsPanel
- Settings readiness / BetaAcceptancePanel
- Empty, error, and loading states

## Acceptance Notes

- The app may be runnable as unsigned beta before public release signing is complete.
- `publicBetaReady` must remain false until signing, Windows smoke, and visual QA evidence are complete.
- Visual QA evidence should be attached to a PR comment or local release evidence directory, not committed as large binary churn.
