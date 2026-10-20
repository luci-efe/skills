#!/usr/bin/env node
// /relay: bounded, immutable handoff checkpoints (docs/CONTRACTS.md §5) + mnemosyne memory sync.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { stateDirectory } from './_lib/config.mjs'
import { bankName, recall, remember } from './memory.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATES = ['active', 'done', 'blocked', 'failed', 'cancelled']
const PHASES = ['working', 'offered']
const DECISION_STATUS = ['accepted', 'proposed', 'rejected']
const CAPS = { decisions: 5, next_actions: 3, blockers: 3, unknowns: 3, evidence: 6, memory_refs: 5 }
const DRAFT_KEYS = ['task', 'work_state', 'decisions', 'next_actions', 'blockers', 'unknowns', 'evidence', 'memory_refs']
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const MAX_BYTES = 8192
const INJECT_BYTES = 1600

const sha = (s) => createHash('sha256').update(s).digest('hex')
const posix = (p) => p.split(sep).join('/')
const stateDirOf = (o) => o.stateDir ?? stateDirectory(o.cwd ?? process.cwd())
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const name = (kind, v) => { if (typeof v !== 'string' || !NAME.test(v)) throw new Error(`invalid ${kind} ${JSON.stringify(v)}: use letters, digits, - and _`); return v }

// exclusive: hard-link the temp file into place, which fails atomically if the target exists.
const writeFile = (path, data, { exclusive = true } = {}) => {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, data)
  try {
    if (exclusive) linkSync(tmp, path); else renameSync(tmp, path)
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error(`refusing to overwrite ${path}`)
    throw e
  } finally {
    if (exclusive) try { unlinkSync(tmp) } catch {}
  }
}

const str = (e, path, v, { optional = false } = {}) => {
  if (v == null) { if (!optional) e.push(`${path} is required`); return }
  if (typeof v !== 'string') e.push(`${path} must be a string`)
}
const arr = (e, path, v, item) => {
  if (v == null) return
  if (!Array.isArray(v)) { e.push(`${path} must be an array`); return }
  if (CAPS[path] && v.length > CAPS[path]) e.push(`${path} exceeds ${CAPS[path]} items`)
  v.forEach((x, i) => item?.(x, `${path}[${i}]`))
}
const obj = (e, path, v, fn) => { if (!v || typeof v !== 'object' || Array.isArray(v)) e.push(`${path} must be an object`); else fn(v) }

export const validate = (cp) => {
  const e = []
  if (cp.schema_version !== 1) e.push('schema_version must be 1')
  str(e, 'run_id', cp.run_id); str(e, 'pane', cp.pane); str(e, 'created_at', cp.created_at)
  if (!Number.isInteger(cp.sequence) || cp.sequence < 1) e.push('sequence must be a positive integer')
  if (!STATES.includes(cp.work_state)) e.push(`work_state must be one of ${STATES.join('|')}`)
  obj(e, 'task', cp.task, (t) => { str(e, 'task.objective', t.objective); str(e, 'task.scope', t.scope); arr(e, 'task.constraints', t.constraints); arr(e, 'task.acceptance_refs', t.acceptance_refs) })
  obj(e, 'workspace', cp.workspace, (w) => { str(e, 'workspace.repo_id', w.repo_id); str(e, 'workspace.input_digest', w.input_digest); str(e, 'workspace.head', w.head, { optional: true }); str(e, 'workspace.branch', w.branch, { optional: true }) })
  obj(e, 'ownership', cp.ownership, (w) => {
    str(e, 'ownership.owner', w.owner)
    if (!PHASES.includes(w.phase)) e.push(`ownership.phase must be one of ${PHASES.join('|')}`)
    if (w.phase === 'offered' && (!w.intended_receiver || !w.transfer_id)) e.push('offered ownership needs intended_receiver and transfer_id')
  })
  arr(e, 'decisions', cp.decisions, (d, p) => obj(e, p, d, () => { for (const k of ['id', 'summary', 'source_ref']) str(e, `${p}.${k}`, d[k]); if (!DECISION_STATUS.includes(d.status)) e.push(`${p}.status must be one of ${DECISION_STATUS.join('|')}`) }))
  arr(e, 'next_actions', cp.next_actions, (a, p) => obj(e, p, a, () => { for (const k of ['owner', 'action', 'artifact']) str(e, `${p}.${k}`, a[k]) }))
  arr(e, 'blockers', cp.blockers, (x, p) => str(e, p, x))
  arr(e, 'unknowns', cp.unknowns, (x, p) => str(e, p, x))
  arr(e, 'evidence', cp.evidence, (v, p) => obj(e, p, v, () => { for (const k of ['kind', 'path', 'outcome']) str(e, `${p}.${k}`, v[k]) }))
  arr(e, 'memory_refs', cp.memory_refs, (x, p) => str(e, p, x))
  const walk = (v, path) => {
    if (typeof v === 'string' && v.length > 240) e.push(`${path} exceeds 240 chars`)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
  }
  walk(cp, '$')
  if (Buffer.byteLength(JSON.stringify(cp, null, 2)) > MAX_BYTES) e.push(`checkpoint exceeds ${MAX_BYTES} bytes; move detail behind evidence pointers`)
  return e
}

