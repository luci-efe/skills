import { mkdir, readFile, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { STATE_DIR } from './config.mjs';
import { atomicJSON, inside, readJSON, safeId } from './files.mjs';
import { inputDigest } from './digest.mjs';
export const runDirectory = (cwd,id) => resolve(cwd,STATE_DIR,'runs',safeId(id));
export async function writeResult(cwd,result) {await atomicJSON(resolve(runDirectory(cwd,result.run_id),'result.json'),result);}
export async function validateResult(cwd,result,{runId}={}) {
  try {
    if(result?.schema_version!==1 || result.skill!=='proof' || !['assertion','perf','visual-web','visual-desktop'].includes(result.branch)) throw new Error('Invalid result schema');
    safeId(result.run_id); if(runId&&runId!==result.run_id)throw new Error('Run ID does not match active run');
    if(['blocked','failed','cancelled'].includes(result.status)) {
      if(typeof result.reason!=='string'||!result.reason.trim())throw new Error('Terminal result needs a reason');
      return {ok:false,terminal:true,reason:result.reason};
    }
    if(result.status!=='passed')throw new Error('Result has not passed');
    if(typeof result.source?.dirty!=='boolean' || result.reason!==null)throw new Error('Invalid source or passed-result reason');
    if(!Array.isArray(result.required_checks)||!result.required_checks.length||new Set(result.required_checks).size!==result.required_checks.length)throw new Error('Required checks must be nonempty and unique');
    if(!Array.isArray(result.checks)||new Set(result.checks.map(c=>c.id)).size!==result.checks.length)throw new Error('Invalid/duplicate checks');
    const dir=runDirectory(cwd,result.run_id);
    for(const id of result.required_checks) {
      safeId(id);const check=result.checks.find(c=>c.id===id);
      if(!check||check.exit!==0||!Array.isArray(check.argv)||!check.argv.length||check.argv.some(a=>typeof a!=='string')||typeof check.cwd!=='string')throw new Error(`Required check failed or missing: ${id}`);
      if(!Number.isFinite(Date.parse(check.started_at))||!Number.isFinite(Date.parse(check.ended_at))||Date.parse(check.ended_at)<Date.parse(check.started_at))throw new Error(`Invalid check times: ${id}`);
      if(typeof check.log!=='string'||!check.log)throw new Error(`Missing log: ${id}`);
      await readFile(inside(dir,check.log));
    }
    if(!Array.isArray(result.artifacts))throw new Error('Invalid artifacts');
    for(const path of result.artifacts) {if(typeof path!=='string')throw new Error('Invalid artifact path');await readFile(inside(dir,path));}
    const current=await inputDigest(cwd);
    if(current.head!==result.source?.head||current.input_digest!==result.source?.input_digest)throw new Error('Evidence is stale: source inputs changed');
    return {ok:true,reason:null};
  }catch(error){return {ok:false,reason:error.message};}
}
export async function readActiveRun(cwd,sessionId) {
  if(!sessionId)return null;
  try {const active=await readJSON(resolve(cwd,STATE_DIR,'active.json'));return active.sessions?.[sessionId]??(active.session_id===sessionId?active:null);}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function setActiveRun(cwd,sessionId,run) {
  if(typeof sessionId!=='string'||!sessionId||['__proto__','constructor','prototype'].includes(sessionId))throw new Error('Session ID required');
  const dir=resolve(cwd,STATE_DIR);await mkdir(dir,{recursive:true});const lock=resolve(dir,'active.lock');let held=false;
  for(let attempt=0;attempt<40;attempt++){try{await mkdir(lock);held=true;break;}catch(e){if(e.code!=='EEXIST')throw e;await delay(50);}}
  if(!held)throw new Error('Active session registry is locked; inspect interrupted writer');
  try {
    let active={sessions:{}};try{active=await readJSON(resolve(dir,'active.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    active.sessions??={};active.sessions[sessionId]=run;await atomicJSON(resolve(dir,'active.json'),active);
  }finally{await rmdir(lock);}
}
