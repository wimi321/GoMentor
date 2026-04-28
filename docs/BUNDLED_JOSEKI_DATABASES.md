# Bundled joseki databases and recognition coverage

This v5 patch adds real bundled SGF-based joseki coverage, instead of relying only on hand-written joseki-family cards.

## Bundled sources

### Pachi joseki SGF set

- Path: `data/knowledge/joseki-sgf/pachi/`
- Source: `https://github.com/pasky/pachi/tree/master/joseki`
- License: GPL-2.0-only, copied as `COPYING`.
- Coverage: san-san, komoku, hoshi, and takamoku SGF trees.

### Josekle dictionary SGF

- Path: `data/knowledge/joseki-sgf/josekle/`
- Source: `https://github.com/okonomichiyaki/josekle/tree/master/sgf`
- License: MIT, copied as `LICENSE`.
- Coverage: a larger joseki explorer dictionary SGF.

## How GoMentor uses these files

`src/main/services/knowledge/josekiSgfDatabase.ts` parses every bundled SGF variation tree, extracts move prefixes, normalizes them into corner-relative coordinates, and converts them into `JosekiPatternCard` records. `josekiRecognizer.ts` then merges these SGF-derived cards with the curated cards from `joseki-pattern-cards.json`.

The LLM teacher receives these matches as recognized motifs. It should present them as joseki-tree hypotheses, not as proof that a move is correct. KataGo remains the final whole-board fact source.

## Why Kogo is not bundled

Kogo's Joseki Dictionary is public to download, but the SGF itself includes an explicit copyright/distribution warning and asks distributors to request permission before distribution. GoMentor should not bundle that file until permission is obtained. The source is still tracked in `data/knowledge/joseki-source-manifest.json` so the maintainer can add it later if permission is granted.

## QA checklist

1. Start with common 4-4, 3-4, 3-3, and 5-4 openings and ask “这是什么定式？”
2. Confirm the answer says “定式族 / joseki family” when confidence is medium/strong.
3. Confirm the teacher does not claim a single forced move when several branches are present.
4. Confirm the final recommendation still uses KataGo candidates and score/winrate evidence.
5. In release packaging, preserve `data/knowledge/joseki-sgf/*/README.md` and license files.
