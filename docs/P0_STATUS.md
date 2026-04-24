# P0 Status After Sprint 2 Package

## Done by Sprint 1 feedback

- Diagnostics foundation
- LLM provider foundation
- Student profile foundation
- Knowledge cards foundation
- Teacher runtime foundation
- Initial renderer wiring
- Build/typecheck/test/check passing

## Added by Sprint 2 package

- KataGo manifest and asset scripts
- Asset inspection service
- Diagnostics gate component
- SGF/Fox student binding helpers
- Structured teacher parser
- Tool log builder
- Student binding dialog
- Student rail card
- Runtime asset panel
- Teacher result card
- Release workflow snippets

## Still P0 after Sprint 2

- Codex must wire snippets into actual App and main IPC.
- Real KataGo binary/model must be provided by release pipeline or Git LFS.
- End-to-end SGF import flow must trigger binding UI.
- Fox sync response must return bound student.
- Teacher runtime must pass structuredResult to renderer.
- Full Windows/macOS packaging smoke test must run locally or CI.

## Next sprint

Sprint 3 should focus on board and chat UI polish:

- Board texture and stone rendering
- Candidate move visuals
- Key mistake markers
- Winrate graph interaction
- AI-editor style teacher panel
