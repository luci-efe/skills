import { readdir, readFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));const check=process.argv.includes('--check');
try {
  const sources=(await readdir(resolve(root,'lib'))).filter(p=>/\.(mjs|json)$/.test(p)).sort();
  let count=0,licenses=0;const failures=[];
  const license=await readFile(resolve(root,'LICENSE'));
  for(const entry of await readdir(resolve(root,'skills'),{withFileTypes:true})) {
    if(!entry.isDirectory())continue;
    const notice=resolve(root,'skills',entry.name,'LICENSE');
    if(check) {try{if(!(await readFile(notice)).equals(license))failures.push(`${entry.name}/LICENSE`);}catch{failures.push(`${entry.name}/LICENSE (missing)`);}}
    else await copyFile(resolve(root,'LICENSE'),notice);
    licenses++;
    const scripts=resolve(root,'skills',entry.name,'scripts');
    let entries;try{entries=await readdir(scripts,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
    const code=await Promise.all(entries.filter(e=>e.isFile()&&e.name.endsWith('.mjs')).map(e=>readFile(resolve(scripts,e.name),'utf8')));
    const dest=resolve(scripts,'_lib');
    if(!code.some(text=>/\b(?:from\s*|import\s*\(?\s*)['"]\.\/_lib\//.test(text))) {
      if(entries.some(e=>e.name==='_lib')) {
        if(check)failures.push(`${entry.name}/_lib (unused)`);else await rm(dest,{recursive:true,force:true});
      }
      continue;
    }
    if(!check)await mkdir(dest,{recursive:true});
    for(const name of sources) {
      if(check) {try{if(!(await readFile(resolve(dest,name))).equals(await readFile(resolve(root,'lib',name))))failures.push(`${entry.name}/${name}`);}catch{failures.push(`${entry.name}/${name} (missing)`);}}
      else await copyFile(resolve(root,'lib',name),resolve(dest,name));
      count++;
    }
    if(check) {try{for(const name of await readdir(dest))if(!sources.includes(name))failures.push(`${entry.name}/${name} (unexpected)`);}catch{}}
  }
  if(failures.length)throw new Error(`Vendor drift:\n${failures.join('\n')}`);
  console.log(`${check?'Verified':'Vendored'} ${count} runtime files and ${licenses} license notices`);
}catch(error){console.error(error.message);process.exitCode=1;}
