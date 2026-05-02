#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const fixtureRoot = join(root, 'tests', 'fixtures', 'teaching-golden')

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : path.endsWith('.json') ? [path] : []
  })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function validateFixture(fixture, path) {
  const errors = []
  if (!fixture.id) errors.push('missing id')
  if (!fixture.sgf && !fixture.gameId) errors.push('missing sgf or gameId')
  if (typeof fixture.moveNumber !== 'number') errors.push('missing numeric moveNumber')
  if (!fixture.expected) errors.push('missing expected block')
  if (fixture.expected) {
    for (const key of ['allowedBestMoves', 'forbiddenMoves', 'motifs', 'mustMention', 'mustNotMention']) {
      if (fixture.expected[key] && !Array.isArray(fixture.expected[key])) errors.push(`${key} must be an array`)
    }
  }
  return errors.map((error) => `${path}: ${error}`)
}

const fixtures = walk(fixtureRoot).map(readJson)
const validationErrors = walk(fixtureRoot).flatMap((path) => validateFixture(readJson(path), path))

if (validationErrors.length) {
  console.error(validationErrors.join('\n'))
  process.exit(1)
}

const summary = {
  fixtureCount: fixtures.length,
  categories: fixtures.reduce((acc, fixture) => {
    const category = fixture.category ?? 'uncategorized'
    acc[category] = (acc[category] ?? 0) + 1
    return acc
  }, {}),
  note: fixtures.length === 0
    ? 'No golden teaching fixtures yet. Add JSON fixtures under tests/fixtures/teaching-golden to turn this into an accuracy gate.'
    : 'Golden fixture schema validated. Runtime scoring can be added once CI has KataGo assets.'
}

console.log(JSON.stringify(summary, null, 2))
