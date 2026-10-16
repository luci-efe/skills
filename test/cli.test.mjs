import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, realpath } from 'node:fs/promises';
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
  const cwd=await temp();await cp(join(repo,'lib'),join(cwd,'lib'),{recursive:true});await cp(join(repo,'LICENSE'),join(cwd,'LICENSE'));await cp(join(repo,'skills/proof'),join(cwd,'skills/proof'),{recursive:true});await mkdir(join(cwd,'scripts'));await cp(join(repo,'scripts/vendor.mjs'),join(cwd,'scripts/vendor.mjs'));
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
test('plugin-installed doctor hooks discover sibling relay outside project and user roots',async()=>{
  const base=await realpath(await temp()),cwd=join(base,'project'),collection=join(base,'plugin cache','skills');await mkdir(cwd);
  for(const name of ['doctor','relay'])await cp(join(repo,'skills',name),join(collection,name),{recursive:true});
  const env={...process.env,RAMOS_PANE:'receiver',RAMOS_SKILL_ROOTS:'',MNEMOSYNE_DATA_DIR:join(base,'memory'),RAMOS_MNEMOSYNE_PYTHON:join(base,'missing-python')};
  const doctor=join(collection,'doctor/scripts/doctor.mjs');
  const installed=spawnSync(process.execPath,[doctor,'--install-hooks','claude'],{cwd,env,encoding:'utf8'});assert.equal(installed.status,0,installed.stderr);
  const {checkpoint,offer,ack,workspaceOf}=await import('../skills/relay/scripts/relay.mjs');
  const workspace=await workspaceOf({cwd,repoId:'fixture/plugin'}),opts={cwd,workspace,runId:'plugin',pane:'sender'};
  const draft={task:{objective:'Resume plugin handoff',scope:'fixture',constraints:[],acceptance_refs:[]},work_state:'active',decisions:[],next_actions:[],blockers:[],unknowns:[],evidence:[]};
  const checkpointFile=checkpoint(draft,opts);ack(offer(checkpointFile.path,{...opts,to:'receiver'}).path,{...opts,receiver:'receiver'});
  const settings=JSON.parse(await readFile(join(cwd,'.claude/settings.local.json'),'utf8'));
  const command=settings.hooks.SessionStart[0].hooks[0].command;
  const legacy={...settings,hooks:{...settings.hooks,SessionStart:[{hooks:[{type:'command',command:command.replace(process.execPath,'/old/node').replace(/ SessionStart.*$/,' SessionStart'),timeout:10}]}]}};
  await writeFile(join(cwd,'.claude/settings.local.json'),JSON.stringify(legacy));
  const upgraded=spawnSync(process.execPath,[doctor,'--install-hooks','claude'],{cwd,env,encoding:'utf8'});assert.equal(upgraded.status,0,upgraded.stderr);
  const upgradedSettings=JSON.parse(await readFile(join(cwd,'.claude/settings.local.json'),'utf8'));
  assert.equal(upgradedSettings.hooks.SessionStart.length,1);
  assert.equal(upgradedSettings.hooks.SessionStart[0].hooks[0].command,command);
  const input=JSON.stringify({cwd,session_id:'plugin-session'});
  const result=spawnSync(command,{cwd,env,input,encoding:'utf8',shell:true});assert.equal(result.status,0,result.stderr);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput?.additionalContext??'',/Resume plugin handoff/);
  const direct=spawnSync(process.execPath,[join(collection,'doctor/scripts/_lib/hook-adapter.mjs'),'SessionStart'],{cwd,env,input,encoding:'utf8'});
  assert.equal(direct.status,0,direct.stderr);assert.match(JSON.parse(direct.stdout).hookSpecificOutput?.additionalContext??'',/Resume plugin handoff/);
});
test('vendoring selects runtime consumers and leaves documentation-only skills untouched',async()=>{
  const cwd=await temp();await cp(join(repo,'lib'),join(cwd,'lib'),{recursive:true});await cp(join(repo,'LICENSE'),join(cwd,'LICENSE'));await mkdir(join(cwd,'scripts'));await cp(join(repo,'scripts/vendor.mjs'),join(cwd,'scripts/vendor.mjs'));
  for(const name of ['static','dynamic','docs'])await mkdir(join(cwd,'skills',name,'scripts'),{recursive:true});
  await writeFile(join(cwd,'skills/static/scripts/run.mjs'),"import { STATE_DIR } from './_lib/config.mjs';\n");
  await writeFile(join(cwd,'skills/dynamic/scripts/run.mjs'),"await import('./_lib/config.mjs');\n");
  await writeFile(join(cwd,'skills/docs/scripts/example.mjs'),'console.log("no shared library");\n');
  const run=(args=[])=>spawnSync(process.execPath,[join(cwd,'scripts/vendor.mjs'),...args],{cwd,encoding:'utf8'});
  await mkdir(join(cwd,'skills/no-scripts'));
  const built=run();assert.equal(built.status,0,built.stderr);
  for(const name of ['static','dynamic','docs','no-scripts'])assert.equal(await readFile(join(cwd,'skills',name,'LICENSE'),'utf8'),await readFile(join(repo,'LICENSE'),'utf8'));
  await assert.rejects(readFile(join(cwd,'skills/docs/scripts/_lib/config.mjs')),{code:'ENOENT'});
  for(const name of ['static','dynamic'])assert.equal(await readFile(join(cwd,'skills',name,'scripts/_lib/config.mjs'),'utf8'),await readFile(join(cwd,'lib/config.mjs'),'utf8'));
  const checked=run(['--check']);assert.equal(checked.status,0,checked.stderr);
  await writeFile(join(cwd,'skills/no-scripts/LICENSE'),'drift');assert.equal(run(['--check']).status,1);assert.equal(run().status,0);
  await mkdir(join(cwd,'skills/docs/scripts/_lib'));await writeFile(join(cwd,'skills/docs/scripts/_lib/config.mjs'),'obsolete');
  assert.equal(run(['--check']).status,1);
  assert.equal(run().status,0);await assert.rejects(readFile(join(cwd,'skills/docs/scripts/_lib/config.mjs')),{code:'ENOENT'});
});
test('Claude Code session environment arms proof and stdin session takes precedence',async()=>{
  const cwd=await temp();await writeFile(join(cwd,'source'),'one');await writeFile(join(cwd,'checks.json'),JSON.stringify({checks:[{id:'unit',argv:[process.execPath,'-e','console.log("ok")']}],required_checks:['unit']}));
  const env={...process.env,CLAUDE_CODE_SESSION_ID:'claude-current',CLAUDE_SESSION_ID:'legacy'};delete env.RAMOS_SESSION_ID;
  const run=cli('skills/proof/scripts/run.mjs',['checks.json','--run-id','session'],cwd,{env});assert.equal(run.status,0,run.stderr);
  const check=cli('skills/proof/scripts/check.mjs',[],cwd,{env});assert.equal(check.status,0,check.stderr);
  await writeFile(join(cwd,'source'),'two');
  const hook=(session_id)=>JSON.parse(cli('hooks/claude/stop.mjs',[],cwd,{env,input:JSON.stringify({cwd,session_id})}).stdout);
  assert.equal(hook('claude-current').decision,'block');assert.deepEqual(hook('other'),{});
});
test('advisory errors stay silent and record a local hook diagnostic',async()=>{
  const cwd=await temp(),root=join(cwd,'bad-skills');await writeFile(root,'not a directory');
  const result=cli('hooks/claude/user-prompt-submit.mjs',[],cwd,{env:{...process.env,RAMOS_SKILL_ROOTS:root},input:JSON.stringify({cwd,prompt:'verify tests'})});assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{});
  assert.match(await readFile(join(cwd,STATE_DIR,'hooks.log'),'utf8'),/UserPromptSubmit.*ENOTDIR/);
});
