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

function overlap(left = [], right = []) {
  const rightSet = new Set(right.map((item) => String(item).toLowerCase()))
  return left.filter((item) => rightSet.has(String(item).toLowerCase()))
}

function validateClaimsFixture(fixture, path) {
  const errors = []
  const expected = fixture.expected ?? {}
  const coordinateOverlap = overlap(expected.allowedBestMoves, expected.forbiddenMoves)
  if (coordinateOverlap.length) errors.push(`allowedBestMoves intersects forbiddenMoves: ${coordinateOverlap.join(', ')}`)
  const phraseOverlap = overlap(expected.mustMention, expected.mustNotMention)
  if (phraseOverlap.length) errors.push(`mustMention intersects mustNotMention: ${phraseOverlap.join(', ')}`)
  if (expected.numericTolerance) {
    for (const [key, value] of Object.entries(expected.numericTolerance)) {
      if (typeof value !== 'number' || value < 0) errors.push(`numericTolerance.${key} must be a non-negative number`)
    }
  }
  if (expected.claims) {
    if (!Array.isArray(expected.claims)) errors.push('expected.claims must be an array')
    else {
      for (const [index, claim] of expected.claims.entries()) {
        if (!claim.id) errors.push(`claims[${index}] missing id`)
        if (!claim.type) errors.push(`claims[${index}] missing type`)
        if (!claim.text) errors.push(`claims[${index}] missing text`)
        if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
          errors.push(`claims[${index}] must include evidenceRefs`)
        }
      }
    }
  }
  return errors.map((error) => `${path}: ${error}`)
}

const paths = walk(fixtureRoot)
const fixtures = paths.map(readJson)
const ids = new Set()
const errors = []
for (const [index, fixture] of fixtures.entries()) {
  const path = paths[index]
  if (ids.has(fixture.id)) errors.push(`${path}: duplicate fixture id ${fixture.id}`)
  ids.add(fixture.id)
  errors.push(...validateClaimsFixture(fixture, path))
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(JSON.stringify({ fixtureCount: fixtures.length, checked: 'claim-fixture-consistency' }, null, 2))
