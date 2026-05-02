# Teacher structured output and quality gate

This upgrade makes GoMentor's teacher pipeline more auditable. The teacher can still write natural coaching text, but every risky factual statement should be expressible as a grounded claim that points back to local evidence.

## Why this matters

Coordinates, winrates, score leads, PV lines, joseki names, life-and-death conclusions, sente/gote claims, ownership explanations, and student-profile statements are high-risk. They must not depend on the language model's memory or intuition.

The quality gate therefore checks three layers:

1. Markdown-level verification from `teachingEvidence.ts`.
2. Claim-level verification from `claimVerifier.ts`.
3. Optional strict structured output validation from `structuredTeachingResult.ts`.

## Structured output contract

`GROUNDED_TEACHING_JSON_SCHEMA` defines a `GroundedTeachingOutput` object:

- `headline`, `summary`, `confidence`;
- `claims[]` with `type`, `text`, `evidenceRefs`, and `confidence`;
- `sections[]` that bind visible markdown to claim IDs;
- `drills`, `followupQuestions`, and `finalMarkdown`.

Models that support strict JSON schema can emit this directly. OpenAI-compatible providers that do not support strict schema can still emit normal markdown; the quality gate will fall back to markdown claim extraction.

## Quality gate policy

`runTeacherQualityGate` should be called after the LLM produces a teacher answer and before saving the final report. It should fail on:

- unsupported recommended coordinates;
- impossible or suspicious percentages;
- unsupported joseki naming;
- over-absolute wording under medium/low confidence;
- structured claim IDs without evidence references;
- sections that reference unknown claim IDs.

Warnings are allowed during early beta, but release builds should progressively turn high-risk warnings into blocking violations.

## Golden fixtures

`tests/fixtures/teaching-golden` now includes a `quality` category. Every hallucination or coach rejection should become a fixture with:

- SGF;
- move number;
- allowed and forbidden moves;
- must-mention and must-not-mention phrases;
- numeric tolerance;
- expected claims and evidence refs.

`pnpm eval:quality-gate` checks fixture shape, knowledge-pack source references, and wiring for structured output and quality gate modules.

## Next integration step

The runtime should append the quality gate note to teacher reports in beta builds and use repair prompts for failed claims in production builds:

1. Generate grounded teacher output.
2. Run local quality gate.
3. If violations exist, ask the model to repair only the failed sentences without adding new facts.
4. Re-run the gate and save the final report.

This keeps GoMentor's teacher human-readable while making each factual statement traceable and testable.
