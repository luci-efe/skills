#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const findBinaryOnPath = (bin, pathEnv = '') => {
  const dirs = String(pathEnv).split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir, bin)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // continue scanning PATH
    }
  }
  return null
}

const stripAnsi = (str) => String(str ?? '').replace(/\x1b\[[0-9;]*m/g, '')

export const parseGitNexusStatus = (raw) => {
  const text = stripAnsi(raw)
  if (
    /Repository not indexed/i.test(text) ||
    /stale KuzuDB index/i.test(text) ||
    /Not a git repository/i.test(text)
  ) {
    return { gitnexus: 'unindexed', indexed: null, current: null }
  }

  const indexedMatch = text.match(/Indexed commit:\s*([0-9a-f]+)/i)
  const currentMatch = text.match(/Current commit:\s*([0-9a-f]+)/i)
  const indexed = indexedMatch ? indexedMatch[1] : null
  const current = currentMatch ? currentMatch[1] : null

  if (/Status:\s*[^\n]*stale/i.test(text) || (indexed && current && indexed !== current)) {
    return { gitnexus: 'stale', indexed, current }
  }

  if (/Status:\s*[^\n]*up-to-date/i.test(text) || (indexed && current && indexed === current)) {
    return { gitnexus: 'fresh', indexed, current }
  }

  return { gitnexus: 'unindexed', indexed: null, current: null }
}

export const parsePorcelainPaths = (raw) => {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const paths = []
  for (const line of lines) {
    const body = line.length > 3 ? line.slice(3).trim() : line.trim()
    if (!body) continue
    const arrowIdx = body.indexOf(' -> ')
    const relPath = arrowIdx >= 0 ? body.slice(arrowIdx + 4).trim() : body
    const unquoted = relPath.replace(/^"(.*)"$/, '$1')
    if (unquoted && !paths.includes(unquoted)) {
      paths.push(unquoted)
    }
  }
  return paths
}

const getGitHeadShort = (cwd, env) => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null
  } catch {
    return null
  }
}

const getDirtyFiles = (cwd, env) => {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return parsePorcelainPaths(out)
  } catch {
    return []
  }
}

