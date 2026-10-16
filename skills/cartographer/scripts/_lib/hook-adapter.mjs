import { access, appendFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hookInput, stop, additionalContext } from './claude.mjs';
import { discoverSkills, skillRoots } from './skills.mjs';
import { nudge } from './router.mjs';
import { execute } from './execute.mjs';
import { stateDirectory } from './config.mjs';
import { readJSON } from './files.mjs';
const adapterDir=dirname(fileURLToPath(import.meta.url));
const collection=resolve(adapterDir,basename(adapterDir)==='_lib'?'../../..':'../skills');
export async function handleHook(event,input,options={}) {
  const cwd=input.cwd??process.cwd();
  if(event==='Stop')return stop(input);
  const roots=options.roots??[...skillRoots(cwd),resolve(cwd,'skills'),options.skillRoot??collection];
  if(event==='UserPromptSubmit')return additionalContext(event,nudge(input.prompt??'',await discoverSkills({cwd,roots})));
  if(event==='SessionStart') {
    const cache=resolve(stateDirectory(cwd),'cache/skills.json');
    let previous;try{previous=await readJSON(cache);}catch{}
    const skills=await discoverSkills({cwd,roots});
    const current=await readJSON(cache);
    const warning=previous&&previous.fingerprint!==current.fingerprint?'doctor: skill discovery index was stale; metadata refreshed.':'';
    const relay=skills.find(s=>s.name==='relay'&&s.dependency_status==='declared'&&s.metadata.stage==='continue'&&s.path===resolve(options.skillRoot??collection,'relay/SKILL.md'));
    if(!relay)return additionalContext(event,warning);
    const script=resolve(dirname(relay.path),'scripts/relay.mjs');try{await access(script);}catch{return additionalContext(event,warning);}
    const output=await execute([process.execPath,script,'inject'],{cwd,timeoutMs:5000,maxOutput:16384,env:{...process.env,RAMOS_STATE_DIR:stateDirectory(cwd),RAMOS_SESSION_ID:input.session_id??''}});
    if(output.exit!==0){await logAdvisory(cwd,event,output.diagnostic??'relay injection failed');return additionalContext(event,warning);}
    // The relay owns its token budget; cap bytes again at this adapter boundary.
    let text=[warning,output.output].filter(Boolean).join('\n');while(Buffer.byteLength(text)>1600)text=text.slice(0,-1);
    return additionalContext(event,text.trim());
  }
  return {};
}
async function logAdvisory(cwd,event,error) {
  try {const dir=stateDirectory(cwd);await mkdir(dir,{recursive:true});await appendFile(resolve(dir,'hooks.log'),`${new Date().toISOString()} ${event}: ${String(error.message??error).replace(/[\r\n]/g,' ')}\n`,{mode:0o600});}catch{}
}
export async function main(event,skillRoot) {
  let input={};
  try {input=await hookInput();console.log(JSON.stringify(await handleHook(event,input,{skillRoot})));}
  catch(error){
    if(event==='Stop')console.log(JSON.stringify({decision:'block',reason:`/proof: ${error.message}`}));
    else {await logAdvisory(input.cwd??process.cwd(),event,error);console.log('{}');}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main(process.argv[2],process.argv[3]);
