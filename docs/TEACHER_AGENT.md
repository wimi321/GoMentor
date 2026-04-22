# KataSensei Teacher Agent

KataSensei treats the right-side coach as an agent, not a static chat panel. The agent can plan a task, call local tools, inspect results, and write a student profile that improves later reviews.

The agent must not be product-limited to a small set of button workflows. Current-move analysis, recent-game review, and training-plan generation are only fast paths. Any natural-language request can enter the open-ended agent path, where the teacher receives the tool catalog, current game context, student profile, knowledge cards, and optional web-search snippets, then decides the right output shape.

## Priority Order

1. KataGo structured analysis is the source of truth.
2. Board screenshots help the multimodal model understand shape and direction.
3. Local knowledge cards provide stable teaching language and concepts.
4. Web search is supplemental and must use generic queries only.

If these sources disagree, KataGo wins.

## Capability Policy

- Do not artificially restrict the teacher to "current move", "recent games", or "training plan".
- Treat every tool as part of one extensible capability registry.
- Let the teacher plan multi-step work from the user's actual goal, then choose tools by need.
- Environment setup is also a teacher capability: the teacher may detect local KataGo, write KataSensei app config, and verify that analysis works.
- Show every tool call in the chat log so the user can see what happened.
- Add new tools by registering their capability and privacy notes; do not fork the agent into more hard-coded flows.
- Privacy and local-system safety are guardrails, not product limitations: do not send student names, SGF contents, screenshots, API keys, or local paths to web search. Destructive actions, installation, and OS-level security changes should be surfaced as explicit tool steps.

## Tool Catalog

- `library.findGames`: filter local games by student name, source label, or title.
- `sgf.readGameRecord`: parse SGF mainline into move records.
- `katago.analyzePosition`: compare the current move with KataGo recommendations.
- `katago.analyzeGameBatch`: run local batch analysis without per-game LLM calls.
- `system.detectEnvironment`: inspect local KataGo, model/config paths, local LLM proxy, and available models.
- `settings.writeAppConfig`: update KataSensei settings so the teacher can use detected local tools immediately.
- `katago.verifyAnalysis`: run a low-visit KataGo analysis to verify binary/config/model compatibility.
- `board.captureTeachingImage`: create a board-only PNG with current move and recommendation marks.
- `knowledge.searchLocal`: retrieve structured cards from `data/knowledge`.
- `web.searchGoKnowledge`: optional generic web search; never include student names, SGF content, or board screenshots.
- `studentProfile.read/write`: persist long-term learning signals.
- `report.saveAnalysis`: write reports under `~/.katasensei/teacher-reports`.

## Open-Ended Agent Path

When a request does not match a fast path, `TeacherAgentRuntime` should still execute, not refuse. The fallback path should:

1. Read the student profile.
2. Read the current SGF context if a game is selected.
3. Search local knowledge for relevant teaching concepts.
4. Optionally run generic web search when the user asks for external material.
5. If the task mentions setup/config/environment/KataGo availability, detect local environment, write app config, and verify KataGo with a low-visit analysis when a game is available.
6. Give the LLM the full tool catalog and collected context.
7. Save the result as a report.

This is intentionally close to Claude Code's model: the teacher is a task-running agent with domain tools, not a template renderer.

## Privacy Rules

- LLM API keys are stored through Electron `safeStorage` when available.
- Renderer receives only whether an API key exists, never the saved key itself.
- Opening files through IPC is restricted to KataSensei-managed directories.
- Current-move analysis sends the board PNG, KataGo JSON, and selected knowledge cards to the configured multimodal LLM.
- Batch analysis disables per-game LLM calls and performs one final teacher summary.
- Open-ended tasks may call the LLM with the tool catalog, student profile, SGF metadata/recent moves, local knowledge cards, and generic web-search titles.

## Knowledge Packet

Knowledge sent to the LLM is structured:

```json
{
  "id": "strategy-big-urgent",
  "title": "大场与急场",
  "category": "strategy",
  "phase": "opening",
  "tags": ["布局", "急所"],
  "summary": "先走急所，后走大场。",
  "selectedBody": "Only the relevant excerpt.",
  "score": 12
}
```

The full Markdown library is packaged with the app, but only selected excerpts should enter the prompt.

## Acceptance Baseline

- `pnpm typecheck` passes.
- `pnpm build` passes.
- Starting `pnpm dev` opens the three-column workbench.
- Current-move analysis calls KataGo before LLM.
- Recent-game analysis writes a student profile and report.
