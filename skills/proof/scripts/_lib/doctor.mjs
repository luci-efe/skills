import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readJSON, atomicJSON } from './files.mjs';
function quote(value) {
  if(process.platform==='win32') {if(/["%\r\n]/.test(value))throw new Error('Unsupported shell metacharacter in hook installation path');return `"${value}"`;}
  return `'${value.replace(/'/g,"'\\''")}'`;
}
const targets={
  claude:{file:'.claude/settings.local.json',events:['UserPromptSubmit','SessionStart','Stop'],timeout:10},
  codex:{file:'.codex/hooks.json',events:['Stop'],timeout:10},
  gemini:{file:'.gemini/settings.json',events:['AfterAgent'],timeout:10000}
};
export const hookHarnesses=Object.keys(targets);
export async function installHooks(harness,cwd,{dryRun=false,skillRoot}={}) {
  const target=targets[harness];if(!target)throw new Error(`Unknown hook harness "${harness}" (use ${hookHarnesses.join(', ')})`);
  const path=resolve(cwd,target.file);let settings={};
  try{settings=await readJSON(path);}catch(e){if(e.code==='ENOENT'){/* no settings yet */}else if(e instanceof SyntaxError)throw new Error(`Malformed JSON in ${path}: ${e.message}`);else throw e;}
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error(`Invalid ${harness} settings object in ${path}`);
  settings.hooks??={};if(typeof settings.hooks!=='object'||Array.isArray(settings.hooks))throw new Error(`Invalid hooks object in ${path}`);
  const adapter=fileURLToPath(new URL('./hook-adapter.mjs',import.meta.url));
  for(const event of target.events) {
    const legacy=`${quote(process.execPath)} ${quote(adapter)} ${event}`;
    const command=`${legacy}${skillRoot?` ${quote(skillRoot)}`:''}`;
    const groups=settings.hooks[event]??[];if(!Array.isArray(groups))throw new Error(`Invalid ${event} hooks in ${path}`);
    for(const group of groups)for(const hook of group.hooks??[])if(typeof hook.command==='string'&&(hook.command===legacy||hook.command.includes(` ${quote(adapter)} ${event}`)))hook.command=command;
    if(!groups.some(group=>group.hooks?.some(h=>h.command===command)))groups.push({hooks:[{type:'command',command,timeout:target.timeout}]});
    settings.hooks[event]=groups;
  }
  if(!dryRun)await atomicJSON(path,settings);return {path,dry_run:dryRun,settings};
}
