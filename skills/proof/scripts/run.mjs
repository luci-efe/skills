import { readJSON } from './_lib/files.mjs';
import { runChecks } from './_lib/proof.mjs';
import { options } from './_lib/cli.mjs';
import { probe } from './_lib/probe.mjs';
import { validateMetadata } from './_lib/skills.mjs';
try {
  const {positional,flags}=options(process.argv.slice(2));
  if(!positional[0])throw new Error('Usage: run.mjs checks.json [--run-id ID] [--session ID] [--branch assertion|perf|visual-web|visual-desktop]');
  const metadata=validateMetadata(await readJSON(new URL('../skill.json',import.meta.url)));
  const branch=metadata.branches.find(b=>b.id===(flags.branch??'assertion'));
  if(!branch)throw new Error('Unknown proof branch');
  const prerequisites=await probe(branch.requires);
  const result=await runChecks(await readJSON(positional[0]),{runId:flags['run-id'],sessionId:flags.session??process.env.RAMOS_SESSION_ID??process.env.CLAUDE_SESSION_ID,branch:branch.id,prerequisites});
  console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='passed'?0:2;
}catch(error){console.error(error.message);process.exitCode=2;}
