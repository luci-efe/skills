import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { init, status, markMissing } from '../skills/council/scripts/council.mjs'

const setup = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'council-'))
  writeFileSync(join(cwd, 'plan.md'), '# plan\n')
  return { cwd, stateDir: join(cwd, '.ramos') }
}

test('init refuses to start without an artifact under review', () => {
  const o = setup()
  assert.throws(() => init({ ...o, artifact: join(o.cwd, 'missing.md'), seats: ['claude', 'codex'] }), /artifact/)
  assert.throws(() => init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude'] }), /at least 2 seats/)
})

test('init creates a run with bounded rounds and per-seat output paths', () => {
  const o = setup()
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex', 'gemini'] })
  const run = JSON.parse(readFileSync(join(r.dir, 'council.json'), 'utf8'))
  assert.equal(run.max_rounds, 2)
  assert.deepEqual(Object.keys(run.outputs['1']), ['claude', 'codex', 'gemini'])
  assert.ok(existsSync(join(r.dir, 'round1.prompt.md')))
  assert.match(readFileSync(join(r.dir, 'round1.prompt.md'), 'utf8'), new RegExp(`council:done run=${r.run_id}`))
})

test('status only counts seat files with the matching completion marker', () => {
  const o = setup()
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'] })
  const run = JSON.parse(readFileSync(join(r.dir, 'council.json'), 'utf8'))
  writeFileSync(run.outputs['1'].claude, `text\n<!-- council:done run=${r.run_id} seat=claude round=1 -->\n`)
  writeFileSync(run.outputs['1'].codex, 'truncated answer without marker')
  let s = status({ dir: r.dir })
  assert.deepEqual(s.rounds['1'], { claude: 'done', codex: 'incomplete' })
  assert.equal(s.complete, false)
  writeFileSync(run.outputs['1'].codex, `x\n<!-- council:done run=OTHER seat=codex round=1 -->`)
  assert.equal(status({ dir: r.dir }).rounds['1'].codex, 'incomplete')
})

test('a failed seat can be recorded so the run can still terminate', () => {
  const o = setup()
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'] })
  const run = JSON.parse(readFileSync(join(r.dir, 'council.json'), 'utf8'))
  writeFileSync(run.outputs['1'].claude, `<!-- council:done run=${r.run_id} seat=claude round=1 -->`)
  markMissing({ dir: r.dir, round: '1', seat: 'codex', reason: 'rate limited until 18:00' })
  const s = status({ dir: r.dir })
  assert.equal(s.rounds['1'].codex, 'missing: rate limited until 18:00')
  assert.equal(s.round_closed['1'], true)
})

test('a round with fewer than 2 completed reviews is never complete', () => {
  const o = setup()
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'] })
  for (const round of ['1', '2']) for (const seat of ['claude', 'codex']) markMissing({ dir: r.dir, round, seat, reason: 'down' })
  writeFileSync(join(r.dir, 'SYNTHESIS.md'), '# s')
  const s = status({ dir: r.dir })
  assert.equal(s.complete, false)
  assert.match(s.problems.join(' '), /fewer than 2 completed reviews/)
})

test('missing requires a non-empty reason and a known round and seat', () => {
  const o = setup()
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'] })
  assert.throws(() => markMissing({ dir: r.dir, round: '1', seat: 'codex', reason: '' }), /reason/)
  assert.throws(() => markMissing({ dir: r.dir, round: '1', seat: 'nobody', reason: 'x' }), /unknown seat/)
  assert.throws(() => markMissing({ dir: r.dir, round: '9', seat: 'codex', reason: 'x' }), /unknown round/)
})

test('the marker only counts as the final non-empty line', () => {
  const o = setup()
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'] })
  const run = JSON.parse(readFileSync(join(r.dir, 'council.json'), 'utf8'))
  writeFileSync(run.outputs['1'].claude, `<!-- council:done run=${r.run_id} seat=claude round=1 -->\n## partial, still writing`)
  assert.equal(status({ dir: r.dir }).rounds['1'].claude, 'incomplete')
  writeFileSync(run.outputs['1'].claude, `body\n<!-- council:done run=${r.run_id} seat=claude round=1 -->\n\n`)
  assert.equal(status({ dir: r.dir }).rounds['1'].claude, 'done')
})

test('seat names are validated and runs are never overwritten', () => {
  const o = setup()
  assert.throws(() => init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', '../../escaped'] }), /invalid seat/)
  assert.deepEqual(JSON.parse(readFileSync(join(init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: [' claude', 'codex '] }).dir, 'council.json'), 'utf8')).seats, ['claude', 'codex'])
  init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'], runId: 'fixed' })
  assert.throws(() => init({ ...o, artifact: join(o.cwd, 'plan.md'), seats: ['claude', 'codex'], runId: 'fixed' }), /already exists/)
})

test('concurrent missing calls do not lose updates', async () => {
  const o = setup()
  const seats = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']
  const r = init({ ...o, artifact: join(o.cwd, 'plan.md'), seats })
  const { spawn } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const cli = fileURLToPath(new URL('../skills/council/scripts/council.mjs', import.meta.url))
  const codes = await Promise.all(seats.map((s) => new Promise((res) => spawn(process.execPath, [cli, 'missing', '--dir', r.dir, '--round', '1', '--seat', s, '--reason', 'down']).on('close', res))))
  assert.deepEqual(codes, seats.map(() => 0))
  assert.equal(Object.keys(JSON.parse(readFileSync(join(r.dir, 'council.json'), 'utf8')).missing).length, 6)
})