const isStale = (w, cp) => (w ? w.head !== cp.workspace.head || w.input_digest !== cp.workspace.input_digest : null)
const lane = (o, runId, pane) => join(stateDirOf(o), 'runs', name('run id', runId), name('pane', pane), 'checkpoints')
const latestIn = (dir) => Math.max(0, ...seqsIn(dir).filter((n) => existsSync(join(dir, String(n), 'handoff.json'))))
const seqsIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => /^\d+$/.test(n)).map(Number) : [])

export const workspaceOf = async (o) => {
  const { inputDigest } = await import('./_lib/digest.mjs')
  const d = await inputDigest(o.cwd ?? process.cwd())
  let branch = null
  try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: o.cwd ?? process.cwd(), encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null } catch {}
  return { repo_id: o.repoId ?? 'local', branch, head: d.head, input_digest: d.input_digest }
}

export const render = (cp, digest) => {
  const list = (xs, f) => (xs?.length ? xs.map((x) => `- ${f(x)}`).join('\n') : '- none')
  return `<!-- Generated from handoff.json (sha256 ${digest}). Do not edit; publish a new checkpoint instead. -->
# Handoff: ${cp.run_id} / ${cp.pane} #${cp.sequence}

**State:** ${cp.work_state} · **Owner:** ${cp.ownership.owner} · **Phase:** ${cp.ownership.phase} · **Receiver:** ${cp.ownership.intended_receiver ?? 'none'}
**Workspace:** ${cp.workspace.repo_id} @ ${cp.workspace.head ?? 'no-git'} (${cp.workspace.input_digest})

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

// Writes the next checkpoint in a lane. The sequence is claimed with mkdir, so concurrent writers never collide.
const publish = (body, o, ownership) => {
  const dir0 = lane(o, o.runId, o.pane)
  mkdirSync(dir0, { recursive: true })
  for (let attempt = 0; attempt < 1000; attempt++) {
    const seq = Math.max(0, ...seqsIn(dir0)) + 1
    const dir = join(dir0, String(seq))
    try { mkdirSync(dir) } catch (e) { if (e.code === 'EEXIST') continue; throw e }
    const parentSeq = seqsIn(dir0).filter((n) => n < seq && existsSync(join(dir0, String(n), 'handoff.json'))).sort((a, b) => b - a)[0]
    const parentPath = parentSeq ? join(dir0, String(parentSeq), 'handoff.json') : null
    const cp = {
      schema_version: 1, run_id: o.runId, pane: o.pane, sequence: seq, created_at: new Date().toISOString(),
      parent_checkpoint: parentPath ? { path: posix(relative(stateDirOf(o), parentPath)), sha256: sha(readFileSync(parentPath)) } : null,
      memory_refs: [], ...body, workspace: o.workspace,
      ownership: ownership ?? { owner: o.pane, intended_receiver: null, transfer_id: null, phase: 'working' },
    }
    const errs = validate(cp)
    if (errs.length) throw new Error(`invalid checkpoint: ${errs.join('; ')}`)
    const text = `${JSON.stringify(cp, null, 2)}\n`
    const digest = sha(text)
    writeFile(join(dir, 'HANDOFF.md'), render(cp, digest))
    writeFile(join(dir, 'handoff.json'), text)
    return { path: join(dir, 'handoff.json'), dir, sha256: digest, sequence: seq }
  }
  throw new Error('could not claim a checkpoint sequence')
}

export const checkpoint = (draftIn, o) => {
  name('run id', o.runId); name('pane', o.pane)
  if (!o.workspace) throw new Error('workspace is required (the CLI computes it)')
  const extra = Object.keys(draftIn ?? {}).filter((k) => !DRAFT_KEYS.includes(k))
  if (extra.length) throw new Error(`not allowed in a draft: ${extra.join(', ')} (system fields are set by relay)`)
  const pre = validate({ schema_version: 1, run_id: o.runId, pane: o.pane, sequence: 1, created_at: 'x', workspace: o.workspace, ownership: { owner: o.pane, phase: 'working' }, ...draftIn })
  if (pre.length) throw new Error(`invalid checkpoint: ${pre.join('; ')}`)
  return publish(draftIn, o)
}

const assign = (o, receiver, checkpoint, transfer_id) =>
  writeFile(join(stateDirOf(o), 'assigned', `${receiver}.json`), `${JSON.stringify({ receiver, checkpoint, transfer_id }, null, 2)}\n`, { exclusive: false })

export const offer = (cpPath, o) => {
  name('receiver', o.to)
  const cp = readJson(cpPath)
  if (cp.sequence !== latestIn(dirname(dirname(resolve(cpPath))))) throw new Error(`checkpoint #${cp.sequence} is not the latest checkpoint in its lane; offer the latest one`)
  // Never displace live work: refuse before anything is written.
  if (cp.ownership?.phase === 'offered' && existsSync(join(dirname(resolve(cpPath)), 'ack.json'))) throw new Error(`checkpoint #${cp.sequence} was already acknowledged by ${cp.ownership.intended_receiver}; it cannot be offered again`)
  const assignedPath = join(stateDirOf(o), 'assigned', `${o.to}.json`)
  if (existsSync(assignedPath)) {
    const cur = readJson(assignedPath)
    const curDir = dirname(resolve(stateDirOf(o), cur.checkpoint))
    const acked = existsSync(join(curDir, 'ack.json'))
    if (acked || dirname(curDir) !== dirname(dirname(resolve(cpPath)))) throw new Error(`pane ${o.to} already has a ${acked ? 'live (acknowledged)' : 'pending'} assignment (${cur.checkpoint}); finish it or delete ${posix(relative(stateDirOf(o), assignedPath))} to release it`)
  }
  const transfer_id = randomUUID()
  const body = Object.fromEntries(DRAFT_KEYS.filter((k) => k in cp).map((k) => [k, cp[k]]))
  const offered = publish(body, { ...o, runId: cp.run_id, pane: cp.pane, workspace: cp.workspace }, { owner: cp.pane, intended_receiver: o.to, transfer_id, phase: 'offered' })
  const path = join(offered.dir, 'offer.json')
  writeFile(path, `${JSON.stringify({ transfer_id, checkpoint: posix(relative(stateDirOf(o), offered.path)), checkpoint_sha256: offered.sha256, to: o.to, at: new Date().toISOString() }, null, 2)}\n`)
  // Assign at offer time so the receiver's inject works before ack; a superseded offer's assignment is withdrawn.
  const prev = cp.ownership?.phase === 'offered' ? cp.ownership.intended_receiver : null
  if (prev && prev !== o.to) try { if (readJson(join(stateDirOf(o), 'assigned', `${prev}.json`)).transfer_id === cp.ownership.transfer_id) unlinkSync(join(stateDirOf(o), 'assigned', `${prev}.json`)) } catch {}
  assign(o, o.to, posix(relative(stateDirOf(o), offered.path)), transfer_id)
  return { path, transfer_id, checkpoint: offered.path }
}

