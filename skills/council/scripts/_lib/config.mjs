import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
export const STATE_DIR = process.env.RAMOS_STATE_DIR ?? '.ramos';
function canonical(path) {
  try{return realpathSync(path);}catch(error){if(error.code!=='ENOENT')throw error;return resolve(canonical(dirname(path)),basename(path));}
}
export function workspaceRoot(cwd=process.cwd()) {
  cwd=realpathSync(cwd);
  try{return realpathSync(execFileSync('git',['--no-optional-locks','rev-parse','--show-toplevel'],{cwd,encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim());}
  catch(error){if(error.code!=='ENOENT'&&!String(error.stderr).includes('not a git repository'))throw error;}
  if(!isAbsolute(STATE_DIR))for(let dir=cwd;;dir=dirname(dir)) {
    if(existsSync(resolve(dir,STATE_DIR)))return dir;
    if(dirname(dir)===dir)break;
  }
  return cwd;
}
export function stateDirectory(cwd=process.cwd()) {return canonical(resolve(workspaceRoot(cwd),STATE_DIR));}
