# Knowledge sources, curated cards, and joseki recognition

This patch separates three kinds of GoMentor knowledge so the teacher can be accurate without pretending that every teaching card comes from a single authoritative database.

## What is bundled

- `data/knowledge/elite-pattern-cards.json`: the v3 built-in teaching motifs.
- `data/knowledge/elite-pattern-cards-v4.json`: 40 additional curated teaching motifs for sente/gote, aji, probes, kikashi, attack profit, sabaki, endgame, fuseki, and common tesuji.
- `data/knowledge/joseki-pattern-cards.json`: curated joseki-family cards. They identify common corner-pattern families and expose common next-move branches to the teacher.
- `data/knowledge/joseki-sgf/pachi/`: bundled Pachi joseki SGF files, kept under their GPL-2.0 notice.
- `data/knowledge/joseki-sgf/josekle/`: bundled Josekle dictionary SGF, kept under its MIT notice.
- `data/knowledge/source-registry.json`: source metadata and usage policy.

## Are the cards copied from a database?

No. The bundled cards are original structured summaries written for GoMentor. They reference common Go concepts and public/open references, but they do not copy long text, comments, SGF trees, or full joseki dictionaries.

This matters because several joseki resources are useful but have different reuse constraints:

- KataGo docs are primary API references for analysis fields.
- Wikibooks Go is an open educational reference under Wikimedia/Wikibooks terms.
- Kogo's Joseki Dictionary is publicly downloadable, but the public page does not clearly grant a broad redistribution/derivative-data license for bundling raw SGF/commentary.
- Pachi joseki SGFs are now bundled as third-party GPL-2.0 data with a local COPYING notice; packaged builds must preserve that notice.
- Josekle dictionary SGF is now bundled as third-party MIT data with a local LICENSE notice.
- GoGoD is commercial/proprietary and must not be bundled without a license.

The source registry makes these distinctions explicit. The teacher prompt treats `sourceRefs` as traceability labels, not as source text to quote.

## Joseki recognition scope

`src/main/services/knowledge/josekiRecognizer.ts` implements lightweight, orientation-invariant corner-family recognition:

1. Normalize recent moves to relative corner coordinates such as `4-4`, `3-3`, `4-6`.
2. Group recent opening moves by corner.
3. Match against `joseki-pattern-cards.json` required relative stones and signal terms.
4. Convert common relative next moves back to GTP coordinates for the detected corner.
5. Return confidence, source refs, variation count, common branches, and teaching text.

This supports questions like:

- “这是什么定式？”
- “这个定式有几种主要变化？”
- “这一步下一手通常下哪里？”
- “我这里是不是照定式走错了？”

v5 update: the recognizer now also parses bundled SGF variation trees and creates thousands of SGF-derived prefix cards. It still treats them as joseki-tree hypotheses, and validates final recommendations against KataGo.

## Prompt rules added in v4

The teacher instruction now enforces:

1. KataGo/TeachingEvidence is the fact source.
2. Recognized motifs, including joseki, are labels/hypotheses unless confidence is medium/strong.
3. The teacher can name a joseki only when a medium/strong `joseki:*` motif exists.
4. Expected joseki moves are common branches, not absolute recommendations.
5. Source references are traceability labels, not quotations.
6. The teacher should output a short human coaching card by default.

## QA checklist

Run at least these checks after applying the patch:

1. Import a normal 4-4 + 3-3 invasion opening and ask “这是什么定式？” The teacher should identify a modern 3-3 invasion family, explain block direction, and avoid claiming a single forced line.
2. Import a 4-4 low approach and ask “下一手应该下哪里？” The teacher should show common branches but still defer final recommendation to KataGo candidates.
3. Ask about a non-joseki middle-game fight. The teacher should not invent a joseki name.
4. Force medium/low confidence by using low visits. The teacher should use softer wording.
5. Verify streaming still works: the main LLM answer should stream; the verification/source/motif note is appended as a final streamed delta.
