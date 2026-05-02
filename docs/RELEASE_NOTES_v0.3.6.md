# GoMentor v0.3.6

GoMentor v0.3.6 is a top-quality teaching upgrade: stronger grounded shape recognition, broader local knowledge coverage, stricter source-policy gates, and an optimized move-range review workflow inspired by PR #5.

QQ群：1030632742，欢迎一起交流、提建议、完善 GoMentor。

## Downloads

- macOS Apple Silicon: `GoMentor-0.3.6-mac-arm64.dmg`
- macOS Intel: `GoMentor-0.3.6-mac-x64.dmg`
- Windows x64 portable: `GoMentor-0.3.6-win-x64-portable.zip`
- Windows x64 installer: `GoMentor-0.3.6-win-x64.exe`
- Checksums: `SHA256SUMS.txt`

## What's New

- Added a grounded shape recognition engine with KataGo shape features and local pattern matching.
- Added knowledge cards v6-v11 plus source registries and source-policy gates for evidence-backed teaching.
- Integrated the optimized move-range review from PR #5: Alt+drag on the winrate timeline, Esc/plain click clear behavior, shared multilingual parser, 80-move range limit, range summary, and key move screenshots.
- Added quality checks and eval gates for teaching accuracy, claim verification, structured quality, knowledge sources, coverage, shape recognition, and move-range behavior.
- Move-range teacher analysis now explains the interval trend first, then focuses on the top 3-5 key loss moves with KataGo evidence, analysisQuality, shape recognition, or tactical signals.

## Thanks

- Thanks to layiku for PR #3's early global arrow-key idea; the direction was fully absorbed by PR #4.
- Thanks to layiku for PR #4; global arrow-key navigation is merged and significantly improves review flow.
- Thanks to layiku for PR #5; move-range review, Alt+drag selection, and multilingual parser are valuable and now integrated with performance limits, quality gates, and shape recognition evidence.
- Thanks to wimi321 for PR #1 and PR #2, which laid the foundation for P0 beta, v5 teaching knowledge, joseki data, and the evidence chain.

## Verification

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm eval:teacher`
- `pnpm eval:claims`
- `pnpm eval:quality-gate`
- `pnpm check:knowledge-sources`
- `pnpm eval:knowledge-coverage`
- `pnpm eval:shape-recognition`
- `pnpm eval:move-range`
- `pnpm check:teacher-quality`

## Known Notes

- macOS packages may still require the usual trust/open steps if notarization is not available in the build environment.
- Windows packages may trigger SmartScreen until the project has stronger signing reputation.
- Windows ARM64 is not included in this release.
