import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readlink, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { STATE_DIR } from './config.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 32*1024*1024, stdio: ['ignore','pipe','pipe'] }); }
export async function inputDigest(cwd = process.cwd()) {
  cwd = resolve(cwd); let root = cwd, head = null, files;
  const state = resolve(cwd, STATE_DIR);
  let isGit = false;
  try { root = git(cwd, ['rev-parse','--show-toplevel']).trim(); isGit = true; } catch (error) {
    if (error.code !== 'ENOENT' && !String(error.stderr).includes('not a git repository')) throw error;
  }
  const excluded = path => path === state || path.startsWith(state + sep);
  if (isGit) {
    try { head = git(root, ['rev-parse','--verify','HEAD']).trim(); } catch (error) {
      if (!String(error.stderr).includes('Needed a single revision')) throw error;
    }
    const status = git(root, ['status','--porcelain=v1','-z','--untracked-files=all']).split('\0');
    const changed = [];
    for (let i = 0; i < status.length; i++) {
      if (!status[i]) continue;
      const flags = status[i].slice(0,2);
      changed.push(status[i].slice(3));
      if (/[RC]/.test(flags) && status[i+1]) changed.push(status[++i]);
    }
    files = [...new Set(changed)].filter(p => !excluded(resolve(root,p)));
  } else {
    files = [];
    async function walk(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (excluded(path) || entry.name === '.git' || entry.name === 'node_modules') continue;
        if (entry.isDirectory()) await walk(path); else files.push(relative(root, path));
      }
    }
    await walk(root);
  }
  const entries = [];
  for (const path of files.sort()) {
    let content, kind = 'file';
    try {
      const absolute = resolve(root,path), stat = await lstat(absolute);
      if (stat.isSymbolicLink()) { kind = 'symlink'; content = await readlink(absolute); }
      else if (stat.isFile()) content = await readFile(absolute);
      else throw new Error(`Cannot digest non-file input: ${path}`);
    } catch (error) { if (error.code === 'ENOENT') { kind = 'deleted'; content = ''; } else throw error; }
    entries.push([path.split(sep).join('/'),hash(content),kind]);
  }
  return { head, input_digest: `sha256:${hash(JSON.stringify({head,entries}))}`, dirty: entries.length > 0 };
}
