#!/usr/bin/env node
// /council run bookkeeping: an artifact under review, bounded rounds, per-seat files with completion markers.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stateDirectory } from './_lib/config.mjs'

const MAX_ROUNDS = 2
const stateDirOf = (o) => o.stateDir ?? stateDirectory(o.cwd ?? process.cwd())
const SEAT = /^[a-z0-9][a-z0-9-]{0,31}$/
const MIN_REVIEWS = 2
const saveRun = (dir, run) => { const p = join(dir, 'council.json'); const tmp = `${p}.${process.pid}.tmp`; writeFileSync(tmp, `${JSON.stringify(run, null, 2)}\n`); renameSync(tmp, p) }
const lastLine = (text) => text.trimEnd().split('\n').pop().trim()
const marker = (run, seat, round) => `<!-- council:done run=${run} seat=${seat} round=${round} -->`

const prompt = (run, round, artifact, seats) => {
  const lens = round === 1
    ? 'Review the artifact independently. Do not read other seats\' files. Report defects with file/line or section evidence, risks, and a recommendation.'
    : 'Read every other seat\'s round 1 file. Attack positions with cited evidence, concede explicitly where they are right, and list questions only the human can answer.'
  return `# Council ${run.run_id}, round ${round}

Artifact under review: \`${artifact}\`
Seats: ${seats.join(', ')}

${lens}

Write only your own file:
${seats.map((s) => `- ${s}: \`${run.outputs[round][s]}\``).join('\n')}

End your file with this exact line (substitute your seat):
${marker(run.run_id, '<seat>', round)}
`
}

export const init = (o) => {
  const artifact = resolve(o.cwd ?? process.cwd(), o.artifact ?? '')
  if (!o.artifact || !existsSync(artifact)) throw new Error('council needs an existing artifact under review (plan, spec, diff, or problem statement file)')
  const seats = [...new Set((o.seats ?? []).map((x) => String(x).trim()).filter(Boolean))]
  for (const seat of seats) if (!SEAT.test(seat)) throw new Error(`invalid seat ${JSON.stringify(seat)}: use lowercase letters, digits and -`)
  if (seats.length < 2) throw new Error('council needs at least 2 seats from different model families')
  const run_id = o.runId ?? `c-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 4)}`
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(run_id)) throw new Error(`invalid run id ${JSON.stringify(run_id)}`)
  const dir = join(stateDirOf(o), 'council', run_id)
  mkdirSync(join(stateDirOf(o), 'council'), { recursive: true })
  try { mkdirSync(dir) } catch (e) { if (e.code === 'EEXIST') throw new Error(`council run ${run_id} already exists`); throw e }
  const outputs = {}
  for (let r = 1; r <= MAX_ROUNDS; r++) outputs[r] = Object.fromEntries(seats.map((s) => [s, join(dir, `round${r}.${s}.md`)]))
  const run = { schema_version: 1, run_id, artifact, seats, max_rounds: MAX_ROUNDS, outputs, missing: {}, created_at: new Date().toISOString() }
  saveRun(dir, run)
  for (let r = 1; r <= MAX_ROUNDS; r++) writeFileSync(join(dir, `round${r}.prompt.md`), prompt(run, r, artifact, seats))
  return { run_id, dir }
}

const withLock = (dir, fn) => {
  const lock = join(dir, '.lock')
  const until = Date.now() + 10_000
  for (;;) {
    try { mkdirSync(lock); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (Date.now() > until) throw new Error(`council run is locked (${lock}); remove it if no other council command is running`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  try { return fn() } finally { rmdirSync(lock) }
}

export const markMissing = (args) => withLock(args.dir, () => markMissingUnlocked(args))
const markMissingUnlocked = ({ dir, round, seat, reason }) => {
  const p = join(dir, 'council.json')
  const run = JSON.parse(readFileSync(p, 'utf8'))
  if (!run.outputs[round]) throw new Error(`unknown round ${round}`)
  if (!run.outputs[round][seat]) throw new Error(`unknown seat ${seat}`)
  if (!reason || !String(reason).trim()) throw new Error('a non-empty --reason is required')
  run.missing[`${round}:${seat}`] = String(reason).trim()
  saveRun(dir, run)
}

export const status = ({ dir }) => {
  const run = JSON.parse(readFileSync(join(dir, 'council.json'), 'utf8'))
  const rounds = {}
  const round_closed = {}
  for (const [r, bySeat] of Object.entries(run.outputs)) {
    rounds[r] = {}
    for (const [seat, path] of Object.entries(bySeat)) {
      const miss = run.missing[`${r}:${seat}`]
      rounds[r][seat] = miss ? `missing: ${miss}`
        : existsSync(path) && lastLine(readFileSync(path, 'utf8')) === marker(run.run_id, seat, r) ? 'done' : 'incomplete'
    }
    round_closed[r] = Object.values(rounds[r]).every((v) => v !== 'incomplete')
  }
  const problems = []
  for (const [r, bySeat] of Object.entries(rounds)) {
    const done = Object.values(bySeat).filter((v) => v === 'done').length
    if (round_closed[r] && done < MIN_REVIEWS) problems.push(`round ${r} closed with fewer than ${MIN_REVIEWS} completed reviews (${done})`)
  }
  const synthesis = existsSync(join(dir, 'SYNTHESIS.md'))
  return { run_id: run.run_id, rounds, round_closed, synthesis, problems, complete: Object.values(round_closed).every(Boolean) && synthesis && problems.length === 0 }
}

const main = (argv) => {
  const [cmd, ...rest] = argv
  const flag = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined }
  if (cmd === 'init') console.log(JSON.stringify(init({ artifact: flag('artifact'), seats: (flag('seats') ?? '').split(',').filter(Boolean) })))
  else if (cmd === 'status') console.log(JSON.stringify(status({ dir: flag('dir') }), null, 2))
  else if (cmd === 'missing') { markMissing({ dir: flag('dir'), round: flag('round'), seat: flag('seat'), reason: flag('reason') }); console.log('recorded') }
  else { console.log('council.mjs init --artifact <file> --seats a,b[,c] | status --dir <run> | missing --dir <run> --round <n> --seat <s> --reason <text>'); process.exitCode = cmd ? 2 : 0 }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) { try { main(process.argv.slice(2)) } catch (e) { console.error(`council: ${e.message}`); process.exitCode = 2 } }
