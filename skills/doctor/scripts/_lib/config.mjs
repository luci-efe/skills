import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
/** Registry key for runs started where the harness exposes no session id (Gemini CLI's shell tool); the hook falls back to it. */
export const UNATTRIBUTED = '_unattributed';
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
/** Session ids visible to this process. Each harness exports its own id and children inherit the parent's, so every one is kept: the innermost harness first. An explicit RAMOS_SESSION_ID wins alone. */
export function sessionIds(env=process.env) {
  if(env.RAMOS_SESSION_ID)return [env.RAMOS_SESSION_ID];
  return [env.CODEX_THREAD_ID,env.GEMINI_SESSION_ID,env.CLAUDE_CODE_SESSION_ID,env.CLAUDE_SESSION_ID].filter(Boolean);
}
export function sessionId(env=process.env) {return sessionIds(env)[0];}
/** Ids a run registers under. Gemini CLI's shell tool has no session id, so such a run also takes the unattributed slot that only Gemini's AfterAgent hook reads. */
export function runSessionIds(env=process.env) {
  const ids=sessionIds(env);
  if(env.GEMINI_CLI&&!env.GEMINI_SESSION_ID&&!env.RAMOS_SESSION_ID)ids.push(UNATTRIBUTED);
  return ids;
}
