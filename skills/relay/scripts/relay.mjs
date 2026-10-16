#!/usr/bin/env node
// /relay: bounded, immutable handoff checkpoints (docs/CONTRACTS.md §5) + mnemosyne memory sync.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bankName, recall, remember } from './memory.mjs'

const STATES = ['active', 'done', 'blocked', 'failed', 'cancelled']
const CAPS = { decisions: 5, next_actions: 3, blockers: 3, unknowns: 3, evidence: 6, memory_refs: 5 }
const MAX_BYTES = 8192
const INJECT_BYTES = 1600

const sha = (s) => createHash('sha256').update(s).digest('hex')
const stateDirOf = (o) => o.stateDir ?? join(o.cwd ?? process.cwd(), process.env.RAMOS_STATE_DIR ?? '.ramos')
const atomicWrite = (path, data, { exclusive = true } = {}) => {
  if (exclusive && existsSync(path)) throw new Error(`refusing to overwrite ${path}`)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

export const validate = (cp) => {
  const e = []
  for (const k of ['schema_version', 'run_id', 'pane', 'sequence', 'created_at', 'task', 'workspace', 'ownership', 'work_state']) if (cp[k] == null) e.push(`missing ${k}`)
  if (cp.work_state != null && !STATES.includes(cp.work_state)) e.push(`work_state must be one of ${STATES.join('|')}`)
  for (const [k, n] of Object.entries(CAPS)) if ((cp[k] ?? []).length > n) e.push(`${k} exceeds ${n} items`)
  const walk = (v, path) => {
    if (typeof v === 'string' && v.length > 240) e.push(`${path} exceeds 240 chars`)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
  }
  walk(cp, '$')
  if (Buffer.byteLength(JSON.stringify(cp, null, 2)) > MAX_BYTES) e.push(`checkpoint exceeds ${MAX_BYTES} bytes; move detail behind evidence pointers`)
  return e
}

const lane = (o, runId, pane) => join(stateDirOf(o), 'runs', runId, pane, 'checkpoints')

const workspaceOf = async (o) => {
  if (o.workspace) return o.workspace
  const { inputDigest } = await import('./_lib/digest.mjs')
  const d = await inputDigest(o.cwd ?? process.cwd())
  return { repo_id: o.repoId ?? 'local', branch: d.branch ?? null, head: d.head, input_digest: d.input_digest }
}

export const render = (cp, digest) => {
  const list = (xs, f) => (xs?.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- none')
  return `<!-- Generated from handoff.json (sha256 ${digest}). Do not edit; publish a new checkpoint instead. -->
# Handoff: ${cp.run_id} / ${cp.pane} #${cp.sequence}

**State:** ${cp.work_state} · **Owner:** ${cp.ownership.owner} · **Receiver:** ${cp.ownership.intended_receiver ?? 'none'}
**Workspace:** ${cp.workspace.repo_id} @ ${cp.workspace.branch ?? '?'} ${cp.workspace.head ?? 'no-git'} (${cp.workspace.input_digest})

## Objective
${cp.task.objective}

Scope: ${cp.task.scope}

## Constraints
${list(cp.task.constraints, (x) => x)}

## Decisions
${list(cp.decisions, (d) => `${d.id} [${d.status}] ${d.summary} (${d.source_ref})`)}

## Next actions
${list(cp.next_actions, (a) => `${a.owner}: ${a.action} → ${a.artifact}`)}

## Blockers
${list(cp.blockers, (x) => x)}

## Unknowns
${list(cp.unknowns, (x) => x)}

## Evidence
${list(cp.evidence, (v) => `${v.kind}: ${v.path} (${v.outcome})`)}
`
}

export const checkpoint = (draftIn, o) => {
  if (!o.runId || !o.pane) throw new Error('runId and pane are required')
  if (!o.workspace) throw new Error('workspace is required (use the CLI to compute it)')
  const dir0 = lane(o, o.runId, o.pane)
  const seqs = existsSync(dir0) ? readdirSync(dir0).map(Number).filter(Number.isInteger) : []
  const seq = seqs.length ? Math.max(...seqs) + 1 : 1
  const prevPath = seq > 1 ? join(dir0, String(seq - 1), 'handoff.json') : null
  const cp = {
    schema_version: 1, run_id: o.runId, pane: o.pane, sequence: seq, created_at: new Date().toISOString(),
    parent_checkpoint: prevPath ? { path: relative(stateDirOf(o), prevPath), sha256: sha(readFileSync(prevPath)) } : null,
    ownership: { owner: o.pane, intended_receiver: null, transfer_id: null, phase: 'working' },
    memory_refs: [], ...draftIn, workspace: o.workspace,
  }
  const errs = validate(cp)
  if (errs.length) throw new Error(`invalid checkpoint: ${errs.join('; ')}`)
  const dir = join(dir0, String(seq))
  const body = `${JSON.stringify(cp, null, 2)}\n`
  const digest = sha(body)
  atomicWrite(join(dir, 'handoff.json'), body)
  atomicWrite(join(dir, 'HANDOFF.md'), render(cp, digest))
  return { path: join(dir, 'handoff.json'), dir, sha256: digest, sequence: seq }
}

export const offer = (cpPath, o) => {
  if (!o.to) throw new Error('offer needs --to <receiver pane>')
  const transfer_id = randomUUID()
  const path = join(dirname(cpPath), 'offer.json')
  atomicWrite(path, `${JSON.stringify({ transfer_id, checkpoint: resolve(cpPath), checkpoint_sha256: sha(readFileSync(cpPath)), to: o.to, at: new Date().toISOString() }, null, 2)}\n`)
  return { path, transfer_id }
}

export const ack = (offerPath, o) => {
  const off = readJson(offerPath)
  const ackPath = join(dirname(offerPath), 'ack.json')
  if (existsSync(ackPath)) throw new Error(`transfer ${off.transfer_id} already acknowledged by ${readJson(ackPath).receiver}`)
  if (off.to !== o.receiver) throw new Error(`transfer is intended for ${off.to}, not ${o.receiver}`)
  if (sha(readFileSync(off.checkpoint)) !== off.checkpoint_sha256) throw new Error('checkpoint digest mismatch: the offered checkpoint changed after the offer')
  const cp = readJson(off.checkpoint)
  const stale = Boolean(o.workspace && (o.workspace.head !== cp.workspace.head || o.workspace.input_digest !== cp.workspace.input_digest))
  atomicWrite(ackPath, `${JSON.stringify({ transfer_id: off.transfer_id, checkpoint_sha256: off.checkpoint_sha256, receiver: o.receiver, stale, at: new Date().toISOString() }, null, 2)}\n`)
  atomicWrite(join(stateDirOf(o), 'assigned.json'), `${JSON.stringify({ receiver: o.receiver, checkpoint: off.checkpoint, transfer_id: off.transfer_id }, null, 2)}\n`, { exclusive: false })
  return { path: ackPath, stale }
}

export const inject = (o) => {
  const assignedPath = join(stateDirOf(o), 'assigned.json')
  if (!existsSync(assignedPath)) return ''
  const cp = readJson(readJson(assignedPath).checkpoint)
  const stale = o.workspace && (o.workspace.head !== cp.workspace.head || o.workspace.input_digest !== cp.workspace.input_digest)
  const lines = [
    `[relay] ${cp.run_id}/${cp.pane}#${cp.sequence} state=${cp.work_state}${stale ? ' STALE: workspace changed since checkpoint, verify before acting' : ''}`,
    `objective: ${cp.task.objective}`,
    cp.next_actions?.[0] ? `next: ${cp.next_actions[0].owner}: ${cp.next_actions[0].action}` : 'next: none recorded',
  ]
  if (o.memory) {
    try {
      const hits = recall({ bank: bankName(cp.workspace.repo_id), query: cp.task.objective, top_k: 3 }, { env: o.env })
      for (const h of hits) lines.push(`memory: ${h.content}`)
      if (!hits.length) {
        for (const d of (cp.decisions ?? []).filter((x) => x.status === 'accepted').slice(0, 3)) {
          const r = recall({ bank: bankName(cp.workspace.repo_id), query: d.summary, top_k: 1 }, { env: o.env })
          if (r[0]) lines.push(`memory: ${r[0].content}`)
        }
      }
    } catch (err) {
      lines.push(`memory: unavailable (${err.message.slice(0, 80)})`)
    }
  }
  lines.push(`read: node ${relative(process.cwd(), import.meta.dirname ?? '.')}/relay.mjs read ${readJson(assignedPath).checkpoint}`)
  let out = lines.join('\n')
  while (Buffer.byteLength(out) > INJECT_BYTES && lines.length > 3) { lines.splice(lines.length - 2, 1); out = lines.join('\n') }
  return Buffer.byteLength(out) > INJECT_BYTES ? out.slice(0, INJECT_BYTES - 1) : out
}

export const sync = (cpPath, o) => {
  const receiptPath = join(dirname(cpPath), 'memory-sync.json')
  const digest = sha(readFileSync(cpPath))
  if (existsSync(receiptPath) && readJson(receiptPath).checkpoint_sha256 === digest) return { stored: 0, receipt: receiptPath }
  const cp = readJson(cpPath)
  const bank = bankName(cp.workspace.repo_id)
  const ids = []
  for (const d of (cp.decisions ?? []).filter((x) => x.status === 'accepted' || x.status === 'rejected')) {
    ids.push(remember({
      bank, content: d.status === 'rejected' ? `Rejected: ${d.summary}` : d.summary,
      source: `relay:${cp.run_id}:${d.status === 'rejected' ? 'rejected' : 'decision'}`, importance: 0.8,
      metadata: { repo_id: cp.workspace.repo_id, run_id: cp.run_id, kind: d.status, source_ref: d.source_ref, source_digest: digest, decision_id: d.id },
    }, { env: o.env }))
  }
  atomicWrite(receiptPath, `${JSON.stringify({ checkpoint_sha256: digest, bank, ids, at: new Date().toISOString() }, null, 2)}\n`, { exclusive: false })
  return { stored: ids.length, receipt: receiptPath }
}

// CLI
const usage = `relay.mjs <command>
  checkpoint --from draft.json --run <id> --pane <name> [--repo-id <id>]   write checkpoint + HANDOFF.md
  offer <handoff.json> --to <pane>                                         offer ownership
  ack <offer.json> --receiver <pane>                                       accept ownership (exactly once)
  sync <handoff.json>                                                      store decisions in mnemosyne
  inject [--no-memory]                                                     SessionStart summary (<=1600 bytes)
  read <handoff.json>                                                      print generated HANDOFF.md`

const main = async (argv) => {
  const [cmd, ...rest] = argv
  const flag = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined }
  const pos = rest.find((x, i) => !x.startsWith('--') && !(rest[i - 1] ?? '').startsWith('--'))
  const o = { cwd: process.cwd() }
  switch (cmd) {
    case 'checkpoint': { const r = checkpoint(readJson(flag('from')), { ...o, runId: flag('run'), pane: flag('pane'), workspace: await workspaceOf({ ...o, repoId: flag('repo-id') }) }); console.log(JSON.stringify(r)); break }
    case 'offer': console.log(JSON.stringify(offer(pos, { ...o, to: flag('to') }))); break
    case 'ack': console.log(JSON.stringify(ack(pos, { ...o, receiver: flag('receiver'), workspace: await workspaceOf(o).catch(() => null) }))); break
    case 'sync': console.log(JSON.stringify(sync(pos, o))); break
    case 'inject': { const out = inject({ ...o, memory: !rest.includes('--no-memory'), workspace: await workspaceOf(o).catch(() => null) }); if (out) console.log(out); break }
    case 'read': process.stdout.write(readFileSync(join(dirname(pos), 'HANDOFF.md'), 'utf8')); break
    default: console.log(usage); process.exitCode = cmd ? 2 : 0
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).catch((e) => { console.error(`relay: ${e.message}`); process.exitCode = 2 })
