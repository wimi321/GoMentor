# Teaching quality and multilingual UI upgrade

This patch adds four production-quality foundations for GoMentor's AI teacher.

## 1. Evidence chain

`src/main/services/teacher/teachingEvidence.ts` converts raw KataGo analysis, matched knowledge cards, recommended problems, and the student profile into a compact `TeachingEvidence` object.

The LLM receives this object before the raw data. The evidence includes:

- move number, phase, board size, actual move;
- before/after winrate and score lead;
- top candidates with visits and PV snippets;
- winrate/score loss;
- severity;
- confidence;
- teaching mode;
- matched knowledge references and why they matched;
- student level and recurring issues;
- hard constraints that prevent fabricated coordinates, winrates, joseki names, or PVs.

## 2. Confidence and human-teacher wording

The teacher prompt now tells the LLM to behave like a human coach:

1. one-sentence judgement;
2. why;
3. correct thinking order;
4. one small drill or next-game reminder.

When confidence is medium or low, the teacher must lower the tone:

- “AI 更倾向……”
- “这更像是方向选择……”
- “不必当成绝对错手……”

This avoids over-criticizing moves when KataGo candidates are close or visits are low.

## 3. Verifier

`verifyTeacherMarkdown` scans the generated explanation for risky claims:

- recommended coordinates not present in actual move, top candidates, or PV evidence;
- impossible percentages;
- overly absolute language when confidence is not high.

The final report appends a compact evidence note so users can see why the teacher said what it said.

## 4. More robust intent recognition

`src/main/services/teacher/intentClassifier.ts` replaces one-line regex branching with a scored multilingual classifier.

It understands:

- current-move questions;
- whole-game review;
- recent/multiple-game weakness analysis;
- training plans;
- vague “help me review this game” prompts.

It returns confidence, rationale, matched signals, and requested game count for future tooling.

## 5. Multilingual UI and humanized errors

The patch adds UI language support for:

- 简体中文;
- English;
- 日本語;
- 한국어;
- ไทย;
- Tiếng Việt.

User-facing errors now explain:

- what happened;
- what the user should do next;
- the technical detail for developers.

For example, instead of:

```text
KataGo runtime missing
```

users see:

```text
围棋分析引擎还没准备好。
请检查 KataGo 程序和模型路径，或让 GoMentor 自动下载资源。
```

## Suggested next tests

After applying the patch, run:

```bash
npm install
npm run typecheck
npm run lint
npm run dev
```

Manual QA checklist:

1. Select each UI language and save settings.
2. Import one SGF and ask “这手为什么不好？”.
3. Confirm the teacher output includes a human explanation and an evidence-chain note.
4. Temporarily break the LLM API key and confirm the fallback is understandable.
5. Temporarily remove the KataGo model path and confirm the UI error is human-readable.
6. Ask “看看我最近 10 盘常犯什么问题并给训练计划” and confirm it routes to the training/multi-game path instead of open-ended chat.
