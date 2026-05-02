# GoMentor accuracy upgrade

This patch raises the floor for GoMentor's teaching accuracy by adding four foundations:

1. SGF setup and board-state reconstruction.
2. Richer KataGo evidence fields and analysis quality metadata.
3. Claim-level verification utilities for coordinates, numbers, joseki claims, and absolute wording.
4. A larger v6 local knowledge pack for tactical and strategic motifs.

## Why this matters

LLMs are good at explanation, but Go teaching is unforgiving: one invented coordinate, one wrong color perspective, or one overconfident joseki name can mislead a student. GoMentor should therefore treat KataGo and deterministic board state as facts, and let the LLM explain only what the evidence supports.

## New modules

```text
src/main/services/go/boardState.ts
src/main/services/teacher/claimVerifier.ts
src/main/services/teacher/humanWinrateCalibrator.ts
src/main/services/knowledge/tacticalDetectors.ts
data/knowledge/elite-pattern-cards-v6.json
scripts/eval_teaching_accuracy.mjs
tests/accuracy-upgrade-contract.test.mjs
```

## SGF setup support

`boardState.ts` parses `AB`, `AW`, and `AE` setup properties and reconstructs a board with captures, groups, liberties, and warnings. `readGameRecord` now exposes `initialStones`, and KataGo queries can pass these stones through `initialStones`.

This is essential for:

- handicap games;
- tsumego / life-and-death SGFs;
- joseki teaching diagrams;
- SGFs with edited setup nodes.

## KataGo evidence v2

The type layer now accepts optional richer fields:

- `scoreStdev`;
- `utility`;
- `lcb`;
- `edgeVisits`;
- `pvVisits`;
- `ownership` / `ownershipStdev`;
- `humanPrior` / `humanScoreMean`;
- `analysisQuality`.

The teacher should use `analysisQuality.confidence` to soften claims when visits are low, candidate spread is small, or the middle game needs deeper search.

## Claim verification

`claimVerifier.ts` provides:

- `verifyGroundedClaims` for structured claim arrays;
- `verifyTeacherClaimsFromMarkdown` for markdown-derived fallback checks;
- `buildClaimVerificationNote` for report notes.

It checks unsupported coordinates, impossible percentages, suspicious numeric claims, joseki names without medium/strong joseki evidence, and overly absolute language under low-confidence evidence.

## Knowledge expansion

The v6 card pack adds higher-value tactical and strategic motifs:

- liberty shortage;
- cut/connect priority;
- atari direction;
- ladder/net choice;
- eye-shape false-eye risk;
- throw-in/snapback;
- ko threat value;
- reverse-sente endgame;
- kikashi overuse;
- probe response;
- invasion vs reduction;
- overconcentration.

All cards are original GoMentor teaching summaries and reference `gomentor-curated-original` rather than copying third-party text.

## Next integration steps

This patch intentionally keeps the high-risk runtime changes small. The next patches should:

1. Feed `buildBoardState` snapshots directly into `knowledgeBundleForState` instead of the local board reconstruction inside `teacherAgent.ts`.
2. Add an automatic repair turn when claim verification fails.
3. Convert teacher output to structured `GroundedTeachingResult` before markdown rendering.
4. Populate `tests/fixtures/teaching-golden` with real SGF samples and human-coach expectations.
5. Enable ownership summaries only for teacher tasks, not for quick winrate graph sweeps.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm eval:teacher
```

`pnpm eval:teacher` validates the golden-fixture schema today and becomes a true accuracy gate once fixtures and local KataGo assets are available.

