# Knowledge motif recognition system

This upgrade turns the local knowledge base from passive retrieval into an explicit Go-shape recognition layer for the AI teacher.

## What changed

### 1. Recognition engine

`src/main/services/knowledge/motifRecognizer.ts` adds a deterministic motif recognizer that combines:

- KataGo evidence: played move, top candidate, winrate loss, score loss, candidate spread, PV hints;
- board context: move phase, rough board region, whether the actual move and best move are local alternatives or whole-board alternatives;
- local knowledge matches: existing pattern/knowledge cards, confidence, reasons and teaching payloads;
- expanded elite pattern cards from `data/knowledge/elite-pattern-cards.json`;
- heuristic backstops for common cases where keyword matching misses the board meaning.

It outputs `RecognizedTeachingMotif[]`, each with:

- motif type;
- confidence;
- score;
- evidence reasons;
- human recognition sentence;
- common wrong thinking;
- correct thinking order;
- small drill prompt;
- related moves.

### 2. Expanded knowledge cards

`data/knowledge/elite-pattern-cards.json` adds 44 high-priority teaching motifs, including:

- cut point and connection;
- atari direction;
- ladder, net, throw-in, snapback;
- semeai, life and death, eye shape, liberty shortage;
- ko and ko threat value;
- attack direction, leaning attack, escape route;
- sacrifice and capture greed;
- sente/gote, urgent-vs-big, tenuki risk;
- thickness efficiency and over-defense;
- territory vs influence, moyo reduction, invasion timing;
- honte, shape inefficiency, contact fight, peep response;
- shoulder hit, local vs global judgement;
- advantage risk control and disadvantage complication;
- opening direction, enclosure timing, joseki direction;
- endgame sente, reverse sente, yose counting and endgame shape;
- sabaki, aji management, punishing overplay, time-trouble simplification.

These cards are not generic essays. Each card includes trigger signals, aliases, KataGo signals, recognition wording, wrong thinking, correct thinking and a drill.

### 3. Teacher evidence integration

`TeachingEvidence` now contains `recognizedMotifs`. The LLM receives these before the raw knowledge packet and is instructed to use only the top one or two motifs so the explanation stays clear.

The final evidence note also includes the strongest recognized motif.

### 4. Streaming is preserved

The multimodal LLM callback still streams deltas to the renderer while the answer is generated. After verification finishes, the compact evidence/motif note is emitted as an additional delta, so the user does not have to wait for a final non-streaming replacement to see the evidence chain.

## Why this improves recognition rate

The old knowledge flow could miss patterns when the user's prompt did not contain the exact keyword. The new recognizer raises recall by combining four signals:

1. Textual signal: user prompt, context tags and knowledge card aliases.
2. KataGo signal: loss type, candidate spread and score loss.
3. Spatial signal: local vs global candidate difference and rough board region.
4. Heuristic signal: urgent-vs-big, local-shape-loss, endgame-sente and attack-direction backstops.

This means a局面 can still be recognized as “attack direction” or “urgent vs big” even when the user only asks “这手为什么不好？” and never mentions those words.

## Suggested QA

1. Import a game and choose a middle-game mistake where KataGo's best move is far from the played move. Confirm the teacher evidence includes `urgent_vs_big`, `attack_direction`, or `local_vs_global`.
2. Choose a local tactical mistake where the best move is within two intersections. Confirm the recognizer prefers `shape_inefficiency`, `cut_point`, `life_and_death`, or another local motif.
3. Choose an endgame mistake. Confirm `endgame_sente`, `reverse_sente`, or `yose_counting` appears and the teacher talks about score loss and sente/gote instead of only winrate.
4. Confirm the teacher answer streams token by token, then appends a short evidence note.
5. Confirm weak motifs are not phrased as facts.
