import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { skillRoots } from './skills.mjs';
export function installedRoots(scriptURL,cwd=process.cwd()) {
  return [...skillRoots(cwd),resolve(dirname(fileURLToPath(scriptURL)),'../..')];
}
export function options(argv) {
  const positional=[],flags={};
  for(let i=0;i<argv.length;i++) {
    if(!argv[i].startsWith('--'))positional.push(argv[i]);
    else {const key=argv[i].slice(2);flags[key]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}
  }
  return {positional,flags};
}
