import { readdir, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseFrontmatter, validateMetadata } from '../lib/skills.mjs';
import { inside, readJSON } from '../lib/files.mjs';
import { providers } from '../lib/providers.mjs';
const root=fileURLToPath(new URL('../skills/',import.meta.url));let count=0;const errors=[];
for(const entry of await readdir(root,{withFileTypes:true})) {
  if(!entry.isDirectory())continue;const dir=resolve(root,entry.name);
  try {
    const text=await readFile(resolve(dir,'SKILL.md'),'utf8');const fm=parseFrontmatter(text);
    if(fm.name!==entry.name)throw new Error('Skill name must match directory');
    if(!fm.description.startsWith('Use when'))throw new Error('Description must start with Use when');
    if(text.split('\n').length>=150)throw new Error('SKILL.md must be under 150 lines');
    const meta=validateMetadata(await readJSON(resolve(dir,'skill.json')),Object.keys(providers));
    const refs=new Set(meta.branches.flatMap(b=>[b.entrypoint,...(b.artifact_schema?[b.artifact_schema]:[])]));
    for(const match of text.matchAll(/(?:references|scripts)\/[a-zA-Z0-9_./-]+\.(?:md|mjs|json)/g))refs.add(match[0]);
    for(const ref of refs){const path=inside(dir,ref);inside(await realpath(dir),await realpath(path));}
    count++;
  }catch(error){errors.push(`${entry.name}: ${error.message}`);}
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Validated ${count} skills`);
