import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inputDigest } from '../lib/digest.mjs';
import { parseFrontmatter, discoverSkills, validateMetadata } from '../lib/skills.mjs';
import { writeResult, validateResult, setActiveRun } from '../lib/result.mjs';
import { route, nudge } from '../lib/router.mjs';
import { stop } from '../lib/claude.mjs';
import { STATE_DIR } from '../lib/config.mjs';

const temp = () => mkdtemp(join(tmpdir(), 'ramos-test-'));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
const metadata = { schema_version: 1, stage: 'prove', rule_ids: ['03'], branches: [{id:'assertion',entrypoint:'SKILL.md',requires:[],artifact_schema:null}] };
async function skill(root, name='proof', meta=metadata) {
  const dir=join(root,name); await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'SKILL.md'),`---\nname: ${name}\ndescription: Use when verifying behavior.\n---\nIf ready → verify.\n`);
  if(meta) await writeFile(join(dir,'skill.json'),JSON.stringify(meta));
  return dir;
}
async function evidence(cwd) {
  await mkdir(join(cwd,STATE_DIR,'runs','run1','checks'),{recursive:true});
  await writeFile(join(cwd,STATE_DIR,'runs','run1','checks','unit.log'),'ok');
  return {schema_version:1,run_id:'run1',skill:'proof',branch:'assertion',status:'passed',source:await inputDigest(cwd),checks:[{id:'unit',argv:[process.execPath,'--version'],cwd:'.',exit:0,started_at:'2026-01-01T00:00:00Z',ended_at:'2026-01-01T00:00:01Z',log:'checks/unit.log'}],required_checks:['unit'],artifacts:[],reason:null};
}

