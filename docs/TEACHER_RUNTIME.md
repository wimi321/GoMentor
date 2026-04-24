# Teacher Runtime v1

## Task types

- current move
- full game
- recent 10 games
- freeform follow-up

## Required context

Every high-quality teacher call should include:

- Game context
- KataGo evidence
- Knowledge cards
- Student profile
- User prompt

## Structured output

Ask the Claude-compatible model to output JSON. Parse JSON if possible. Fall back to markdown if needed.

Required result fields:

- headline
- summary
- keyMistakes
- correctThinking
- drills
- followupQuestions
- profileUpdates

## Tool logs

Tool logs should be shown collapsed by default. They should include:

- read game
- KataGo analysis
- knowledge search
- student profile read/write
- LLM call
- report save

Errors should identify the failing stage, not only show generic “task failed”.
