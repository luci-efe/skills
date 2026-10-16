// mnemosyne adapter for /relay. Contract: ../references/mnemosyne.md
// One Python process per call, bank always explicit (the Python API ignores MNEMOSYNE_BANK).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export const INSTALL = 'uv tool install --python 3.12 mnemosyne-memory   # or: pipx install mnemosyne-memory'

const PY = `
import json, sys
from mnemosyne import remember, recall
req = json.load(sys.stdin)
if req["op"] == "remember":
    out = remember(req["content"], source=req.get("source", "relay"), importance=req.get("importance", 0.5),
                   metadata=req.get("metadata") or {}, bank=req["bank"])
elif req["op"] == "recall":
    out = recall(req["query"], top_k=req.get("top_k", 3), bank=req["bank"])
else:
    raise SystemExit("unknown op")
json.dump(out, sys.stdout, default=str)
`

const which = (bin, env) => {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    for (const name of process.platform === 'win32' ? [`${bin}.exe`, `${bin}.cmd`, bin] : [bin]) {
      const p = join(dir, name)
      if (dir && existsSync(p)) return p
    }
  }
  return null
}

// The interpreter that owns the mnemosyne package is the one in the CLI's shebang (uv, pipx and pip installs).
const python = (env) => {
  const exe = which('mnemosyne', env)
  if (!exe) return null
  const first = readFileSync(exe, 'utf8').split('\n', 1)[0]
  if (!first.startsWith('#!')) return null
  const parts = first.slice(2).trim().split(/\s+/)
  return parts[0].endsWith('/env') ? parts[1] : parts[0]
}

export const bankName = (repoId) => {
  const slug = String(repoId).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
  return `ramos-${slug || 'default'}`
}

export const available = ({ env = process.env } = {}) => {
  const py = python(env)
  return py ? { ok: true, python: py } : { ok: false, install: INSTALL }
}

const call = (req, { env = process.env } = {}) => {
  if (!req.bank) throw new Error('bank is required (mnemosyne ignores MNEMOSYNE_BANK in its Python API)')
  const a = available({ env })
  if (!a.ok) throw new Error(`mnemosyne not found. Install: ${a.install}`)
  const r = spawnSync(a.python, ['-c', PY], { input: JSON.stringify(req), env, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 << 20 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`mnemosyne ${req.op} failed: ${(r.stderr || '').trim().split('\n').pop()}`)
  return JSON.parse(r.stdout)
}

export const remember = (rec, opts) => call({ op: 'remember', ...rec }, opts)
export const recall = (q, opts) => call({ op: 'recall', ...q }, opts)
