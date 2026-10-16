// mnemosyne adapter for /relay. Contract: ../references/mnemosyne.md
// One Python process per call, bank always explicit (the Python API ignores MNEMOSYNE_BANK).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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

const imports = (py, env) => spawnSync(py, ['-c', 'import mnemosyne'], { env, timeout: 15_000, stdio: 'ignore' }).status === 0

// The interpreter that owns the mnemosyne package. Order: explicit override, the CLI's shebang
// (uv, pipx and pip on POSIX), then python3/python/py on PATH (Windows .exe launchers, sh wrappers).
const python = (env) => {
  if (env.RAMOS_MNEMOSYNE_PYTHON) return imports(env.RAMOS_MNEMOSYNE_PYTHON, env) ? env.RAMOS_MNEMOSYNE_PYTHON : null
  const exe = which('mnemosyne', env)
  if (!exe) return null
  try {
    const first = readFileSync(exe, 'utf8').slice(0, 512).split('\n', 1)[0]
    if (first.startsWith('#!')) {
      const parts = first.slice(2).trim().split(/\s+/)
      const py = parts[0].endsWith('/env') ? parts[1] : parts[0]
      if (/python/i.test(py) && imports(py, env)) return py
    }
  } catch {}
  const win = process.platform === 'win32'
  const venvPy = (root) => join(root, win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python')
  const candidates = []
  try {
    const uvDir = spawnSync('uv', ['tool', 'dir'], { env, encoding: 'utf8', timeout: 10_000 })
    if (uvDir.status === 0) candidates.push(venvPy(join(uvDir.stdout.trim(), 'mnemosyne-memory')))
  } catch {}
  const home = env.HOME ?? env.USERPROFILE ?? ''
  candidates.push(venvPy(join(env.PIPX_HOME ?? join(home, '.local', 'pipx'), 'venvs', 'mnemosyne-memory')))
  for (const py of candidates) if (existsSync(py) && imports(py, env)) return py
  for (const py of ['python3', 'python', 'py']) if (which(py, env) && imports(py, env)) return py
  return null
}

export const bankName = (repoId) => {
  // Readable prefix + digest of the full id: lossy slugs alone collide (acme/a-b vs acme-a/b).
  const id = String(repoId)
  const slug = id.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  return `ramos-${slug || 'repo'}-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`
}

export const available = ({ env = process.env } = {}) => {
  const py = python(env)
  return py ? { ok: true, python: py } : { ok: false, install: INSTALL }
}

const call = (req, { env = process.env } = {}) => {
  if (!req.bank) throw new Error('bank is required (mnemosyne ignores MNEMOSYNE_BANK in its Python API)')
  const a = available({ env })
  if (!a.ok) throw new Error(`mnemosyne not found (or its Python interpreter could not be located; set RAMOS_MNEMOSYNE_PYTHON). Install: ${a.install}`)
  const r = spawnSync(a.python, ['-c', PY], { input: JSON.stringify(req), env, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 << 20 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`mnemosyne ${req.op} failed: ${(r.stderr || '').trim().split('\n').pop()}`)
  return JSON.parse(r.stdout)
}

export const remember = (rec, opts) => call({ op: 'remember', ...rec }, opts)
export const recall = (q, opts) => call({ op: 'recall', ...q }, opts)
