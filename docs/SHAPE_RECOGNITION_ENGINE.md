# Shape recognition engine

GoMentor's teaching accuracy depends on recognizing board shape without overclaiming. This module adds a dedicated shape recognition layer between raw KataGo evidence and the LLM teacher.

## Design goals

1. Recognize local structures with geometry, not only keywords.
2. Support all board symmetries: rotations, reflections, corner/side/middle placement, and color perspective.
3. Fuse KataGo evidence such as candidates, PV support, visits, ownership, and score loss before choosing the teaching focus.
4. Emit counter-evidence and safe wording so weak matches are not presented as facts.
5. Measure recognition coverage through golden fixtures.

## New modules

```text
src/main/services/knowledge/localPatternMatcher.ts
src/main/services/knowledge/katagoShapeFeatures.ts
src/main/services/knowledge/shapeRecognitionEngine.ts
data/knowledge/shape-pattern-cards-v1.json
data/knowledge/elite-pattern-cards-v11.json
scripts/eval_shape_recognition.mjs
tests/fixtures/shape-recognition-golden/
```

## Why this improves accuracy

Classic Go engines treat patterns as board geometry with constraints and transformations. GNU Go's pattern system documents eight transformations and constraint/helper logic. Kombilo-style pattern search similarly treats rotations/reflections and color switching as first-class search behavior. GoMentor uses this engineering pattern, but keeps the teaching text original and validates final judgement against KataGo.

## Safe wording policy

Recognized shapes are not all equally reliable:

```text
可以明确说      strong match, little counter-evidence
更像是          medium match or some counter-evidence
只作为训练类比  weak match useful for teaching but not a factual label
不能主讲        counter-evidence dominates
```

The teacher should only name tactical shapes confidently when local pattern evidence, tactical evidence, and KataGo evidence agree.

## Evaluation

Run:

```bash
pnpm eval:shape-recognition
pnpm check:teacher-quality
```

Golden fixtures specify `expectedShapes`, `forbiddenShapes`, and required evidence signals. The next step is to add real SGF fixtures and measure top-1 accuracy, top-3 recall, and false joseki rate.
