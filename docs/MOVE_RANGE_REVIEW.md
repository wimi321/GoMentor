# Move-range review

GoMentor supports focused move-range review so students can ask for a compact explanation of a phase such as a middlegame fight, collapse window, joseki continuation, or endgame sequence.

The feature intentionally does not perform high-visit analysis for every move in a long interval. It follows a two-stage design:

1. Reuse cached evaluations or a low-visit quick sweep to identify candidate key moves.
2. Send only the range summary, key move screenshots, and optional key-move KataGo refinement to the teacher.

This keeps the workflow responsive and prevents the teacher from writing a move-by-move report that hides the real learning point.

## Input forms

The shared parser in `src/shared/moveRange.ts` supports:

- Chinese: `第100手到第200手`, `100手至200手`.
- Japanese: `100手から200手`.
- Korean: `100수부터200수`.
- English: `moves 100-200`, `from move 100 to 200`, `moves 100 through 200`.

Bare numeric ranges such as `100-200` are accepted only when the prompt is short and command-like. Dates, score ranges, and winrate descriptions are rejected.

## Safety limits

The default maximum interval is 80 moves. Longer ranges should be split, because a focused review should explain a coherent phase rather than summarize an entire game in disguise.

## Teacher rules

For `move-range` tasks, the teacher should:

1. summarize the range trend;
2. explain the top 3-5 key moves;
3. cite KataGo evidence, `analysisQuality`, shape recognition, or tactical signals;
4. lower certainty when evidence is low;
5. avoid invented coordinates, PVs, joseki names, or life-and-death claims.

## PR acknowledgement

This feature was inspired by PR #5 from `layiku`, which proposed Alt-drag range selection, multilingual move-range parsing, and a move-range teacher intent. The implementation in this branch keeps that product idea while adding bounded analysis, shared parser placement, quality-gate compatibility, and key-move-only refinement.