export const status = async ({ cwd = process.cwd(), env = process.env } = {}) => {
  const dirty_files = getDirtyFiles(cwd, env)
  const headShort = getGitHeadShort(cwd, env)
  const gitnexusBin = findBinaryOnPath('gitnexus', env.PATH)

  if (!gitnexusBin) {
    return {
      gitnexus: 'absent',
      indexed: null,
      current: headShort,
      dirty_files,
    }
  }

  try {
    const out = execFileSync(gitnexusBin, ['status'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const parsed = parseGitNexusStatus(out)
    return {
      gitnexus: parsed.gitnexus,
      indexed: parsed.indexed,
      current: parsed.current ?? headShort,
      dirty_files,
    }
  } catch (err) {
    const combined = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}`
    const parsed = parseGitNexusStatus(combined)
    return {
      gitnexus: parsed.gitnexus,
      indexed: parsed.indexed,
      current: parsed.current ?? headShort,
      dirty_files,
    }
  }
}

const verifySymbolLive = (cwd, filePath, symbolName) => {
  const absPath = join(cwd, filePath)
  if (!existsSync(absPath)) {
    return { verified: false, live_line: null }
  }
  try {
    const content = readFileSync(absPath, 'utf8')
    const lines = content.split(/\r?\n/)
    const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const defRegex = new RegExp(`(?:def|class|function|const|let|var|type|interface|func)\\s+${escaped}\\b`)
    for (let i = 0; i < lines.length; i++) {
      if (defRegex.test(lines[i])) {
        return { verified: true, live_line: i + 1 }
      }
    }
    const wordRegex = new RegExp(`\\b${escaped}\\b`)
    for (let i = 0; i < lines.length; i++) {
      if (wordRegex.test(lines[i])) {
        return { verified: true, live_line: i + 1 }
      }
    }
  } catch {
    // ignore read errors
  }
  return { verified: false, live_line: null }
}

const runRipgrepBaseline = (concept, cwd, env) => {
  const rgBin = findBinaryOnPath('rg', env.PATH)
  if (!rgBin) return []
  try {
    const out = execFileSync(
      rgBin,
      ['-n', '--no-heading', '--color', 'never', '--', concept, '.'],
      {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    const matches = []
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue
      const match = line.match(/^([^:]+):(\d+):(.*)$/)
      if (!match) continue
      const file = match[1].replace(/^\.\//, '')
      matches.push({
        file,
        line: Number(match[2]),
        text: match[3].trim(),
      })
    }
    return matches
  } catch {
    return []
  }
}

const runAstGrepBaseline = (pattern, lang, cwd, env) => {
  const astGrepBin = findBinaryOnPath('ast-grep', env.PATH)
  if (!astGrepBin || !pattern) return []
  const args = ['run', '-p', pattern, '--json']
  if (lang) {
    args.push('-l', lang)
  }
  try {
    const out = execFileSync(astGrepBin, args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const parsed = JSON.parse(out || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => ({
      file: String(item.file ?? '').replace(/^\.\//, ''),
      line: Number(item.range?.start?.line ?? 0) + 1,
      text: String(item.text ?? '').trim(),
    }))
  } catch {
    return []
  }
}

export const query = async (
  concept,
  { cwd = process.cwd(), env = process.env, repo, limit = 5, pattern, lang } = {},
) => {
  const st = await status({ cwd, env })

  if (st.gitnexus === 'fresh' || st.gitnexus === 'stale') {
    const gitnexusBin = findBinaryOnPath('gitnexus', env.PATH)
    const args = ['query', concept]
    if (repo) args.push('-r', String(repo))
    if (limit) args.push('-l', String(limit))

    try {
      const raw = execFileSync(gitnexusBin, args, {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const parsed = JSON.parse(raw)
      const processSymbols = Array.isArray(parsed.process_symbols) ? parsed.process_symbols : []
      const definitions = Array.isArray(parsed.definitions) ? parsed.definitions : []
      const allSymbols = [...processSymbols, ...definitions]

      const resultPaths = new Set(
        allSymbols.map((s) => s?.filePath).filter((p) => typeof p === 'string' && p.length > 0),
      )
      const intersecting_dirty_files = st.dirty_files.filter((f) => resultPaths.has(f))
      const stale_overlay = st.gitnexus !== 'fresh' || intersecting_dirty_files.length > 0

      if (!stale_overlay) {
        return {
          mode: 'gitnexus',
          gitnexus: st.gitnexus,
          stale_overlay: false,
          indexed: st.indexed,
          current: st.current,
          dirty_files: st.dirty_files,
          ...parsed,
        }
      }

      const seenSymbolKeys = new Set()
      const verified_symbols = []
      for (const sym of allSymbols) {
        if (!sym?.name || !sym?.filePath) continue
        if (typeof sym.id === 'string' && sym.id.startsWith('File:')) continue
        const key = `${sym.filePath}::${sym.name}`
        if (seenSymbolKeys.has(key)) continue
        seenSymbolKeys.add(key)

        const live = verifySymbolLive(cwd, sym.filePath, sym.name)
        verified_symbols.push({
          name: sym.name,
          filePath: sym.filePath,
          indexed_line: sym.startLine ?? null,
          verified: live.verified,
          live_line: live.live_line,
        })
      }

      return {
        mode: 'gitnexus',
        gitnexus: st.gitnexus,
        stale_overlay: true,
        indexed: st.indexed,
        current: st.current,
        dirty_files: st.dirty_files,
        intersecting_dirty_files,
        verified_symbols,
        ...parsed,
      }
    } catch {
      // Fall through to baseline if gitnexus query errors out
    }
  }

  const rg_matches = runRipgrepBaseline(concept, cwd, env)
  const ast_matches = runAstGrepBaseline(pattern ?? concept, lang, cwd, env)

  return {
    mode: 'baseline',
    gitnexus: st.gitnexus,
    stale_overlay: false,
    indexed: st.indexed,
    current: st.current,
    dirty_files: st.dirty_files,
    rg_matches,
    ast_matches,
  }
}

const parseCliArgs = (argv) => {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--repo' || arg === '-r') {
      flags.repo = argv[++i]
    } else if (arg === '--limit' || arg === '-l') {
      flags.limit = Number(argv[++i])
    } else if (arg === '--pattern' || arg === '-p') {
      flags.pattern = argv[++i]
    } else if (arg === '--lang') {
      flags.lang = argv[++i]
    } else if (arg === '--cwd') {
      flags.cwd = resolve(argv[++i])
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

const main = async () => {
  const { positional, flags } = parseCliArgs(process.argv.slice(2))
  const subcommand = positional[0] ?? 'status'
  const cwd = flags.cwd ?? process.cwd()

  if (subcommand === 'status') {
    const result = await status({ cwd })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (subcommand === 'query') {
    const concept = positional[1]
    if (!concept) {
      process.stderr.write('Usage: cartographer.mjs query "<concept>" [--repo <r>] [--limit <n>] [--pattern <p>] [--lang <l>]\n')
      process.exit(1)
    }
    const result = await query(concept, {
      cwd,
      repo: flags.repo,
      limit: flags.limit ?? 5,
      pattern: flags.pattern,
      lang: flags.lang,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  process.stderr.write(`Unknown subcommand: ${subcommand}. Expected "status" or "query".\n`)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
