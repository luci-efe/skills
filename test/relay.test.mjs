import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validate, checkpoint, offer, ack, inject, sync, read } from '../skills/relay/scripts/relay.mjs'
import { available } from '../skills/relay/scripts/memory.mjs'

const RELAY = fileURLToPath(new URL('../skills/relay/scripts/relay.mjs', import.meta.url))
const ws = { repo_id: 'luci-efe/skills', branch: 'main', head: 'abc123', input_digest: 'sha256:00' }
const draft = (over = {}) => ({
  task: { objective: 'Wire the proof Stop adapter', scope: 'hooks/claude/stop.mjs', constraints: ['advisory except proof'], acceptance_refs: ['docs/CONTRACTS.md#6'] },
  work_state: 'active',
  decisions: [{ id: 'D1', summary: 'Never spawn a session inside Stop', source_ref: 'docs/CONTRACTS.md#6', status: 'accepted' }],
  next_actions: [{ owner: 'codex', action: 'add stop_hook_active test', artifact: 'test/stop.test.mjs' }],
  blockers: [], unknowns: [], evidence: [],
  ...over,
})
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-'))
  return { cwd: dir, stateDir: join(dir, '.ramos'), env: { ...process.env, MNEMOSYNE_DATA_DIR: join(dir, 'mnemo') } }
}
const full = (over = {}) => ({ ...draft(), schema_version: 1, run_id: 'r', pane: 'p', sequence: 1, created_at: 'now', parent_checkpoint: null, workspace: ws, ownership: { owner: 'p', intended_receiver: null, transfer_id: null, phase: 'working' }, memory_refs: [], ...over })

test('validate accepts a full checkpoint and enforces §5 shape, enums and caps', () => {
  assert.deepEqual(validate(full()), [])
  const has = (cp, s) => validate(cp).some((e) => e.includes(s))
  assert.ok(has(full({ next_actions: [1, 2, 3, 4].map((i) => ({ owner: 'x', action: `a${i}`, artifact: 'y' })) }), 'next_actions'))
  assert.ok(has(full({ work_state: 'finished' }), 'work_state'))
  assert.ok(has(full({ decisions: 'nope' }), 'decisions must be an array'))
  assert.ok(has(full({ decisions: [{ id: 'D', summary: 's', source_ref: 'r', status: 'maybe' }] }), 'status'))
  assert.ok(has(full({ ownership: { owner: 'p', intended_receiver: null, transfer_id: null, phase: 'gone' } }), 'phase'))
  assert.ok(has(full({ workspace: { repo_id: 'x' } }), 'workspace.input_digest'))
  assert.ok(has(full({ task: { objective: 'x'.repeat(241), scope: 's', constraints: [], acceptance_refs: [] } }), '240'))
  assert.ok(has(full({ next_actions: [{ owner: 'x' }] }), 'next_actions[0].action'))
})

test('checkpoint writes immutable JSON plus generated HANDOFF.md and chains sequence', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const cp = JSON.parse(readFileSync(a.path, 'utf8'))
  assert.equal(cp.sequence, 1)
  assert.equal(cp.parent_checkpoint, null)
  const md = readFileSync(join(a.dir, 'HANDOFF.md'), 'utf8')
  assert.match(md, /generated from handoff\.json/i)
  assert.match(md, new RegExp(a.sha256))
  const b = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const cb = JSON.parse(readFileSync(b.path, 'utf8'))
  assert.equal(cb.sequence, 2)
  assert.equal(cb.parent_checkpoint.sha256, a.sha256)
  assert.doesNotMatch(cb.parent_checkpoint.path, /\\/)
})

test('draft cannot override system fields', () => {
  const o = setup()
  assert.throws(() => checkpoint(draft({ ownership: { owner: 'mallory' } }), { ...o, runId: 'r1', pane: 'chair', workspace: ws }), /not allowed in a draft: ownership/)
  assert.throws(() => checkpoint(draft({ sequence: 99 }), { ...o, runId: 'r1', pane: 'chair', workspace: ws }), /sequence/)
})

test('run and pane names cannot escape the state dir', () => {
  const o = setup()
  for (const bad of ['../../outside', 'a/b', '', '.hidden']) {
    assert.throws(() => checkpoint(draft(), { ...o, runId: bad, pane: 'chair', workspace: ws }), /invalid run id/)
    assert.throws(() => checkpoint(draft(), { ...o, runId: 'r1', pane: bad, workspace: ws }), /invalid pane/)
  }
  assert.equal(existsSync(join(o.cwd, 'outside')), false)
})