export const ack = (offerPath, o) => {
  name('receiver', o.receiver)
  const off = readJson(offerPath)
  const cpPath = resolve(stateDirOf(o), off.checkpoint)
  if (off.to !== o.receiver) throw new Error(`transfer is intended for ${off.to}, not ${o.receiver}`)
  if (sha(readFileSync(cpPath)) !== off.checkpoint_sha256) throw new Error('checkpoint digest mismatch: the offered checkpoint changed after the offer')
  const cp = readJson(cpPath)
  const own = cp.ownership ?? {}
  if (own.phase !== 'offered' || own.transfer_id !== off.transfer_id || own.intended_receiver !== off.to) throw new Error('offer does not match its checkpoint (phase, transfer_id or receiver differ)')
  if (cp.sequence !== latestIn(dirname(dirname(cpPath)))) throw new Error(`offer ${off.transfer_id} was superseded by a newer checkpoint in this lane`)
  const stale = isStale(o.workspace, cp)
  const ackPath = join(dirname(offerPath), 'ack.json')
  const record = { transfer_id: off.transfer_id, checkpoint_sha256: off.checkpoint_sha256, receiver: o.receiver, stale, stale_reason: o.workspace ? null : (o.workspaceError ?? 'workspace unavailable'), at: new Date().toISOString() }
  try { writeFile(ackPath, `${JSON.stringify(record, null, 2)}\n`) } catch (e) {
    if (/refusing to overwrite/.test(e.message)) throw new Error(`transfer ${off.transfer_id} already acknowledged by ${readJson(ackPath).receiver}`)
    throw e
  }
  assign(o, o.receiver, off.checkpoint, off.transfer_id)
  return { path: ackPath, stale, ...(stale ? { warning: 'STALE: workspace changed since checkpoint; verify git status/log against the checkpoint before acting' } : {}) }
}

