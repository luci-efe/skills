import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  parseGitNexusStatus,
  parsePorcelainPaths,
  status,
  query,
} from '../skills/cartographer/scripts/cartographer.mjs'

const fixturesDir = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, 'fixtures/cartographer')
const freshTxt = readFileSync(join(fixturesDir, 'status-fresh.txt'), 'utf8')
const staleTxt = readFileSync(join(fixturesDir, 'status-stale.txt'), 'utf8')
const unindexedTxt = readFileSync(join(fixturesDir, 'status-unindexed.txt'), 'utf8')
const sampleQueryJson = readFileSync(join(fixturesDir, 'query-result.json'), 'utf8')

const makeRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cartographer-repo-'))
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd, stdio: 'ignore' })
  mkdirSync(join(cwd, 'app/green_iteso/campaigns'), { recursive: true })
  mkdirSync(join(cwd, 'app/green_iteso/actions'), { recursive: true })
  writeFileSync(
    join(cwd, 'app/green_iteso/campaigns/services.py'),
    '# line 1\ndef revert_action_log_from_missions(log_id):\n    return log_id\n',
  )
  writeFileSync(
    join(cwd, 'app/green_iteso/actions/selectors.py'),
    'def list_active_actions():\n    return []\n',
  )
  execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd, stdio: 'ignore' })
  return cwd
}

const makeFakeBin = (scripts) => {
  const binDir = mkdtempSync(join(tmpdir(), 'cartographer-bin-'))
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(binDir, name)
    writeFileSync(p, `#!${process.execPath}\n${body}\n`)
    chmodSync(p, 0o755)
  }
  return binDir
}

test('parseGitNexusStatus parses fresh, stale, and unindexed CLI output fixtures', () => {
  const fresh = parseGitNexusStatus(freshTxt)
  assert.equal(fresh.gitnexus, 'fresh')
  assert.equal(fresh.indexed, 'ce7ce15')
  assert.equal(fresh.current, 'ce7ce15')

  const stale = parseGitNexusStatus(staleTxt)
  assert.equal(stale.gitnexus, 'stale')
  assert.equal(stale.indexed, 'ce7ce15')
  assert.equal(stale.current, '1bc2d72')

  const unindexed = parseGitNexusStatus(unindexedTxt)
  assert.equal(unindexed.gitnexus, 'unindexed')
  assert.equal(unindexed.indexed, null)
  assert.equal(unindexed.current, null)
})

test('parsePorcelainPaths extracts modified, untracked, and renamed paths', () => {
  const raw = [
    ' M app/green_iteso/campaigns/services.py',
    '?? app/new_file.py',
    'R  old/path.py -> app/green_iteso/actions/selectors.py',
  ].join('\n')
  assert.deepEqual(parsePorcelainPaths(raw), [
    'app/green_iteso/campaigns/services.py',
    'app/new_file.py',
    'app/green_iteso/actions/selectors.py',
  ])
})

test('status reports absent when gitnexus is not on PATH and lists dirty_files', async () => {
  const cwd = makeRepo()
  writeFileSync(join(cwd, 'app/green_iteso/campaigns/services.py'), '# dirty\ndef revert_action_log_from_missions():\n    pass\n')
  const emptyBin = makeFakeBin({})
  const st = await status({ cwd, env: { ...process.env, PATH: `/usr/bin:/bin:${emptyBin}` } })
  assert.equal(st.gitnexus, 'absent')
  assert.equal(st.indexed, null)
  assert.ok(st.current)
  assert.deepEqual(st.dirty_files, ['app/green_iteso/campaigns/services.py'])
})

test('query returns clean GitNexus JSON without stale_overlay when index is fresh and files are clean', async () => {
  const cwd = makeRepo()
  const binDir = makeFakeBin({
    gitnexus: `
      const args = process.argv.slice(2);
      if (args[0] === 'status') {
        process.stdout.write(${JSON.stringify(freshTxt)});
      } else if (args[0] === 'query') {
        process.stdout.write(${JSON.stringify(sampleQueryJson)});
      } else {
        process.exit(2);
      }
    `,
  })
  const res = await query('revert_action_log_from_missions', {
    cwd,
    env: { ...process.env, PATH: `${binDir}:/opt/homebrew/bin:/usr/bin:/bin` },
  })
  assert.equal(res.mode, 'gitnexus')
  assert.equal(res.stale_overlay, false)
  assert.equal(res.processes.length, 1)
  assert.equal(res.process_symbols[0].name, 'revert_action_log_from_missions')
})

