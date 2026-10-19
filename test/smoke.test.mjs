import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseFrontmatter } from '../lib/skills.mjs';
import { providers } from '../lib/providers.mjs';
import { candidates } from '../lib/router.mjs';

const root = fileURLToPath(new URL('../skills/', import.meta.url));
const names = (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name);
const load = async name => {
  const dir = resolve(root, name);
  const text = await readFile(resolve(dir, 'SKILL.md'), 'utf8');
  const meta = JSON.parse(await readFile(resolve(dir, 'skill.json'), 'utf8'));
  const refs = await readdir(resolve(dir, 'references')).catch(() => []);
  const all = text + (await Promise.all(refs.map(r => readFile(resolve(dir, 'references', r), 'utf8')))).join('\n');
  return { name, text, all, meta, ...parseFrontmatter(text) };
};
const skills = await Promise.all(names.map(load));

test('every skill documents each binary its sidecar requires, and each is a known provider', () => {
  for (const s of skills) {
    for (const b of s.meta.branches) {
      for (const id of b.requires) {
        assert.ok(Object.hasOwn(providers, id), `${s.name}: unknown provider ${id}`);
        if (['node', 'git'].includes(id)) continue;
        assert.ok(s.all.includes(id), `${s.name}: SKILL.md/references never mentions required ${id}`);
      }
    }
  }
});

test('every skill has a docs page', async () => {
  for (const s of skills) await readFile(new URL(`../docs/${s.name}.md`, import.meta.url), 'utf8');
});

// [prompt, expected skill]: guards the routing synonyms found while dogfooding.
const routes = [
  ['check dependencies for CVE advisories', 'red-team'],
  ['prove it works before I ship', 'proof'],
  ['it used to work, now the build is broken', 'reproduce'],
  ['missing binary after install', 'doctor'],
  ['hand off this session, context window is full', 'relay'],
  ['trace the architecture of this codebase', 'cartographer'],
  ['clarify requirements and trade-offs before coding', 'crucible'],
  ['get a second opinion with independent review', 'council'],
];
test('compass routes representative prompts to the intended skill', () => {
  const stub = skills.map(s => ({ ...s, path: s.name, metadata: s.meta }));
  for (const [prompt, want] of routes) {
    const got = candidates(prompt, stub).map(c => c.name);
    assert.ok(got.includes(want), `"${prompt}" -> ${got.join(',') || 'none'}, wanted ${want}`);
  }
});

test('compass prefers an explicit verify request over a failure symptom and ignores incidental words', () => {
  const stub = skills.map(s => ({ ...s, path: s.name, metadata: s.meta }));
  assert.equal(candidates('verify the fix works, one test fails', stub)[0]?.name, 'proof');
  assert.equal(candidates('the nightly build fails', stub)[0]?.name, 'reproduce');
  for (const prompt of ['when done, commit', 'how it works', 'fail-safe design', 'it will fail eventually']) {
    const got = candidates(prompt, stub).map(c => c.name);
    assert.ok(!got.includes('proof') && !got.includes('reproduce'), `"${prompt}" -> ${got.join(',')}`);
  }
  assert.deepEqual(candidates('when done, commit', stub), []);
  assert.deepEqual(candidates('how it works', stub), []);
});

test('red-team scan step creates its output directory', async () => {
  const text = skills.find(s => s.name === 'red-team').text;
  assert.match(text, /mkdir -p [^\n]*red-team[^\n]*osv-scanner scan/);
});
