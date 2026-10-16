import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));const check=process.argv.includes('--check');
try {
  const sources=(await readdir(resolve(root,'lib'))).filter(p=>/\.(mjs|json)$/.test(p)).sort();
  let count=0;const failures=[];
  for(const entry of await readdir(resolve(root,'skills'),{withFileTypes:true})) {
    if(!entry.isDirectory())continue;
    const dest=resolve(root,'skills',entry.name,'scripts/_lib');
    if(!check)await mkdir(dest,{recursive:true});
    for(const name of sources) {
      if(check) {try{if(!(await readFile(resolve(dest,name))).equals(await readFile(resolve(root,'lib',name))))failures.push(`${entry.name}/${name}`);}catch{failures.push(`${entry.name}/${name} (missing)`);}}
      else await copyFile(resolve(root,'lib',name),resolve(dest,name));
      count++;
    }
    if(check) {try{for(const name of await readdir(dest))if(!sources.includes(name))failures.push(`${entry.name}/${name} (unexpected)`);}catch{}}
  }
  if(failures.length)throw new Error(`Vendor drift:\n${failures.join('\n')}`);
  console.log(`${check?'Verified':'Vendored'} ${count} runtime files`);
}catch(error){console.error(error.message);process.exitCode=1;}