const clip = (s, bytes) => {
  const b = Buffer.from(s)
  if (b.length <= bytes) return s
  return `${b.subarray(0, Math.max(0, bytes - 3)).toString('utf8').replace(/�$/, '')}...`
}

export const inject = (o) => {
  const dir = join(stateDirOf(o), 'assigned')
  if (!o.pane) {
    const panes = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []
    return panes.length ? `[relay] ${panes.length} handoff(s) assigned: ${panes.join(', ')}. Run relay.mjs inject --pane <your-pane>.` : ''
  }
  const assignedPath = join(dir, `${name('pane', o.pane)}.json`)
  if (!existsSync(assignedPath)) return ''
  const assigned = readJson(assignedPath)
  const cpPath = resolve(stateDirOf(o), assigned.checkpoint)
  let cp
  try { cp = readJson(cpPath) } catch (e) { return `[relay] cannot read assigned checkpoint ${assigned.checkpoint}: ${e.message.slice(0, 120)}` }
  const staleness = !o.workspace ? ' (staleness unknown: workspace unavailable)'
    : o.workspace.head !== cp.workspace.head || o.workspace.input_digest !== cp.workspace.input_digest ? ' STALE: workspace changed since checkpoint, verify before acting' : ''
  const readLine = `read: node ${posix(relative(o.cwd ?? process.cwd(), HERE)) || '.'}/relay.mjs read ${posix(cpPath)}`
  const header = `[relay] ${cp.run_id}/${cp.pane}#${cp.sequence} state=${cp.work_state}${staleness}`
  const next = cp.next_actions?.[0] ? `next: ${cp.next_actions[0].owner}: ${cp.next_actions[0].action}` : 'next: none recorded'
  const memory = []
  if (o.memory) {
    try {
      const seen = new Set()
      for (const q of [cp.task.objective, ...(cp.decisions ?? []).filter((d) => d.status === 'accepted').map((d) => d.summary)].slice(0, 4)) {
        for (const h of recall({ bank: bankName(cp.workspace.repo_id), query: q, top_k: 3 }, { env: o.env })) if (!seen.has(h.id) && seen.size < 3) { seen.add(h.id); memory.push(`memory: ${h.content}`) }
        if (seen.size >= 3) break
      }
    } catch (err) {
      memory.push(`memory: unavailable (${err.message.slice(0, 80)})`)
    }
  }
  const fixed = [clip(header, 400), clip(next, 400), readLine]
  const used = fixed.reduce((n, l) => n + Buffer.byteLength(l) + 1, 0)
  const objective = clip(`objective: ${cp.task.objective}`, Math.max(40, INJECT_BYTES - used - 1))
  const lines = [fixed[0], objective, fixed[1]]
  let total = lines.concat(fixed[2]).join('\n')
  for (const m of memory) {
    const candidate = [...lines, clip(m, 300), fixed[2]].join('\n')
    if (Buffer.byteLength(candidate) > INJECT_BYTES) break
    lines.push(clip(m, 300)); total = candidate
  }
  return total
}

