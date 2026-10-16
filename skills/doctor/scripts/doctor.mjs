import { providers } from './_lib/providers.mjs';
import { probe } from './_lib/probe.mjs';
import { installClaudeHooks } from './_lib/doctor.mjs';
import { installedRoots, options } from './_lib/cli.mjs';
try {
  const {flags,positional}=options(process.argv.slice(2));
  if(flags['install-hooks']) {
    if(flags['install-hooks']!=='claude')throw new Error('Only the Claude hook adapter is supported');
    console.log(JSON.stringify(await installClaudeHooks(process.cwd(),{dryRun:!!flags['dry-run'],skillRoot:installedRoots(import.meta.url).at(-1)}),null,2));
  }else{
    const ids=positional.length?positional:Object.keys(providers);const rows=await probe(ids);
    if(flags.json)console.log(JSON.stringify(rows,null,2));
    else {console.log('Provider | Available | Version | Install / diagnostic');for(const row of rows)console.log(`${row.id} | ${row.ok?'yes':'no'} | ${row.version??'unknown'} | ${row.ok?'—':row.missing_install??'No verified recipe; see provider reference'}${row.diagnostic?` (${row.diagnostic})`:''}`);}
    if(rows.some(r=>!r.ok))process.exitCode=2;
  }
}catch(error){console.error(error.message);process.exitCode=2;}
