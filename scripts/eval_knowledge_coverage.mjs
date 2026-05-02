import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function json(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function cardSearchText(card) {
  return [
    card.id,
    card.title,
    card.category,
    card.patternType,
    ...(card.tags ?? []),
    ...(card.aliases ?? []),
    ...(card.triggerSignals ?? []),
    ...(card.katagoSignals ?? []),
    card.recognition,
    card.correctThinking,
    card.wrongThinking,
    card.drillPrompt
  ].filter(Boolean).join(' ').toLowerCase()
}

function allCards() {
  const packs = [
    'elite-pattern-cards-v6.json',
    'elite-pattern-cards-v7.json',
    'elite-pattern-cards-v8.json',
    'elite-pattern-cards-v9.json',
    'elite-pattern-cards-v10.json',
    'elite-pattern-cards-v11.json'
  ]
  return packs.flatMap((pack) => json(`data/knowledge/${pack}`).map((card) => ({ ...card, pack })))
}

function assertTopicCoverage() {
  const fixture = json('tests/fixtures/knowledge-coverage/required-topics.json')
  const cards = allCards()
  const searchTexts = cards.map((card) => ({ card, text: cardSearchText(card) }))

  for (const pack of fixture.requiredPacks) {
    assert.ok(cards.some((card) => card.pack === pack), `required pack not loaded: ${pack}`)
  }

  const refs = new Set(cards.flatMap((card) => card.sourceRefs ?? []))
  for (const ref of fixture.requiredSourceRefs) {
    assert.ok(refs.has(ref), `required source ref not covered: ${ref}`)
  }

  for (const topic of fixture.requiredTopics) {
    const hits = searchTexts.filter(({ text }) => topic.mustMatchAny.some((needle) => text.includes(String(needle).toLowerCase())))
    assert.ok(hits.length > 0, `required topic not covered: ${topic.id}`)
  }

  const deepConceptCount = cards.filter((card) => card.pack === 'elite-pattern-cards-v10.json').length
  const sourcePolicyCount = cards.filter((card) => card.pack === 'elite-pattern-cards-v9.json' && card.category === 'source-policy').length
  assert.ok(deepConceptCount >= 18, `expected at least 18 deep concept cards, got ${deepConceptCount}`)
  assert.ok(sourcePolicyCount >= 4, `expected at least 4 source-policy cards, got ${sourcePolicyCount}`)
}

assertTopicCoverage()
console.log('knowledge coverage eval passed')
