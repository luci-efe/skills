import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
export const STATE_DIR = process.env.RAMOS_STATE_DIR ?? '.ramos';
function canonical(path) {
  try{return realpathSync(path);}catch(error){if(error.code!=='ENOENT')throw error;return resolve(canonical(dirname(path)),basename(path));}
}
export function workspaceRoot(cwd=process.cwd()) {
  cwd=realpathSync(cwd);
  try{return realpathSync(execFileSync('git',['--no-optional-locks','rev-parse','--show-toplevel'],{cwd,encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim());}
  catch(error){if(error.code!=='ENOENT'&&!String(error.stderr).includes('not a git repository'))throw error;}
  if(process.env.CLAUDE_PROJECT_DIR) {
    try {
      const project=realpathSync(process.env.CLAUDE_PROJECT_DIR),path=relative(project,cwd);
      if(path!=='..'&&!path.startsWith(`..${sep}`)&&!isAbsolute(path))return project;
    }catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
  }
  return cwd;
}
export function stateDirectory(cwd=process.cwd()) {return canonical(resolve(workspaceRoot(cwd),STATE_DIR));}
