# GoMentor v0.3.1 Release Notes

GoMentor v0.3.1 is a quality patch for the v0.3 teaching release. It focuses on the user-facing teacher analysis path and visual QA stability.

## Highlights

- Fixed current-move teacher smoke when the LLM returns structured JSON plus GoMentor verification notes.
- Converts pure JSON teacher responses into readable markdown so users do not see raw machine output.
- Extracts a useful headline from natural markdown teacher responses.
- Ensures the teacher runtime can still recommend related training problems when the strongest matches are joseki or weaker pattern matches.
- Tightened the teacher LLM smoke test to require `teacher.verifyEvidence` success.
- Improved UI Gallery panel header contrast for visual QA.

## Verification

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm check`
- `pnpm smoke:teacher-llm`
- `pnpm smoke:teacher-llm:real`
- `node scripts/check_katago_assets.mjs --mode=release`
- `node scripts/p0_beta_acceptance.mjs`
- `node scripts/p0_release_candidate_check.mjs --mode=release`
- `node scripts/verify_release_artifacts.mjs --mode=release`
- `node scripts/package_artifact_smoke.mjs --mode=release`
- `node scripts/inspect-joseki-bundles.mjs`

## Downloads

- `GoMentor-0.3.1-mac-arm64.dmg`
- `GoMentor-0.3.1-mac-x64.dmg`
- `GoMentor-0.3.1-win-x64-portable.zip`
- `GoMentor-0.3.1-win-x64.exe`

## Known Notes

- macOS packages may still require Gatekeeper trust steps if notarization is not completed.
- Windows packages should still be smoke-tested on a real Windows 11 x64 machine for SmartScreen and install behavior.
- Windows ARM64 is not part of this release.
