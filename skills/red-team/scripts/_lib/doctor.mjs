import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readJSON, atomicJSON } from './files.mjs';
function quote(value) {
  if(process.platform==='win32') {if(/["%\r\n]/.test(value))throw new Error('Unsupported shell metacharacter in hook installation path');return `"${value}"`;}
  return `'${value.replace(/'/g,"'\\''")}'`;
}
export async function installClaudeHooks(cwd,{dryRun=false}={}) {
  const path=resolve(cwd,'.claude/settings.local.json');let settings={};
  try{settings=await readJSON(path);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('Invalid Claude settings object');
  settings.hooks??={};if(typeof settings.hooks!=='object'||Array.isArray(settings.hooks))throw new Error('Invalid hooks object');
  const adapter=fileURLToPath(new URL('./hook-adapter.mjs',import.meta.url));
  for(const event of ['UserPromptSubmit','SessionStart','Stop']) {
    const command=`${quote(process.execPath)} ${quote(adapter)} ${event}`;
    const groups=settings.hooks[event]??[];if(!Array.isArray(groups))throw new Error(`Invalid ${event} hooks`);
    if(!groups.some(group=>group.hooks?.some(h=>h.command===command)))groups.push({hooks:[{type:'command',command,timeout:10}]});
    settings.hooks[event]=groups;
  }
  if(!dryRun)await atomicJSON(path,settings);return {path,dry_run:dryRun,settings};
}
