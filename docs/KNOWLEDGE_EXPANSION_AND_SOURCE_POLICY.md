# Knowledge expansion and source policy

This upgrade expands GoMentor's local teaching knowledge while keeping the project safe for public distribution.

## What was added

- `elite-pattern-cards-v9.json`: source-backed engineering and source-policy cards for KataGo evidence fields, SGF setup correctness, joseki frequency mining boundaries, and citation discipline.
- `elite-pattern-cards-v10.json`: deeper original teaching cards for aji, kikashi/probes, sabaki, honte, miai, thickness conversion, semeai, seki, ko, yose, connection shapes, ladders/nets, attack profit, and practical risk control.
- `source-registry-v9.json`: extra source registry entries for references used in the expansion.
- `scripts/check_knowledge_sources.mjs`: release gate for source references, non-importable sources, and required teaching fields.
- `scripts/eval_knowledge_coverage.mjs`: coverage gate for required knowledge topics.

## Source policy

GoMentor uses internet sources in three different ways:

1. Primary API / format references, such as KataGo Analysis Engine docs and SGF FF[4] property references.
2. Taxonomy references, such as Go terminology indexes, used only to check coverage.
3. Future data candidates, such as professional-game frequency mining sources, which require a separate release review before import.

The local knowledge cards remain original GoMentor teaching content. They must not copy book diagrams, problem collections, joseki comments, wiki definitions, or website prose.

## Required release gate

Run:

```bash
pnpm check:knowledge-sources
pnpm eval:knowledge-coverage
pnpm check:teacher-quality
```

A card may ship only when:

- every `sourceRef` exists in `source-registry.json` or `source-registry-v9.json`;
- no card references a `do-not-import` source;
- every card has recognition, wrong-thinking, correct-thinking, drill, sourceRefs, and sourceQuality fields;
- required concepts remain covered by v9/v10 packs.

## Why this matters

A top-tier Go teaching project needs both strong knowledge coverage and legal/source discipline. The teacher should sound like a human coach, but every claim must remain grounded in local evidence, KataGo analysis, and original project knowledge.