test('query triggers stale_overlay and live symbol verification when GitNexus index is stale', async () => {
  const cwd = makeRepo()
  const binDir = makeFakeBin({
    gitnexus: `
      const args = process.argv.slice(2);
      if (args[0] === 'status') {
        process.stdout.write(${JSON.stringify(staleTxt)});
      } else if (args[0] === 'query') {
        process.stdout.write(${JSON.stringify(sampleQueryJson)});
      } else {
        process.exit(2);
      }
    `,
  })
  const res = await query('revert_action_log_from_missions', {
    cwd,
    env: { ...process.env, PATH: `${binDir}:/opt/homebrew/bin:/usr/bin:/bin` },
  })
  assert.equal(res.stale_overlay, true)
  assert.equal(res.indexed, 'ce7ce15')
  assert.equal(res.current, '1bc2d72')
  assert.ok(Array.isArray(res.verified_symbols))
  const sym = res.verified_symbols.find((s) => s.name === 'revert_action_log_from_missions')
  assert.ok(sym, 'expected live verification of revert_action_log_from_missions')
  assert.equal(sym.verified, true)
  assert.equal(sym.live_line, 2)
})

test('query triggers stale_overlay when index is fresh but a dirty file intersects result paths', async () => {
  const cwd = makeRepo()
  // Modify services.py so revert_action_log_from_missions moves to line 4
  writeFileSync(
    join(cwd, 'app/green_iteso/campaigns/services.py'),
    '# line 1\n# line 2\n# line 3\ndef revert_action_log_from_missions(log_id):\n    return log_id\n',
  )
  const binDir = makeFakeBin({
    gitnexus: `
      const args = process.argv.slice(2);
      if (args[0] === 'status') {
        process.stdout.write(${JSON.stringify(freshTxt)});
      } else if (args[0] === 'query') {
        process.stdout.write(${JSON.stringify(sampleQueryJson)});
      } else {
        process.exit(2);
      }
    `,
  })
  const res = await query('revert_action_log_from_missions', {
    cwd,
    env: { ...process.env, PATH: `${binDir}:/opt/homebrew/bin:/usr/bin:/bin` },
  })
  assert.equal(res.stale_overlay, true)
  assert.deepEqual(res.intersecting_dirty_files, ['app/green_iteso/campaigns/services.py'])
  const sym = res.verified_symbols.find((s) => s.name === 'revert_action_log_from_missions')
  assert.equal(sym.verified, true)
  assert.equal(sym.live_line, 4)
})

test('query falls back to baseline rg + ast-grep when gitnexus is absent and never runs mutating gitnexus commands', async () => {
  const cwd = makeRepo()
  const binDir = makeFakeBin({
    rg: `
      process.stdout.write('app/green_iteso/campaigns/services.py:2:def revert_action_log_from_missions(log_id):\\n');
    `,
    'ast-grep': `
      const args = process.argv.slice(2);
      if (args[0] === 'run' && args.includes('--json')) {
        process.stdout.write(JSON.stringify([
          {
            file: 'app/green_iteso/campaigns/services.py',
            range: { start: { line: 1, column: 0 }, end: { line: 2, column: 17 } },
            text: 'def revert_action_log_from_missions(log_id):'
          }
        ]));
      }
    `,
  })
  const res = await query('revert_action_log_from_missions', {
    cwd,
    pattern: 'def $FUNC($$$)',
    env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin` },
  })
  assert.equal(res.mode, 'baseline')
  assert.equal(res.gitnexus, 'absent')
  assert.ok(res.rg_matches.some((m) => m.file === 'app/green_iteso/campaigns/services.py' && m.line === 2))
  assert.equal(res.ast_matches.length, 1)
  assert.equal(res.ast_matches[0].file, 'app/green_iteso/campaigns/services.py')
})
