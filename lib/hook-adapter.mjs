import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hookInput, stop, additionalContext } from './claude.mjs';
import { discoverSkills, skillRoots } from './skills.mjs';
import { nudge } from './router.mjs';
import { execute } from './execute.mjs';
import { STATE_DIR } from './config.mjs';
import { readJSON } from './files.mjs';
export async function handleHook(event,input,options={}) {
  const cwd=input.cwd??process.cwd();
  if(event==='Stop')return stop(input);
  const roots=options.roots??[...skillRoots(cwd),resolve(cwd,'skills')];
  if(event==='UserPromptSubmit')return additionalContext(event,nudge(input.prompt??'',await discoverSkills({cwd,roots})));
  if(event==='SessionStart') {
    const cache=resolve(cwd,STATE_DIR,'cache/skills.json');
    let previous;try{previous=await readJSON(cache);}catch{}
    const skills=await discoverSkills({cwd,roots});
    const current=await readJSON(cache);
    const warning=previous&&previous.fingerprint!==current.fingerprint?'doctor: skill discovery index was stale; metadata refreshed.':'';
    const relay=skills.find(s=>s.name==='relay'&&s.dependency_status!=='invalid');
    if(!relay)return additionalContext(event,warning);
    const script=resolve(dirname(relay.path),'scripts/relay.mjs');try{await access(script);}catch{return additionalContext(event,warning);}
    const output=await execute([process.execPath,script,'inject'],{cwd,timeoutMs:5000,maxOutput:16384,env:{...process.env,RAMOS_SESSION_ID:input.session_id??''}});
    if(output.exit!==0)return additionalContext(event,[warning,'relay: checkpoint injection unavailable; run /doctor.'].filter(Boolean).join('\n'));
    // The relay owns its token budget; cap bytes again at this adapter boundary.
    let text=[warning,output.output].filter(Boolean).join('\n');while(Buffer.byteLength(text)>1600)text=text.slice(0,-1);
    return additionalContext(event,text.trim());
  }
  return {};
}
export async function main(event) {
  try {console.log(JSON.stringify(await handleHook(event,await hookInput())));}
  catch(error){console.log(JSON.stringify(event==='Stop'?{decision:'block',reason:`/proof: ${error.message}`}:{hookSpecificOutput:{hookEventName:event,additionalContext:`ramos: ${event} advisory unavailable; run /doctor.`}}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main(process.argv[2]);