export const read = (cpPath, o = {}) => {
  const body = readFileSync(cpPath)
  const md = readFileSync(join(dirname(cpPath), 'HANDOFF.md'), 'utf8')
  const expected = render(JSON.parse(body), sha(body))
  return { ok: md === expected, markdown: expected, stale: isStale(o.workspace, JSON.parse(body)) }
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
      metadata: { repo_id: cp.workspace.repo_id, run_id: cp.run_id, kind: d.status === 'rejected' ? 'rejected' : 'decision', decision_id: d.id, source_ref: d.source_ref, source_digest: digest, status: d.status },
    }, { env: o.env }))
  }
  writeFile(receiptPath, `${JSON.stringify({ checkpoint_sha256: digest, bank, ids, at: new Date().toISOString() }, null, 2)}\n`, { exclusive: false })
  return { stored: ids.length, receipt: receiptPath }
}

// CLI
const USAGE = `usage: relay.mjs <command>
  checkpoint --from <draft.json> --run <id> --pane <name> [--repo-id <owner/repo>]
  offer <handoff.json> --to <pane>
  ack <offer.json> --receiver <pane>
  sync <handoff.json>
  inject [--pane <name>] [--no-memory]        (pane defaults to $RAMOS_PANE)
  read <handoff.json>`

const parse = (argv) => {
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { pos.push(a); continue }
    const [k, v] = a.slice(2).split(/=(.*)/s)
    if (v !== undefined) flags[k] = v
    else if (k.startsWith('no-')) flags[k] = true
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`--${k} requires a value`)
    else flags[k] = argv[++i]
  }
  return { flags, pos }
}

const need = (v, what) => { if (!v) throw new Error(`missing ${what}`); return v }

const main = async (argv) => {
  const [cmd, ...rest] = argv
  const { flags, pos } = parse(rest)
  const o = { cwd: process.cwd() }
  const ws = async () => { try { return { workspace: await workspaceOf({ ...o, repoId: flags['repo-id'] }) } } catch (e) { return { workspace: null, workspaceError: e.message } } }
  switch (cmd) {
    case 'checkpoint': {
      const w = await ws(); if (!w.workspace) throw new Error(`cannot compute workspace: ${w.workspaceError}`)
      console.log(JSON.stringify(checkpoint(readJson(need(flags.from, '--from <draft.json>')), { ...o, runId: need(flags.run, '--run'), pane: need(flags.pane, '--pane'), ...w }))); break
    }
    case 'offer': console.log(JSON.stringify(offer(need(pos[0], '<handoff.json>'), { ...o, to: need(flags.to, '--to'), ...(await ws()) }))); break
    case 'ack': {
      const r = ack(need(pos[0], '<offer.json>'), { ...o, receiver: need(flags.receiver, '--receiver'), ...(await ws()) })
      console.log(JSON.stringify(r)); if (r.stale) console.error(`relay: ${r.warning}`); break
    }
    case 'sync': console.log(JSON.stringify(sync(need(pos[0], '<handoff.json>'), o))); break
    case 'inject': { const out = inject({ ...o, pane: flags.pane ?? process.env.RAMOS_PANE, memory: !flags['no-memory'], ...(await ws()) }); if (out) console.log(out); break }
    case 'read': { const r = read(need(pos[0], '<handoff.json>'), await ws()); if (r.stale) console.log('STALE: workspace changed since checkpoint, verify before acting\n'); process.stdout.write(r.markdown); if (!r.ok) { console.error('relay: HANDOFF.md does not match handoff.json digest; trust handoff.json'); process.exitCode = 2 } break }
    case undefined: case '--help': case '-h': case 'help': console.log(USAGE); break
    default: throw new Error(`unknown command ${JSON.stringify(cmd)}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2)).catch((e) => { console.error(`relay: ${e.message} (see --help)`); process.exitCode = 2 })
