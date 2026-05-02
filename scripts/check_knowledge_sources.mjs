import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const knowledgeDir = join(root, 'data', 'knowledge')

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'))
}

function optionalJson(relativePath) {
  const path = join(root, relativePath)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
}

function sourceRegistry() {
  const primary = readJson('data/knowledge/source-registry.json')
  const expansion = optionalJson('data/knowledge/source-registry-v9.json')
  const shapeRecognition = optionalJson('data/knowledge/source-registry-v11.json')
  const sources = [...primary, ...expansion, ...shapeRecognition]
  const ids = new Set()
  for (const source of sources) {
    assert.ok(source.id, 'source registry entry missing id')
    assert.ok(source.url, `${source.id} missing url`)
    assert.ok(source.license, `${source.id} missing license`)
    assert.ok(source.status, `${source.id} missing status`)
    assert.ok(source.why, `${source.id} missing why`)
    assert.ok(Array.isArray(source.usedFor), `${source.id} missing usedFor`)
    assert.ok(!ids.has(source.id), `duplicate source id: ${source.id}`)
    ids.add(source.id)
  }
  return new Map(sources.map((source) => [source.id, source]))
}

function knowledgePacks() {
  return readdirSync(knowledgeDir)
    .filter((name) => /^elite-pattern-cards-v(?:6|7|8|9|10|11)\.json$/.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'))
}

function assertCardSourcePolicy(packName, card, registry) {
  assert.ok(card.id, `${packName}: card missing id`)
  assert.ok(card.title, `${packName}:${card.id} missing title`)
  assert.ok(card.patternType, `${packName}:${card.id} missing patternType`)
  assert.ok(Array.isArray(card.sourceRefs) && card.sourceRefs.length > 0, `${packName}:${card.id} missing sourceRefs`)
  assert.ok(card.sourceQuality, `${packName}:${card.id} missing sourceQuality`)
  assert.ok(card.recognition, `${packName}:${card.id} missing recognition`)
  assert.ok(card.correctThinking, `${packName}:${card.id} missing correctThinking`)
  assert.ok(card.wrongThinking, `${packName}:${card.id} missing wrongThinking`)
  assert.ok(card.drillPrompt, `${packName}:${card.id} missing drillPrompt`)
  assert.ok(Array.isArray(card.triggerSignals) && card.triggerSignals.length > 0, `${packName}:${card.id} missing triggerSignals`)
  assert.ok(Array.isArray(card.katagoSignals), `${packName}:${card.id} missing katagoSignals array`)

  for (const sourceRef of card.sourceRefs) {
    const source = registry.get(sourceRef)
    assert.ok(source, `${packName}:${card.id} references unknown source ${sourceRef}`)
    assert.ok(!/do-not-import|source-risk-reference|architecture-reference-only/i.test(source.status), `${packName}:${card.id} references non-importable source ${sourceRef} (${source.status})`)
  }

  const serialized = JSON.stringify(card).toLowerCase()
  for (const forbidden of ['copiedsource', 'verbatimquote', 'source_text', 'rawdiagram', 'book problem']) {
    assert.ok(!serialized.includes(forbidden), `${packName}:${card.id} contains forbidden source-copy marker ${forbidden}`)
  }
}

function assertExpansionPolicy() {
  const registry = sourceRegistry()
  const packs = knowledgePacks()
  assert.ok(packs.includes('elite-pattern-cards-v9.json'), 'v9 source-backed pack missing')
  assert.ok(packs.includes('elite-pattern-cards-v10.json'), 'v10 deep concept pack missing')
  assert.ok(packs.includes('elite-pattern-cards-v11.json'), 'v11 shape recognition pack missing')

  const cards = []
  for (const pack of packs) {
    const packCards = readJson(`data/knowledge/${pack}`)
    assert.ok(Array.isArray(packCards) && packCards.length > 0, `${pack} is empty`)
    for (const card of packCards) {
      assertCardSourcePolicy(pack, card, registry)
      cards.push({ pack, card })
    }
  }

  const refs = new Set(cards.flatMap(({ card }) => card.sourceRefs))
  for (const required of ['katago-analysis-engine-docs', 'sgf-ff4-red-bean', 'sensei-go-terms', 'josekipedia-game-collection', 'gomentor-curated-original']) {
    assert.ok(refs.has(required), `knowledge expansion does not reference required source ${required}`)
  }

  const sourcePolicyCards = cards.filter(({ card }) => card.category === 'source-policy')
  assert.ok(sourcePolicyCards.length >= 4, 'expected at least four source-policy cards')
}

assertExpansionPolicy()
console.log('knowledge source policy check passed')
