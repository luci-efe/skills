import { mkdir, appendFile, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inside, safeId, fileSHA256 } from './files.mjs';
import { inputDigest } from './digest.mjs';
import { execute } from './execute.mjs';
import { runDirectory, writeResult, setActiveRun, MIN_PERF_BASELINE_MS, MAX_PERF_RATIO } from './result.mjs';
const elapsed=c=>Date.parse(c.ended_at)-Date.parse(c.started_at);
export function perfVerdict(perf,checks) {
  const base=checks.find(c=>c.id===perf.baseline_check),changed=checks.find(c=>c.id===perf.changed_check);
  if(!base||!changed)throw new Error('Perf checks did not both run');
  const baseline_ms=Math.max(1,elapsed(base)),changed_ms=elapsed(changed);
  return {baseline_check:perf.baseline_check,changed_check:perf.changed_check,baseline_ms,changed_ms,ratio:changed_ms/baseline_ms,max_ratio:perf.max_ratio};
}
export async function runChecks(manifest,{cwd=process.cwd(),runId=randomUUID(),sessionId,branch='assertion',prerequisites=[]}={}) {
  if(!['assertion','perf','visual-web','visual-desktop'].includes(branch))throw new Error('Invalid proof branch');
  if(!Array.isArray(manifest.checks)||!manifest.checks.length||!Array.isArray(manifest.required_checks)||!manifest.required_checks.length)throw new Error('Declare checks and nonempty required_checks');
  const ids=new Set();
  for(const c of manifest.checks){safeId(c.id);if(ids.has(c.id))throw new Error('Duplicate check ID');ids.add(c.id);if(!Array.isArray(c.argv)||!c.argv.length||c.argv.some(a=>typeof a!=='string')||!c.argv[0])throw new Error('Invalid check argv');inside(cwd,c.cwd??'.');}
  if(new Set(manifest.required_checks).size!==manifest.required_checks.length||manifest.required_checks.some(id=>!ids.has(id)))throw new Error('Required check is missing or duplicated');
  if(manifest.artifacts!==undefined&&(!Array.isArray(manifest.artifacts)||manifest.artifacts.some(p=>typeof p!=='string')))throw new Error('Invalid artifact list');
  const perf=manifest.perf;
  if(perf!==undefined) {
    if(branch!=='perf')throw new Error('manifest.perf requires --branch perf');
    if(!perf||typeof perf!=='object'||!ids.has(perf.baseline_check)||!ids.has(perf.changed_check)||perf.baseline_check===perf.changed_check)throw new Error('perf needs distinct baseline_check and changed_check that are declared checks');
    if(!manifest.required_checks.includes(perf.baseline_check)||!manifest.required_checks.includes(perf.changed_check))throw new Error('perf checks must be in required_checks');
    if(typeof perf.max_ratio!=='number'||!Number.isFinite(perf.max_ratio)||perf.max_ratio<=0||perf.max_ratio>MAX_PERF_RATIO)throw new Error(`perf.max_ratio must be a positive number up to ${MAX_PERF_RATIO}`);
  } else if(branch==='perf')throw new Error('perf branch needs manifest.perf {baseline_check, changed_check, max_ratio}');
  const dir=runDirectory(cwd,runId);await mkdir(resolve(dir,'..'),{recursive:true});
  try {await mkdir(dir);}catch(error){if(error.code==='EEXIST')throw new Error(`run id already exists: pick a new --run-id (${runId})`);throw error;}
  await mkdir(resolve(dir,'checks'));
  const source=await inputDigest(cwd);
  const result={schema_version:1,run_id:runId,skill:'proof',branch,status:'blocked',source,checks:[],required_checks:manifest.required_checks,artifacts:[],reason:'Checks have not completed'};
  await writeResult(cwd,result);
  if(sessionId)await setActiveRun(cwd,sessionId,{run_id:runId,claimed_done:false});
  try {
    const missing=prerequisites.filter(p=>!p.ok);
    if(missing.length)throw new Error(missing.map(p=>`${p.id}: ${p.diagnostic??'unavailable'}; ${p.missing_install??'no verified installation recipe'}`).join('; '));
    for(const check of manifest.checks) {
      const log=`checks/${check.id}.log`;
      const execution=await execute(check.argv,{cwd:inside(cwd,check.cwd??'.'),timeoutMs:check.timeout_ms??120000,logPath:resolve(dir,log)});
      if(execution.diagnostic)await appendFile(resolve(dir,log),`\n${execution.diagnostic}\n`);
      result.checks.push({id:check.id,argv:check.argv,cwd:check.cwd??'.',exit:execution.exit,started_at:execution.started_at,ended_at:execution.ended_at,log,log_sha256:await fileSHA256(resolve(dir,log))});
      if(execution.exit!==0){result.status=execution.exit===null?'blocked':'failed';result.reason=execution.diagnostic??`Check ${check.id} exited ${execution.exit}`;break;}
    }
    if(result.checks.length===manifest.checks.length && result.checks.every(c=>c.exit===0)) {
      let inconclusive=false;
      if(perf) {
        result.perf=perfVerdict(perf,result.checks);
        if(result.perf.baseline_ms<MIN_PERF_BASELINE_MS){inconclusive=true;result.status='blocked';result.reason=`Perf inconclusive: baseline ran ${result.perf.baseline_ms}ms (< ${MIN_PERF_BASELINE_MS}ms), so the ratio is noise; make the workload longer`;}
        else if(result.perf.ratio>perf.max_ratio){result.status='failed';result.reason=`Perf ratio ${result.perf.ratio.toFixed(2)} exceeds max_ratio ${perf.max_ratio}`;}
      }
      if(result.status==='blocked'&&!inconclusive) {
      const after=await inputDigest(cwd);
      if(after.input_digest!==source.input_digest||after.head!==source.head) {result.status='blocked';result.reason='Source inputs changed during checks; rerun against stable inputs';}
      else {
        for(const [index,path] of (manifest.artifacts??[]).entries()) {
          const dest=`artifacts/${index}-${basename(path)}`;await mkdir(resolve(dir,'artifacts'),{recursive:true});await copyFile(inside(cwd,path),resolve(dir,dest));result.artifacts.push(dest);
        }
        result.status='passed';result.reason=null;
      }
      }
    }
  } catch(error){result.status='blocked';result.reason=error.message;}
  await writeResult(cwd,result);if(sessionId)await setActiveRun(cwd,sessionId,{run_id:runId,claimed_done:result.status==='passed'});
  return result;
}
