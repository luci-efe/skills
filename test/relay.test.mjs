import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validate, checkpoint, offer, ack, inject, sync } from '../skills/relay/scripts/relay.mjs'
import { available } from '../skills/relay/scripts/memory.mjs'

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

test('validate enforces caps and required fields', () => {
  assert.deepEqual(validate({ ...draft(), schema_version: 1, run_id: 'r', pane: 'p', sequence: 1, created_at: 'now', parent_checkpoint: null, workspace: ws, ownership: { owner: 'p', intended_receiver: null, transfer_id: null, phase: 'working' }, memory_refs: [] }), [])
  const errs = validate({ ...draft({ next_actions: [1, 2, 3, 4].map((i) => ({ owner: 'x', action: `a${i}`, artifact: 'y' })), work_state: 'finished' }) })
  assert.ok(errs.some((e) => e.includes('next_actions')))
  assert.ok(errs.some((e) => e.includes('work_state')))
  assert.ok(errs.some((e) => e.includes('run_id')))
  assert.ok(validate({ ...draft({ task: { ...draft().task, objective: 'x'.repeat(241) } }) }).some((e) => e.includes('240')))
})

test('checkpoint writes an immutable JSON plus generated HANDOFF.md and chains sequence', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const cp = JSON.parse(readFileSync(a.path, 'utf8'))
  assert.equal(cp.sequence, 1)
  assert.equal(cp.parent_checkpoint, null)
  const md = readFileSync(join(a.dir, 'HANDOFF.md'), 'utf8')
  assert.match(md, /generated from handoff\.json/i)
  assert.match(md, new RegExp(a.sha256))
  assert.match(md, /Wire the proof Stop adapter/)
  const b = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  assert.equal(JSON.parse(readFileSync(b.path, 'utf8')).sequence, 2)
  assert.equal(JSON.parse(readFileSync(b.path, 'utf8')).parent_checkpoint.sha256, a.sha256)
  assert.ok(Buffer.byteLength(readFileSync(a.path)) <= 8192)
})

test('checkpoint refuses invalid drafts and never writes partial files', () => {
  const o = setup()
  assert.throws(() => checkpoint(draft({ work_state: 'nope' }), { ...o, runId: 'r1', pane: 'chair', workspace: ws }), /work_state/)
  assert.equal(existsSync(join(o.stateDir, 'runs', 'r1', 'chair', 'checkpoints', '1')), false)
})

test('offer and ack transfer ownership exactly once and detect tampering', () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const off = offer(a.path, { ...o, to: 'codex' })
  const k = ack(off.path, { ...o, receiver: 'codex', workspace: ws })
  assert.equal(k.stale, false)
  assert.throws(() => ack(off.path, { ...o, receiver: 'argon', workspace: ws }), /already acknowledged/)
  const o2 = setup()
  const c = checkpoint(draft(), { ...o2, runId: 'r2', pane: 'chair', workspace: ws })
  const off2 = offer(c.path, { ...o2, to: 'codex' })
  assert.throws(() => ack(off2.path, { ...o2, receiver: 'argon', workspace: ws }), /intended for codex/)
  writeFileSync(c.path, readFileSync(c.path, 'utf8').replace('Wire', 'Tamper'))
  assert.throws(() => ack(off2.path, { ...o2, receiver: 'codex', workspace: ws }), /digest mismatch/)
})

test('inject is bounded, flags STALE when HEAD moved, and is silent without an assignment', () => {
  const o = setup()
  assert.equal(inject({ ...o, workspace: ws, memory: false }), '')
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  ack(offer(a.path, { ...o, to: 'codex' }).path, { ...o, receiver: 'codex', workspace: ws })
  const fresh = inject({ ...o, workspace: ws, memory: false })
  assert.match(fresh, /Wire the proof Stop adapter/)
  assert.doesNotMatch(fresh, /STALE/)
  const moved = inject({ ...o, workspace: { ...ws, head: 'def456' }, memory: false })
  assert.match(moved, /STALE/)
  assert.ok(Buffer.byteLength(moved) <= 1600)
})

test('sync stores accepted decisions once per checkpoint digest', { skip: !available().ok && 'mnemosyne not installed' }, () => {
  const o = setup()
  const a = checkpoint(draft(), { ...o, runId: 'r1', pane: 'chair', workspace: ws })
  const first = sync(a.path, { ...o })
  assert.equal(first.stored, 1)
  assert.equal(sync(a.path, { ...o }).stored, 0)
  assert.ok(existsSync(join(a.dir, 'memory-sync.json')))
  ack(offer(a.path, { ...o, to: 'codex' }).path, { ...o, receiver: 'codex', workspace: ws })
  assert.match(inject({ ...o, workspace: ws, memory: true }), /Never spawn a session inside Stop/)
})
