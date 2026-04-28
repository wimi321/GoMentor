#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.cwd()
const sgfRoot = join(root, 'data', 'knowledge', 'joseki-sgf')
if (!existsSync(sgfRoot)) {
  console.error(`No joseki SGF root found at ${sgfRoot}`)
  process.exit(1)
}
let fileCount = 0
let bytes = 0
for (const source of readdirSync(sgfRoot, { withFileTypes: true })) {
  if (!source.isDirectory()) continue
  for (const file of readdirSync(join(sgfRoot, source.name), { withFileTypes: true })) {
    if (!file.isFile() || !file.name.toLowerCase().endsWith('.sgf')) continue
    fileCount += 1
    bytes += readFileSync(join(sgfRoot, source.name, file.name)).byteLength
  }
}
console.log(JSON.stringify({ sgfRoot, fileCount, bytes }, null, 2))
