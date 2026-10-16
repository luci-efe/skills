import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const expected=JSON.parse(readFileSync(join(repo,'.claude-plugin/plugin.json'),'utf8')).skills.map(path=>({name:basename(path),source:resolve(repo,path)}));
const base=realpathSync(mkdtempSync(join(tmpdir(),'skills clean install ')));
const cwd=join(base,'fresh project'),home=join(base,'isolated home');
mkdirSync(cwd);mkdirSync(home);
const env={...process.env,HOME:home,USERPROFILE:home,CI:'1',DISABLE_TELEMETRY:'1',npm_config_cache:process.env.npm_config_cache??join(homedir(),'.npm'),MNEMOSYNE_DATA_DIR:join(base,'memory data'),GIT_CONFIG_GLOBAL:join(home,'.gitconfig'),GIT_CONFIG_NOSYSTEM:'1'};
for(const key of ['GIT_DIR','GIT_WORK_TREE','RAMOS_STATE_DIR','RAMOS_SESSION_ID','CLAUDE_SESSION_ID','CLAUDE_CODE_SESSION_ID','CLAUDE_PROJECT_DIR','RAMOS_PANE','RAMOS_SKILL_ROOTS','RAMOS_MNEMOSYNE_PYTHON'])delete env[key];
env.RAMOS_STATE_DIR='.e2e-state';
env.CLAUDE_CODE_SESSION_ID='clean-install-session';
const state=join(cwd,env.RAMOS_STATE_DIR),claudeSkills=join(cwd,'.claude/skills');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function run(bin,args=[],options={}) {
  const result=spawnSync(bin,args,{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});
  assert.ifError(result.error);
  return result;
}
function success(bin,args=[],options={}) {
  const result=run(bin,args,options);assert.equal(result.status,0,`${bin} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);return result.stdout;
}
const installed=(skill,script)=>join(claudeSkills,skill,'scripts',script);
const node=(skill,script,args=[])=>run(process.execPath,[installed(skill,script),...args]);
const nodeJSON=(skill,script,args=[])=>JSON.parse(success(process.execPath,[installed(skill,script),...args]));
function copied(source,dest) {
  assert.ok(lstatSync(dest).isDirectory(),dest);assert.equal(lstatSync(dest).isSymbolicLink(),false,dest);
  for(const entry of readdirSync(source,{withFileTypes:true})) {
    const from=join(source,entry.name),to=join(dest,entry.name);
    if(entry.isDirectory())copied(from,to);
    else {assert.equal(lstatSync(to).isSymbolicLink(),false,to);assert.deepEqual(readFileSync(to),readFileSync(from),to);}
  }
}
function hook(event) {
  const settings=json(join(cwd,'.claude/settings.local.json'));
  const groups=settings.hooks[event];assert.equal(groups.length,1);
  return JSON.parse(success(groups[0].hooks[0].command,[],{shell:true,input:JSON.stringify({hook_event_name:event,cwd,session_id:env.CLAUDE_CODE_SESSION_ID,stop_hook_active:false,permission_mode:'default'}),env:{...env,RAMOS_PANE:'receiver'}}));
}

test('clean install through the real skills CLI',async t=>{
  t.diagnostic(`Fixture retained at ${base}`);
  success('git',['init']);success('git',['config','user.email','smoke@example.invalid']);success('git',['config','user.name','Skills smoke']);
  success('mnemosyne',['--help']);
  t.diagnostic('Real mnemosyne is required; its data is isolated from user memory.');

  // Agent IDs and --copy verified with skills add --help and its invalid-agent list.
  for(const [agent,path] of [['claude-code','.claude/skills'],['codex','.agents/skills']]) {
    await t.test(`${agent} receives every manifest skill and its shipped assets`,()=>{
      const output=success('npx',['-y','skills@latest','add',repo,'--copy','-y','-a',agent]);
      t.diagnostic(`skills add --copy -a ${agent}: exit 0`);
      const root=join(cwd,path);
      assert.deepEqual(readdirSync(root).sort(),expected.map(s=>s.name).sort(),`${agent}: manifest skills missing\n${output}`);
      for(const skill of expected) {
        const dest=join(root,skill.name);assert.equal(json(join(dest,'skill.json')).schema_version,1);
        copied(skill.source,dest);
      }
    });
  }

  await t.test('installed doctor probes real tools and installs hooks idempotently',()=>{
    const result=node('doctor','doctor.mjs',['--json']);
    const rows=JSON.parse(result.stdout),catalog=json(join(claudeSkills,'doctor/scripts/_lib/providers.json'));
    assert.deepEqual(rows.map(r=>r.id).sort(),Object.keys(catalog).sort());
    assert.equal(result.status,rows.every(r=>r.ok)?0:2,result.stderr);
    for(const row of rows){assert.equal(typeof row.ok,'boolean');if(!row.ok){assert.equal(row.version,null);assert.equal(typeof row.diagnostic,'string');}}
    for(const id of ['node','git','mnemosyne'])assert.equal(rows.find(r=>r.id===id).ok,true,`${id} must be present`);
    assert.equal(rows.find(r=>r.id==='playwright').ok,false,'fresh project has no local playwright');
    t.diagnostic(`doctor: ${rows.filter(r=>r.ok).length} present, ${rows.filter(r=>!r.ok).length} missing; exit ${result.status}`);
    const settings=join(cwd,'.claude/settings.local.json');assert.equal(existsSync(settings),false);
    const dry=nodeJSON('doctor','doctor.mjs',['--install-hooks','claude','--dry-run']);assert.equal(dry.dry_run,true);assert.equal(existsSync(settings),false);
    nodeJSON('doctor','doctor.mjs',['--install-hooks','claude']);const first=readFileSync(settings,'utf8');
    nodeJSON('doctor','doctor.mjs',['--install-hooks','claude']);assert.equal(readFileSync(settings,'utf8'),first);
    for(const event of ['SessionStart','UserPromptSubmit','Stop'])assert.equal(json(settings).hooks[event].length,1);
  });

  await t.test('installed proof rejects stale evidence and Stop blocks then allows a fresh pass',()=>{
    writeFileSync(join(cwd,'source.txt'),'before\n');
    writeFileSync(join(cwd,'checks.json'),JSON.stringify({checks:[{id:'unit',argv:[process.execPath,'-e','console.log("clean install check passed")']}],required_checks:['unit']}));
    success('git',['add','.']);success('git',['-c','commit.gpgsign=false','commit','-m','clean-install fixture']);
    const result=nodeJSON('proof','run.mjs',['checks.json','--run-id','first']);assert.equal(result.status,'passed');
    assert.equal(nodeJSON('proof','check.mjs',['first']).ok,true);
    assert.equal(json(join(state,'active.json')).sessions[env.CLAUDE_CODE_SESSION_ID].claimed_done,true);
    writeFileSync(join(cwd,'source.txt'),'changed\n');
    const stale=node('proof','check.mjs',['first']);assert.equal(stale.status,2,stale.stderr);assert.match(JSON.parse(stale.stdout).reason,/stale/i);
    assert.equal(hook('Stop').decision,'block');
    assert.equal(nodeJSON('proof','run.mjs',['checks.json','--run-id','fresh']).status,'passed');
    assert.equal(nodeJSON('proof','check.mjs',['fresh']).ok,true);assert.deepEqual(hook('Stop'),{});
  });

  await t.test('installed relay transfers ownership and recalls real mnemosyne memory in SessionStart',()=>{
    mkdirSync(state,{recursive:true});const draft=join(state,'draft.json');
    writeFileSync(draft,JSON.stringify({task:{objective:'Continue blue lantern verification',scope:'source.txt',constraints:[],acceptance_refs:[]},work_state:'active',decisions:[{id:'D1',summary:'Blue lantern invariants require receiver acknowledgement',source_ref:'source.txt',status:'accepted'}],next_actions:[{owner:'receiver',action:'Verify blue lantern invariants',artifact:'source.txt'}],blockers:[],unknowns:[],evidence:[]}));
    const cp=nodeJSON('relay','relay.mjs',['checkpoint','--from',draft,'--run','handoff','--pane','sender','--repo-id','smoke/clean-install']);
    assert.equal(nodeJSON('relay','relay.mjs',['sync',cp.path]).stored,1);
    const offer=nodeJSON('relay','relay.mjs',['offer',cp.path,'--to','receiver']);
    const ack=nodeJSON('relay','relay.mjs',['ack',offer.path,'--receiver','receiver']);assert.equal(ack.stale,false);
    assert.equal(json(ack.path).receiver,'receiver');
    const context=hook('SessionStart').hookSpecificOutput?.additionalContext??'';
    assert.match(context,/Continue blue lantern verification/);assert.match(context,/memory:.*Blue lantern invariants/);assert.doesNotMatch(context,/memory: unavailable|STALE/);assert.ok(Buffer.byteLength(context)<=1600);
  });

  await t.test('installed compass nudges once and keeps two other prompts silent',()=>{
    const nudge=prompt=>success(process.execPath,[installed('compass','compass.mjs'),'nudge',prompt]).trim();
    assert.match(nudge('verify tests in /usr/local/app'),/^compass: consider \/proof —/);
    assert.equal(nudge('done for today'),'');assert.equal(nudge('/proof'),'');
  });

  await t.test('Claude plugin manifest validates when the CLI is available',st=>{
    const result=spawnSync('claude',['plugin','validate',repo],{cwd,env,encoding:'utf8',timeout:30000});
    if(result.error?.code==='ENOENT'){st.skip('claude is not on PATH; plugin validation unavailable');return;}
    assert.ifError(result.error);assert.equal(result.status,0,result.stdout+result.stderr);
  });
});
