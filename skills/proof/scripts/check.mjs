import { resolve } from 'node:path';
import { readJSON } from './_lib/files.mjs';
import { readActiveRun, runDirectory, validateResult } from './_lib/result.mjs';
try {
  const id=process.argv[2]??(await readActiveRun(process.cwd(),process.env.RAMOS_SESSION_ID??process.env.CLAUDE_SESSION_ID))?.run_id;
  if(!id)throw new Error('Usage: check.mjs RUN_ID (or set RAMOS_SESSION_ID)');
  const verdict=await validateResult(process.cwd(),await readJSON(resolve(runDirectory(process.cwd(),id),'result.json')),{runId:id});
  console.log(JSON.stringify(verdict));process.exitCode=verdict.ok?0:2;
}catch(error){console.error(error.message);process.exitCode=2;}
