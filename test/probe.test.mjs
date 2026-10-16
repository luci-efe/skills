import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import providers, { installCommand } from '../lib/providers.mjs';
import { probe } from '../lib/probe.mjs';

const fixture = (code) => ({ fixture: { bin: process.execPath, probe: [process.execPath, '-e', code], install: { any: 'install fixture' } } });

test('missing binary and unknown provider fail without executing installation', async () => {
  const catalog = { missing: { bin: 'skills-suite-nonexistent-binary', probe: ['skills-suite-nonexistent-binary', '--version'], install: { any: 'install missing' } } };
  const rows = await probe(['missing', 'unknown'], { catalog });
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].missing_install, 'install missing');
  assert.equal(rows[1].ok, false);
});

test('argv values remain literal and stdout identifies a successful probe', async () => {
  const catalog = fixture('console.log(process.argv[1])');
  catalog.fixture.probe.push('$(echo injected); literal');
  const [row] = await probe(['fixture'], { catalog });
  assert.equal(row.ok, true);
  assert.equal(row.version, '$(echo injected); literal');
  assert.equal(row.missing_install, null);
});

test('timeout forcibly terminates a process ignoring SIGTERM', async () => {
  const before = Date.now();
  const [row] = await probe(['fixture'], { timeoutMs: 100, catalog: fixture("process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)") });
  assert.equal(row.ok, false);
  assert.match(row.diagnostic, /timeout/);
  assert.ok(Date.now() - before < 3000);
});

test('output overflow is bounded and fails closed', async () => {
  const [row] = await probe(['fixture'], { maxOutput: 128, catalog: fixture("process.stdout.write('a'.repeat(100000))") });
  assert.equal(row.ok, false);
  assert.equal(row.version, null);
  assert.match(row.diagnostic, /output/);
});

test('nonzero exits fail and probes are not cached', async () => {
  const catalog = fixture('process.exit(2)');
  assert.equal((await probe(['fixture'], { catalog }))[0].ok, false);
  catalog.fixture.probe = [process.execPath, '-e', 'console.log("v2")'];
  assert.equal((await probe(['fixture'], { catalog }))[0].version, 'v2');
});

test('help-only probes do not pretend help text is a version', async () => {
  const catalog = fixture('console.log("help")');
  catalog.fixture.version = false;
  assert.equal((await probe(['fixture'], { catalog }))[0].version, null);
});

test('reject malformed argv and invalid bounds', async () => {
  assert.equal((await probe(['bad'], { catalog: { bad: { probe: 'echo unsafe' } } }))[0].ok, false);
  await assert.rejects(probe(['node'], { timeoutMs: 0 }), /timeoutMs/);
  await assert.rejects(probe(['node'], { maxOutput: -1 }), /maxOutput/);
});

test('local binary is resolved from cwd and never fetched by npx', { skip: process.platform === 'win32' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skills-probe-'));
  await mkdir(join(cwd, 'node_modules', '.bin'), { recursive: true });
  const file = join(cwd, 'node_modules', '.bin', 'playwright');
  await writeFile(file, '#!/usr/bin/env node\nconsole.log("Version local-test");\n');
  await chmod(file, 0o755);
  assert.equal((await probe(['playwright'], { cwd }))[0].version, 'Version local-test');
});

test('catalog covers required IDs and unknown recipes remain explicit', () => {
  for (const id of ['git','node','jq','rg','ast-grep','gitnexus','herdr','claude','codex','agy','gemini','opencode','mnemosyne','osv-scanner','semgrep','gh','playwright','odiff','cua-driver']) {
    assert.ok(providers[id], id);
    assert.ok(Array.isArray(providers[id].probe), id);
    assert.equal(typeof providers[id].verified, 'boolean');
  }
  assert.equal(providers['ast-grep'].bin, 'sg');
  assert.equal(installCommand('mnemosyne'), null);
  assert.equal(installCommand('unknown'), null);
  assert.equal(installCommand('codex', 'win32'), 'npm install -g @openai/codex');
});


test('ast-grep identity check rejects an unrelated sg executable', async () => {
  const catalog = fixture('console.log("sg unrelated tool")');
  catalog.fixture.outputIncludes = 'ast-grep';
  const [row] = await probe(['fixture'], { catalog });
  assert.equal(row.ok, false);
  assert.equal(row.diagnostic, 'unexpected binary identity');
});
