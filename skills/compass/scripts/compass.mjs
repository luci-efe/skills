import { discoverSkills } from './_lib/skills.mjs';
import { route, nudge } from './_lib/router.mjs';
import { installedRoots } from './_lib/cli.mjs';
try {
  const [command,prompt='',branch]=process.argv.slice(2);
  if(!['index','route','nudge'].includes(command))throw new Error('Usage: compass.mjs index | route "prompt" [branch] | nudge "prompt"');
  const skills=await discoverSkills({roots:installedRoots(import.meta.url)});
  if(command==='index')console.log(JSON.stringify(skills,null,2));
  else if(command==='nudge'){const line=nudge(prompt,skills);if(line)console.log(line);}
  else {const receipt=await route(prompt,{skills,branch});console.log(JSON.stringify(receipt,null,2));if(receipt.status==='blocked')process.exitCode=2;}
}catch(error){console.error(error.message);process.exitCode=2;}
