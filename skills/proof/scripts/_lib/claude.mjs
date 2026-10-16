import { resolve } from 'node:path';
import { readJSON } from './files.mjs';
import { readActiveRun, runDirectory, validateResult } from './result.mjs';
export async function hookInput() {let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>1024*1024)throw new Error('Hook input too large');}return JSON.parse(text||'{}');}
export async function stop(input) {
  if(input.stop_hook_active)return {};
  try {
    const active=await readActiveRun(input.cwd??process.cwd(),input.session_id);
    if(!active?.claimed_done)return {};
    const result=await readJSON(resolve(runDirectory(input.cwd??process.cwd(),active.run_id),'result.json'));
    const verdict=await validateResult(input.cwd??process.cwd(),result,{runId:active.run_id});
    if(verdict.ok||verdict.terminal)return {};
    return {decision:'block',reason:`/proof: ${verdict.reason}. Run the declared checks or record a terminal blocker with its reason.`};
  }catch(error){return {decision:'block',reason:`/proof: cannot validate completion: ${error.message}`};}
}
export function additionalContext(event,text) {return text?{hookSpecificOutput:{hookEventName:event,additionalContext:text}}:{};}
