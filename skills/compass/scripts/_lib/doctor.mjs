import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readJSON, atomicJSON } from './files.mjs';
function quote(value) {
  if(process.platform==='win32') {if(/["%\r\n]/.test(value))throw new Error('Unsupported shell metacharacter in hook installation path');return `"${value}"`;}
  return `'${value.replace(/'/g,"'\\''")}'`;
}
export async function installClaudeHooks(cwd,{dryRun=false,skillRoot}={}) {
  const path=resolve(cwd,'.claude/settings.local.json');let settings={};
  try{settings=await readJSON(path);}catch(e){if(e.code==='ENOENT'){/* no settings yet */}else if(e instanceof SyntaxError)throw new Error(`Malformed JSON in ${path}: ${e.message}`);else throw e;}
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error(`Invalid Claude settings object in ${path}`);
  settings.hooks??={};if(typeof settings.hooks!=='object'||Array.isArray(settings.hooks))throw new Error(`Invalid hooks object in ${path}`);
  const adapter=fileURLToPath(new URL('./hook-adapter.mjs',import.meta.url));
  for(const event of ['UserPromptSubmit','SessionStart','Stop']) {
    const legacy=`${quote(process.execPath)} ${quote(adapter)} ${event}`;
    const command=`${legacy}${skillRoot?` ${quote(skillRoot)}`:''}`;
    const groups=settings.hooks[event]??[];if(!Array.isArray(groups))throw new Error(`Invalid ${event} hooks in ${path}`);
    for(const group of groups)for(const hook of group.hooks??[])if(typeof hook.command==='string'&&(hook.command===legacy||hook.command.includes(` ${quote(adapter)} ${event}`)))hook.command=command;
    if(!groups.some(group=>group.hooks?.some(h=>h.command===command)))groups.push({hooks:[{type:'command',command,timeout:10}]});
    settings.hooks[event]=groups;
  }
  if(!dryRun)await atomicJSON(path,settings);return {path,dry_run:dryRun,settings};
}
