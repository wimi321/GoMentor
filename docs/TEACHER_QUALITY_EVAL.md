# Teacher quality evaluation and production hardening

This document defines the second accuracy-hardening layer for GoMentor.

## Why this patch exists

The first accuracy upgrade made the teacher more grounded by adding SGF setup support, richer KataGo evidence, tactical signals, human winrate calibration, and a first claim verifier. This patch adds the next production layer:

1. joseki matching is now sequence-aware instead of only set/shape-aware;
2. student profiles expose confidence so the teacher does not overfit one game;
3. golden fixtures include claim-level expectations;
4. CI can validate teaching fixture consistency without requiring local KataGo assets;
5. the knowledge base includes evidence-calibration motifs for ownership, PV integrity, and profile quality.

## Joseki sequence policy

A joseki claim must not be made from a static corner-stone set alone. The recognizer now checks:

- relative corner sequence prefix;
- color consistency;
- tenuki count;
- whether KataGo candidates or PV support a continuation;
- safe wording when the sequence is only a hypothesis.

Allowed wording levels:

- `明确属于该定式族`: strong sequence match and KataGo supports continuation;
- `像该定式分支`: sequence match exists but final recommendation still needs whole-board evidence;
- `SGF 树有此前缀，但本局未必该继续`: weak or order-incomplete match.

## Student profile confidence

Long-term weakness labels need repeated evidence. The teacher should distinguish:

- current-game mistake;
- repeated pattern;
- high-confidence training theme.

The profile prompt now includes a compact confidence summary. A single move should not create a permanent weakness label.

## Golden fixtures

Golden fixtures live under:

```text
tests/fixtures/teaching-golden/
```

Each fixture should include:

- SGF or game ID;
- move number;
- student level;
- allowed and forbidden coordinates;
- motifs that should be recognized;
- phrases that must and must not appear;
- numeric tolerances;
- expected claim types and evidence refs.

Run:

```bash
pnpm eval:teacher
pnpm eval:claims
pnpm check:teacher-quality
```

These checks are intentionally asset-light. They validate fixture and source consistency. Once CI machines have KataGo assets, the same fixture shape can be used to run full model-in-the-loop scoring.

## Next production gate

The next gate should run the teacher on every golden fixture and score:

- unsupported coordinate rate;
- numeric mismatch rate;
- joseki false-positive rate;
- low-confidence overclaim rate;
- tactical motif hit rate;
- human coach acceptance.