test('absolute RAMOS_STATE_DIR is honoured, not nested under cwd', () => {
  const o = setup()
  const abs = mkdtempSync(join(tmpdir(), 'state-'))
  const r = spawnSync(process.execPath, [RELAY, 'inject', '--pane', 'x', '--no-memory'], { cwd: o.cwd, env: { ...process.env, RAMOS_STATE_DIR: abs }, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(join(o.cwd, abs.replace(/^\//, ''))), false)
})

test('a crashed half-written lane does not wedge later checkpoints', () => {
  const o = setup()
  checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  mkdirSync(join(o.stateDir, 'runs', 'r1', 'chair', 'checkpoints', '2'), { recursive: true })
  const c = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  assert.equal(c.sequence, 3)
  assert.equal(JSON.parse(readFileSync(c.path, 'utf8')).parent_checkpoint.path.endsWith('/1/handoff.json'), true)
})

test('concurrent writers each get a distinct sequence and consistent files', async () => {
  const o = setup()
  writeFileSync(join(o.cwd, 'd.json'), JSON.stringify(draft()))
  spawnSync('git', ['init', '-q'], { cwd: o.cwd })
  const run = () => new Promise((res) => {
    const p = spawn(process.execPath, [RELAY, 'checkpoint', '--from', 'd.json', '--run', 'r1', '--pane', 'chair', '--repo-id', 'a/b'], { cwd: o.cwd, env: { ...process.env, RAMOS_STATE_DIR: o.stateDir } })
    let out = ''; p.stdout.on('data', (d) => { out += d }); p.on('close', (code) => res({ code, out }))
  })
  const results = await Promise.all(Array.from({ length: 10 }, run))
  assert.ok(results.every((r) => r.code === 0), JSON.stringify(results))
  const seqs = results.map((r) => JSON.parse(r.out).sequence).sort((a, b) => a - b)
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const lane = join(o.stateDir, 'runs', 'r1', 'chair', 'checkpoints')
  for (const n of readdirSync(lane)) {
    const body = readFileSync(join(lane, n, 'handoff.json'), 'utf8')
    assert.equal(JSON.parse(body).sequence, Number(n))
    assert.equal(read(join(lane, n, 'handoff.json')).ok, true)
  }
})

test('offer writes an offered checkpoint; ack transfers exactly once and detects tampering', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const off = offer(a.path, { ...o, to: 'codex', workspace: ws })
  const offered = JSON.parse(readFileSync(off.checkpoint, 'utf8'))
  assert.equal(offered.ownership.phase, 'offered')
  assert.equal(offered.ownership.intended_receiver, 'codex')
  assert.equal(offered.ownership.transfer_id, off.transfer_id)
  const k = ack(off.path, { ...o, receiver: 'codex', workspace: ws })
  assert.equal(k.stale, false)
  assert.throws(() => ack(off.path, { ...o, receiver: 'codex', workspace: ws }), /already acknowledged/)
  const o2 = setup()
  const c = checkpoint(draft(), { ...o2, runId: 'r2', pane: 'chair', workspace: ws })
  const off2 = offer(c.path, { ...o2, to: 'codex', workspace: ws })
  assert.throws(() => ack(off2.path, { ...o2, receiver: 'argon', workspace: ws }), /intended for codex/)
  writeFileSync(off2.checkpoint, readFileSync(off2.checkpoint, 'utf8').replace('Wire', 'Tamper'))
  assert.throws(() => ack(off2.path, { ...o2, receiver: 'codex', workspace: ws }), /digest mismatch/)
})

test('ack records stale=null with a reason when the workspace cannot be computed', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const off = offer(a.path, { ...o, to: 'codex', workspace: ws })
  const k = ack(off.path, { ...o, receiver: 'codex', workspace: null, workspaceError: 'git missing' })
  assert.equal(k.stale, null)
  assert.match(readFileSync(k.path, 'utf8'), /git missing/)
})

test('inject is per receiver, byte-bounded, keeps the read pointer, flags STALE and unknown staleness', () => {
  const o = setup()
  assert.equal(inject({ ...o, pane: 'codex', workspace: ws, memory: false }), '')
  const a = checkpoint(draft({ task: { ...draft().task, objective: '🚀'.repeat(60) } }), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  ack(offer(a.path, { ...o, to: 'codex', workspace: ws }).path, { ...o, receiver: 'codex', workspace: ws })
  assert.equal(inject({ ...o, pane: 'argon', workspace: ws, memory: false }), '')
  const fresh = inject({ ...o, pane: 'codex', workspace: ws, memory: false })
  assert.doesNotMatch(fresh, /STALE/)
  assert.match(fresh.split('\n').pop(), /^read: /)
  const moved = inject({ ...o, pane: 'codex', workspace: { ...ws, head: 'def456' }, memory: false })
  assert.match(moved, /STALE/)
  const unknown = inject({ ...o, pane: 'codex', workspace: null, memory: false })
  assert.match(unknown, /staleness unknown/)
  for (const s of [fresh, moved, unknown]) assert.ok(Buffer.byteLength(s) <= 1600, `${Buffer.byteLength(s)} bytes`)
})

test('inject without a pane lists pending handoffs instead of guessing', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  ack(offer(a.path, { ...o, to: 'codex', workspace: ws }).path, { ...o, receiver: 'codex', workspace: ws })
  assert.match(inject({ ...o, workspace: ws, memory: false }), /1 handoff\(s\) assigned: codex/)
})

test('inject survives a deleted checkpoint', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const off = offer(a.path, { ...o, to: 'codex', workspace: ws })
  ack(off.path, { ...o, receiver: 'codex', workspace: ws })
  writeFileSync(off.checkpoint, '{broken')
  assert.match(inject({ ...o, pane: 'codex', workspace: ws, memory: false }), /cannot read assigned checkpoint/)
})

test('read verifies the generated view against the checkpoint digest', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  assert.equal(read(a.path).ok, true)
  writeFileSync(join(a.dir, 'HANDOFF.md'), readFileSync(join(a.dir, 'HANDOFF.md'), 'utf8').replace('Wire', 'Edited'))
  writeFileSync(a.path, readFileSync(a.path, 'utf8').replace('Wire', 'Changed'))
  assert.equal(read(a.path).ok, false)
})

test('CLI prints usage instead of crashing on missing arguments', () => {
  for (const args of [['read'], ['offer'], ['ack'], ['sync'], ['checkpoint'], ['offer', 'x.json', '--to']]) {
    const r = spawnSync(process.execPath, [RELAY, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2, `${args}: ${r.stderr}`)
    assert.match(r.stderr, /usage|missing|requires/i)
    assert.doesNotMatch(r.stderr, /TypeError/)
  }
})

test('sync stores accepted decisions once per checkpoint digest', { skip: !available().ok && 'mnemosyne not installed' }, () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  assert.equal(sync(a.path, { ...o }).stored, 1)
  assert.equal(sync(a.path, { ...o }).stored, 0)
  ack(offer(a.path, { ...o, to: 'codex', workspace: ws }).path, { ...o, receiver: 'codex', workspace: ws })
  assert.match(inject({ ...o, pane: 'codex', workspace: ws, memory: true }), /Never spawn a session inside Stop/)
})

test('offer keeps the repo id and cannot roll a lane back', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const b = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  assert.throws(() => offer(a.path, { ...o, to: 'codex', workspace: { ...ws, repo_id: 'local' } }), /not the latest checkpoint/)
  const off = offer(b.path, { ...o, to: 'codex', workspace: { ...ws, repo_id: 'local' } })
  assert.equal(JSON.parse(readFileSync(off.checkpoint, 'utf8')).workspace.repo_id, 'luci-efe/skills')
})

