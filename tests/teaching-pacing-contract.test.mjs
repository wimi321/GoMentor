import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

function findJitiCli() {
  const pnpmStore = join(repoRoot, 'node_modules', '.pnpm')
  if (existsSync(pnpmStore)) {
    const jitiPackage = readdirSync(pnpmStore).find((entry) => entry.startsWith('jiti@'))
    if (jitiPackage) {
      const cli = join(pnpmStore, jitiPackage, 'node_modules', 'jiti', 'lib', 'jiti-cli.mjs')
      if (existsSync(cli)) return cli
    }
  }
  throw new Error('Unable to locate jiti CLI for teaching pacing fixture')
}

test('current-move prompt controls explanation density without restoring templates', () => {
  const agent = read('src/main/services/teacherAgent.ts')
  assert.match(agent, /常规定式少讲/)
  assert.match(agent, /分支列变化/)
  assert.match(agent, /中盘战详细讲目的和后续/)
  assert.match(agent, /teachingDensity/)
  assert.match(agent, /detailed 讲目的、应手、后续变化和实战评价/)
  assert.doesNotMatch(agent, /短讲解卡/)
  assert.doesNotMatch(agent, /desiredShape/)
  assert.doesNotMatch(agent, /①②③④/)
})

test('teaching pacing evidence chooses minimal, branch, detailed, and caution modes', () => {
  const output = execFileSync(process.execPath, [findJitiCli(), 'tests/fixtures/teaching-pacing-smoke.ts'], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  const result = JSON.parse(output)

  assert.equal(result.openingNormal.teachingDensity, 'minimal')
  assert.equal(result.openingNormal.teachingFocus, 'joseki-normal')
  assert.match(result.openingNormal.whyThisMuchExplanation, /常规定式/)

  assert.equal(result.josekiBranch.teachingDensity, 'branch')
  assert.equal(result.josekiBranch.teachingFocus, 'joseki-branch')
  assert.match(result.josekiBranch.whyThisMuchExplanation, /关键变化/)

  assert.equal(result.middleFight.teachingDensity, 'detailed')
  assert.equal(result.middleFight.teachingFocus, 'middlegame-fight')
  assert.match(result.middleFight.whyThisMuchExplanation, /目的、对方应手、PV 后续和实战代价/)

  assert.equal(result.lowEvidence.teachingDensity, 'caution')
  assert.match(result.lowEvidence.whyThisMuchExplanation, /不能下绝对结论/)

  for (const sample of [result.openingNormal, result.josekiBranch, result.middleFight]) {
    assert.ok(sample.variationTeachingHints.length >= 2)
    assert.ok(sample.variationTeachingHints[0].move)
    assert.ok(Array.isArray(sample.variationTeachingHints[0].pv))
    assert.ok(sample.variationTeachingHints[0].purpose)
  }
})
