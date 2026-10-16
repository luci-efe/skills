import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { STATE_DIR } from '../lib/config.mjs';
const repo=resolve(import.meta.dirname??new URL('.',import.meta.url).pathname,'..');
const temp=()=>mkdtemp(join(tmpdir(),'ramos-cli-'));
function cli(file,args=[],cwd=repo,options={}){return spawnSync(process.execPath,[join(repo,file),...args],{cwd,encoding:'utf8',...options});}
test('declared checks execute, write evidence and reject changed inputs',async()=>{
  const cwd=await temp();await writeFile(join(cwd,'source'),'one');await writeFile(join(cwd,'checks.json'),JSON.stringify({checks:[{id:'unit',argv:[process.execPath,'-e','console.log("verified")']}],required_checks:['unit']}));
  const run=cli('skills/proof/scripts/run.mjs',['checks.json','--run-id','one','--session','session'],cwd);assert.equal(run.status,0,run.stderr+run.stdout);
  const check=()=>cli('skills/proof/scripts/check.mjs',['one'],cwd);assert.equal(check().status,0);
  await writeFile(join(cwd,'source'),'two');assert.equal(check().status,2);
  const result=JSON.parse(await readFile(join(cwd,STATE_DIR,'runs/one/result.json'),'utf8'));assert.equal(result.checks[0].exit,0);assert.equal(result.status,'passed');
});
test('runner records failures and missing programs without claiming done',async()=>{
  for(const argv of [[process.execPath,'-e','process.exit(3)'],['ramos-nonexistent-command']]) {
    const cwd=await temp();await writeFile(join(cwd,'checks.json'),JSON.stringify({checks:[{id:'unit',argv}],required_checks:['unit']}));
    const run=cli('skills/proof/scripts/run.mjs',['checks.json','--run-id','failure'],cwd);assert.equal(run.status,2,run.stderr);
    const result=JSON.parse(await readFile(join(cwd,STATE_DIR,'runs/failure/result.json'),'utf8'));assert.notEqual(result.status,'passed');assert.ok(result.reason);
  }
});
test('doctor dry-run preserves settings; install is idempotent and keeps unrelated hooks',async()=>{
  const cwd=await temp();await mkdir(join(cwd,'.claude'));const path=join(cwd,'.claude/settings.local.json');const initial={permissions:{allow:['Read']},hooks:{Stop:[{hooks:[{type:'command',command:'echo existing'}]}]}};await writeFile(path,JSON.stringify(initial));
  const dry=cli('skills/doctor/scripts/doctor.mjs',['--install-hooks','claude','--dry-run'],cwd);assert.equal(dry.status,0,dry.stderr);assert.deepEqual(JSON.parse(await readFile(path)),initial);
  for(let i=0;i<2;i++){const r=cli('skills/doctor/scripts/doctor.mjs',['--install-hooks','claude'],cwd);assert.equal(r.status,0,r.stderr);}
  const installed=JSON.parse(await readFile(path));assert.deepEqual(installed.permissions,initial.permissions);assert.equal(installed.hooks.Stop.length,2);assert.equal(installed.hooks.UserPromptSubmit.length,1);
});
test('selective proof copy works without the source lib',async()=>{
  const cwd=await temp(), installed=join(cwd,'installed proof');await cp(join(repo,'skills/proof'),installed,{recursive:true});
  const r=spawnSync(process.execPath,[join(installed,'scripts/check.mjs'),'missing'],{cwd,encoding:'utf8'});assert.equal(r.status,2);assert.doesNotMatch(r.stderr,/ERR_MODULE_NOT_FOUND/);
});
test('vendor check and skill lint pass, drift is detected in a fixture',async()=>{
  const check=cli('scripts/vendor.mjs',['--check']);assert.equal(check.status,0,check.stderr);
  const lint=cli('scripts/lint-skills.mjs');assert.equal(lint.status,0,lint.stderr);
  const cwd=await temp();await cp(join(repo,'lib'),join(cwd,'lib'),{recursive:true});await cp(join(repo,'skills/proof'),join(cwd,'skills/proof'),{recursive:true});await mkdir(join(cwd,'scripts'));await cp(join(repo,'scripts/vendor.mjs'),join(cwd,'scripts/vendor.mjs'));
  await writeFile(join(cwd,'skills/proof/scripts/_lib/config.mjs'),'drift');
  const r=spawnSync(process.execPath,[join(cwd,'scripts/vendor.mjs'),'--check'],{cwd,encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/drift/i);
});
test('hook wrappers accept JSON stdin and do not block ordinary prompts',()=>{
  for(const file of ['stop','user-prompt-submit','session-start']){const r=cli(`hooks/claude/${file}.mjs`,[],repo,{input:JSON.stringify({cwd:repo,session_id:'unassigned',prompt:'hello'})});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout||'{}'),{});}
});
test('visual branch blocks missing local browser dependency before executing checks',async()=>{
  const cwd=await temp();await writeFile(join(cwd,'checks.json'),JSON.stringify({checks:[{id:'journey',argv:[process.execPath,'-e','require("node:fs").writeFileSync("executed","bad")']}],required_checks:['journey']}));
  const r=cli('skills/proof/scripts/run.mjs',['checks.json','--run-id','visual','--branch','visual-web'],cwd);assert.equal(r.status,2);
  await assert.rejects(readFile(join(cwd,'executed')), {code:'ENOENT'});
  const result=JSON.parse(await readFile(join(cwd,STATE_DIR,'runs/visual/result.json'),'utf8'));assert.match(result.reason,/playwright/i);
});
test('runner rejects inputs changed during successful check and refuses run reuse',async()=>{
  const cwd=await temp();await writeFile(join(cwd,'source'),'one');await writeFile(join(cwd,'checks.json'),JSON.stringify({checks:[{id:'change',argv:[process.execPath,'-e','require("node:fs").writeFileSync("source","two")']}],required_checks:['change']}));
  const r=cli('skills/proof/scripts/run.mjs',['checks.json','--run-id','change'],cwd);assert.equal(r.status,2);
  const result=JSON.parse(await readFile(join(cwd,STATE_DIR,'runs/change/result.json'),'utf8'));assert.match(result.reason,/inputs changed/i);
  assert.equal(cli('skills/proof/scripts/run.mjs',['checks.json','--run-id','change'],cwd).status,2);
  assert.deepEqual(JSON.parse(await readFile(join(cwd,STATE_DIR,'runs/change/result.json'),'utf8')),result);
});