test('a lane never ends up with two owners', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const toAlice = offer(a.path, { ...o, to: 'alice', workspace: ws })
  assert.throws(() => offer(a.path, { ...o, to: 'bob', workspace: ws }), /not the latest checkpoint/)
  const toBob = offer(toAlice.checkpoint, { ...o, to: 'bob', workspace: ws })
  assert.throws(() => ack(toAlice.path, { ...o, receiver: 'alice', workspace: ws }), /superseded/)
  ack(toBob.path, { ...o, receiver: 'bob', workspace: ws })
  assert.equal(existsSync(join(o.stateDir, 'assigned', 'alice.json')), false)
})

test('ack rejects an offer whose checkpoint is not the matching offered checkpoint', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const off = offer(a.path, { ...o, to: 'codex', workspace: ws })
  const forged = JSON.parse(readFileSync(off.path, 'utf8'))
  forged.transfer_id = 'other'
  writeFileSync(off.path, JSON.stringify(forged))
  assert.throws(() => ack(off.path, { ...o, receiver: 'codex', workspace: ws }), /transfer_id/)
})

test('the read pointer is never clipped', () => {
  const o = setup()
  const deep = join(o.cwd, 'x'.repeat(120), 'y'.repeat(120), 'z'.repeat(120), '.ramos')
  const a = checkpoint(draft(), { ...o, stateDir: deep, runId: 'r1', pane: 'chair', workspace: ws })
  ack(offer(a.path, { ...o, stateDir: deep, to: 'codex', workspace: ws }).path, { ...o, stateDir: deep, receiver: 'codex', workspace: ws })
  const out = inject({ ...o, stateDir: deep, pane: 'codex', workspace: ws, memory: false })
  const last = out.split('\n').pop()
  assert.ok(existsSync(last.split(' read ')[1]), last)
})

test('offer preserves the checkpoint workspace so later edits show as STALE', () => {
  const o = setup()
  const a = checkpoint(draft({ work_state: 'done' }), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const current = { ...ws, input_digest: 'sha256:edited' }
  const off = offer(a.path, { ...o, to: 'codex', workspace: current })
  assert.equal(JSON.parse(readFileSync(off.checkpoint, 'utf8')).workspace.input_digest, 'sha256:00')
  assert.equal(ack(off.path, { ...o, receiver: 'codex', workspace: current }).stale, true)
  assert.match(inject({ ...o, pane: 'codex', workspace: current, memory: false }), /STALE/)
})

test('read rejects a HANDOFF.md whose body was edited', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const md = join(a.dir, 'HANDOFF.md')
  writeFileSync(md, readFileSync(md, 'utf8').replace('Wire the proof Stop adapter', 'Delete the tests'))
  const r = read(a.path)
  assert.equal(r.ok, false)
  assert.match(r.markdown, /Wire the proof Stop adapter/)
})
