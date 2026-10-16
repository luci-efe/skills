import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join, resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { stateDirectory } from './config.mjs';
import { atomicJSON, inside, readJSON } from './files.mjs';

export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').split('\n');
  if (lines[0] !== '---') throw new Error('Missing YAML frontmatter');
  const end = lines.indexOf('---',1); if(end < 0) throw new Error('Unterminated frontmatter');
  const out = {};
  for(let i=1;i<end;i++) {
    if(!lines[i].trim() || lines[i].trimStart().startsWith('#')) continue;
    const match = /^([a-z_]+):\s*(.*)$/.exec(lines[i]);
    if(!match) throw new Error('Unsupported frontmatter syntax');
    const [,key,raw] = match; if(Object.hasOwn(out,key)) throw new Error(`Duplicate key: ${key}`);
    let value=raw.trim();
    if(/^>[+-]?$/.test(value)) {
      const parts=[]; while(i+1<end && (/^\s/.test(lines[i+1]) || !lines[i+1])) parts.push(lines[++i].trim());
      value=parts.join(' ').trim();
    } else if(value.startsWith('"')) { try { value=JSON.parse(value); } catch { throw new Error('Invalid quoted scalar'); } }
    else if(value.startsWith("'")) { if(!/^'(?:[^']|'')*'$/.test(value)) throw new Error('Invalid quoted scalar'); value=value.slice(1,-1).replace(/''/g,"'"); }
    else { if(/^[\[\]{}|&*!]/.test(value)) throw new Error('Only YAML scalar values are supported'); value=value.replace(/\s+#.*$/,'').trim(); }
    if(typeof value !== 'string' || !value) throw new Error('Expected nonempty scalar'); out[key]=value;
  }
  if(Object.keys(out).sort().join(',') !== 'description,name') throw new Error('Frontmatter keys must be exactly name and description');
  return out;
}
export function validateMetadata(meta, providerIds) {
  if(!meta || meta.schema_version!==1 || !['orient','decide','build','prove','continue'].includes(meta.stage)) throw new Error('Invalid metadata schema/stage');
  if(Object.keys(meta).some(k=>!['schema_version','stage','rule_ids','branches'].includes(k))) throw new Error('Unknown metadata key');
  if(!Array.isArray(meta.rule_ids) || !meta.rule_ids.length || meta.rule_ids.some(r=>!/^0[1-6]$/.test(r))) throw new Error('Invalid rule_ids');
  if(!Array.isArray(meta.branches) || !meta.branches.length) throw new Error('Missing branches');
  const seen=new Set();
  for(const b of meta.branches) {
    if(!b || typeof b.id!=='string' || !/^[\w-]+$/.test(b.id) || seen.has(b.id)) throw new Error('Invalid/duplicate branch'); seen.add(b.id);
    if(Object.keys(b).some(k=>!['id','entrypoint','requires','artifact_schema'].includes(k))) throw new Error('Unknown branch key');
    for(const p of [b.entrypoint,...(b.artifact_schema===null?[]:[b.artifact_schema])]) {
      if(typeof p!=='string' || !p || isAbsolute(p) || p.includes('\\') || p.split('/').includes('..')) throw new Error('Invalid branch path');
    }
    if(!Array.isArray(b.requires) || b.requires.some(id=>typeof id!=='string' || !/^[\w-]+$/.test(id) || (providerIds && !providerIds.includes(id)))) throw new Error('Unknown/invalid dependency');
  }
  return meta;
}
export function skillRoots(cwd=process.cwd()) {
  return [...new Set([join(cwd,'.claude/skills'),join(cwd,'.agents/skills'),join(homedir(),'.claude/skills'),join(homedir(),'.agents/skills'),join(homedir(),'.codex/skills'),...(process.env.RAMOS_SKILL_ROOTS??'').split(delimiter).filter(Boolean)].map(p=>resolve(p)))];
}
export async function discoverSkills({cwd=process.cwd(),roots=skillRoots(cwd),cache=true}={}) {
  const paths=[];
  for(const root of [...new Set(roots.map(p=>resolve(p)))]) {
    let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const entry of entries) {
      if(!entry.isDirectory()&&!entry.isSymbolicLink())continue;
      const dir=await realpath(join(root,entry.name));
      try {
        const s=await stat(join(dir,'SKILL.md'));let m=null;try{m=await stat(join(dir,'skill.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
        paths.push({dir,fingerprint:[dir,s.mtimeMs,s.ctimeMs,s.size,m?.mtimeMs,m?.ctimeMs,m?.size]});
      }catch(e){if(e.code!=='ENOENT')throw e;}
    }
  }
  paths.sort((a,b)=>a.dir.localeCompare(b.dir));
  const fingerprint=createHash('sha256').update(JSON.stringify(paths.map(p=>p.fingerprint))).digest('hex');
  const cachePath=resolve(stateDirectory(cwd),'cache/skills.json');
  if(cache) {try{const old=await readJSON(cachePath);if(old.fingerprint===fingerprint&&Array.isArray(old.skills))return old.skills;}catch{}}
  const skills=[];
  for(const {dir} of paths) {
    if(skills.some(s=>s.path===join(dir,'SKILL.md')))continue;
    try {
      const frontmatter=parseFrontmatter(await readFile(join(dir,'SKILL.md'),'utf8'));
      let metadata=null;try{metadata=validateMetadata(await readJSON(join(dir,'skill.json')));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(metadata) for(const b of metadata.branches) {const target=await realpath(inside(dir,b.entrypoint));inside(dir,target);}
      skills.push({...frontmatter,path:join(dir,'SKILL.md'),metadata,dependency_status:metadata?'declared':'undeclared'});
    } catch(error) { skills.push({name:dir.split(/[\\/]/).at(-1),path:join(dir,'SKILL.md'),description:'',metadata:null,dependency_status:'invalid',error:error.message}); }
  }
  if(cache)await atomicJSON(cachePath,{fingerprint,skills});return skills;
}
