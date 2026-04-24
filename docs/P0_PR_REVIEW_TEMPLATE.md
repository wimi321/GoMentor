# P0 Productization PR Review Template

## Summary

This PR productizes KataSensei P0: diagnostics, embedded KataGo asset strategy, Claude-compatible provider, student profiles, local knowledge cards, teacher runtime, upgraded board UI, and Beta readiness checks.

## Must-pass checks

- [ ] `pnpm install`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm check`
- [ ] `node scripts/check_katago_assets.mjs --mode=dev`
- [ ] `node scripts/p0_beta_acceptance.mjs`

## Manual QA

- [ ] First-launch diagnostics gate works.
- [ ] SGF import can bind a student.
- [ ] Fox nickname sync creates/reuses a student profile.
- [ ] Current move analysis works.
- [ ] Full game analysis works.
- [ ] Recent 10 games analysis writes profile data.
- [ ] Teacher card key-move actions jump to the board.
- [ ] Candidate tooltip works.
- [ ] Tool log is folded by default.

## Release risk

- [ ] KataGo binary/model delivery strategy verified.
- [ ] Windows package smoke checked.
- [ ] macOS package smoke checked.
- [ ] No secrets committed.
- [ ] No accidental zip/node_modules/out/release committed.