test('non-git digest changes with content and deletion, excludes runtime output', async()=>{
  const cwd=await temp(); await writeFile(join(cwd,'file'),'first'); const a=await inputDigest(cwd);
  assert.equal(a.head,null); await mkdir(join(cwd,STATE_DIR),{recursive:true}); await writeFile(join(cwd,STATE_DIR,'noise'),'x');
  assert.deepEqual(await inputDigest(cwd),a); await writeFile(join(cwd,'file'),'second'); assert.notEqual((await inputDigest(cwd)).input_digest,a.input_digest);
});
test('git digest includes staged, unstaged, untracked, and excludes ignored files',async()=>{
  const cwd=await temp(); git(cwd,'init'); git(cwd,'config','user.email','test@example.com'); git(cwd,'config','user.name','Test');
  await writeFile(join(cwd,'tracked'),'one'); await writeFile(join(cwd,'.gitignore'),'ignored\n'); git(cwd,'add','.');git(cwd,'commit','-m','fixture');
  const clean=await inputDigest(cwd);assert.equal(clean.dirty,false);
  await writeFile(join(cwd,'ignored'),'x');assert.deepEqual(await inputDigest(cwd),clean);
  await writeFile(join(cwd,'tracked'),'two');const dirty=await inputDigest(cwd);assert.equal(dirty.dirty,true);assert.notEqual(dirty.input_digest,clean.input_digest);
  git(cwd,'add','tracked');assert.deepEqual(await inputDigest(cwd),dirty);
  await writeFile(join(cwd,'new'),'three');assert.notEqual((await inputDigest(cwd)).input_digest,dirty.input_digest);
});
test('frontmatter supports BOM, CRLF, scalar, quotes and folded descriptions; rejects duplicate/extra keys',()=>{
  assert.deepEqual(parseFrontmatter('\uFEFF---\r\nname: proof\r\ndescription: >\r\n  Use when checking\r\n  a result.\r\n---\r\nbody'),{name:'proof',description:'Use when checking a result.'});
  assert.equal(parseFrontmatter('---\nname: \'proof\'\ndescription: "Use when: checking # outcomes"\n---\n').description,'Use when: checking # outcomes');
  assert.throws(()=>parseFrontmatter('---\nname: x\nname: y\ndescription: Use when x\n---'),/duplicate/i);
  assert.throws(()=>parseFrontmatter('---\nname: x\ndescription: Use when x\nrequires: git\n---'),/keys/i);
  assert.throws(()=>parseFrontmatter('---\nname: x\ndescription: [bad]\n---'));
});
test('discovery detects new/deleted metadata and undeclared third-party dependencies',async()=>{
  const cwd=await temp(), root=join(cwd,'skills');const dir=await skill(root);let found=await discoverSkills({cwd,roots:[root]});assert.equal(found.length,1);assert.equal(found[0].dependency_status,'declared');
  await skill(root,'third-party',null); found=await discoverSkills({cwd,roots:[root]});assert.equal(found.length,2);assert.equal(found.find(s=>s.name==='third-party').dependency_status,'undeclared');
  await writeFile(join(dir,'skill.json'),JSON.stringify({...metadata,stage:'build'}));found=await discoverSkills({cwd,roots:[root]});assert.equal(found.find(s=>s.name==='proof').metadata.stage,'build');
  assert.throws(()=>validateMetadata({...metadata,branches:[{...metadata.branches[0],entrypoint:'../escape'}]}));
});
test('router limits candidates, probes selection, and nudge stays advisory and one line',async()=>{
  const cwd=await temp(),root=join(cwd,'skills');await skill(root);await skill(root,'reproduce',{...metadata,stage:'build',rule_ids:['01']});
  const skills=await discoverSkills({cwd,roots:[root]});let called=false;
  const receipt=await route('verify the tests',{cwd,skills,probeFn:async ids=>{called=true;return [];}});assert.equal(called,true);assert.equal(receipt.selected.name,'proof');assert.equal(receipt.status,'ready');assert.ok(receipt.candidates.length<=3);
  const blocked=await route('/proof',{cwd,skills,probeFn:async()=>[{id:'node',ok:false,missing_install:'install node'}]});assert.equal(blocked.status,'blocked');
  assert.match(nudge('verify tests',skills),/^compass: consider \/proof/);assert.equal(nudge('hello there',skills),'');assert.equal(nudge('verify\ntests',skills).split('\n').length,1);
});
test('result validation rejects stale, empty checks and failed required checks',async()=>{
  const cwd=await temp();await writeFile(join(cwd,'source'),'one');const result=await evidence(cwd);await writeResult(cwd,result);assert.equal((await validateResult(cwd,result)).ok,true);
  assert.equal((await validateResult(cwd,{...result,required_checks:[]})).ok,false);
  assert.equal((await validateResult(cwd,{...result,checks:[{...result.checks[0],exit:1}]})).ok,false);
  await writeFile(join(cwd,'source'),'two');assert.match((await validateResult(cwd,result)).reason,/stale/i);
});
test('Stop allows passed, blocked-with-reason and repeat guard, denies stale; isolates sessions',async()=>{
  const cwd=await temp();await writeFile(join(cwd,'source'),'one');const result=await evidence(cwd);await writeResult(cwd,result);await setActiveRun(cwd,'s1',{run_id:'run1',claimed_done:true});
  assert.deepEqual(await stop({cwd,session_id:'s1'}),{});await writeFile(join(cwd,'source'),'two');assert.equal((await stop({cwd,session_id:'s1'})).decision,'block');
  assert.deepEqual(await stop({cwd,session_id:'other'}),{});assert.deepEqual(await stop({cwd,session_id:'s1',stop_hook_active:true}),{});
  await writeResult(cwd,{...result,status:'blocked',reason:'Database unavailable'});assert.deepEqual(await stop({cwd,session_id:'s1'}),{});
  await writeResult(cwd,{...result,status:'blocked',reason:null});assert.equal((await stop({cwd,session_id:'s1'})).decision,'block');
});
test('digest distinguishes deletion from literal sentinel text and tracks unborn repositories',async()=>{
  const cwd=await temp();git(cwd,'init');git(cwd,'config','user.email','test@example.com');git(cwd,'config','user.name','Test');
  await writeFile(join(cwd,'tracked'),'initial');git(cwd,'add','.');assert.equal((await inputDigest(cwd)).head,null);git(cwd,'commit','-m','fixture');
  await writeFile(join(cwd,'tracked'),'deleted');const before=await inputDigest(cwd);const {unlink}=await import('node:fs/promises');await unlink(join(cwd,'tracked'));assert.notEqual((await inputDigest(cwd)).input_digest,before.input_digest);
});
test('discovery rejects path traversal and marks malformed sidecars invalid',async()=>{
  const cwd=await temp(),root=join(cwd,'skills');const dir=await skill(root);await writeFile(join(dir,'skill.json'),JSON.stringify({...metadata,branches:[{...metadata.branches[0],entrypoint:'../outside.md'}]}));
  const found=await discoverSkills({cwd,roots:[root]});assert.equal(found[0].dependency_status,'invalid');
});
test('concurrent session registry writes preserve both runs',async()=>{
  const cwd=await temp();await Promise.all([setActiveRun(cwd,'a',{run_id:'one',claimed_done:true}),setActiveRun(cwd,'b',{run_id:'two',claimed_done:false})]);
  const active=JSON.parse(await readFile(join(cwd,STATE_DIR,'active.json'),'utf8'));assert.equal(active.sessions.a.run_id,'one');assert.equal(active.sessions.b.run_id,'two');
});
test('SessionStart warns about stale discovery without requiring relay',async()=>{
  const {handleHook}=await import('../lib/hook-adapter.mjs');
  const cwd=await temp(),root=join(cwd,'skills');const dir=await skill(root);await discoverSkills({cwd,roots:[root]});
  await writeFile(join(dir,'SKILL.md'),'---\nname: proof\ndescription: Use when newly changed.\n---\n');
  const out=await handleHook('SessionStart',{cwd,session_id:'test'},{roots:[root]});assert.match(out.hookSpecificOutput.additionalContext,/doctor:.*stale/i);
});
