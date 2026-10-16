import { dirname } from 'node:path';
import { inside } from './files.mjs';
import { discoverSkills } from './skills.mjs';
import { probe } from './probe.mjs';
const intents = [
  ['doctor','orient',/\b(install|setup|doctor|missing binary|dependencies)\b/i,'check installation and prerequisites'],
  ['reproduce','build',/\b(bug|regression|reproduce|failing|broken|debug)\b/i,'isolate failing behavior'],
  ['red-team','prove',/\b(cve|vulnerab\w*|exploit|security audit)\b/i,'investigate security exposure'],
  ['relay','continue',/\b(handoff|hand off|continue session|context window|resume)\b/i,'continue from a checkpoint'],
  ['council','decide',/\b(council|debate|independent review|second opinion)\b/i,'review an artifact independently'],
  ['cartographer','orient',/\b(architecture|domain|codebase|flow|navigate)\b/i,'trace a domain or flow'],
  ['crucible','decide',/\b(requirements|scope|clarify|design|trade.?off)\b/i,'resolve scope and design forks'],
  ['proof','prove',/\b(verify|verification|proof|test|tests|done|ship|benchmark|visual)\b/i,'verify completion evidence'],
  ['compass','orient',/\b(which skill|route|compass)\b/i,'find the next skill'],
];
export function candidates(prompt,skills) {
  const explicit=/(?:^|\s)\/([a-z][a-z-]*)\b/.exec(prompt)?.[1];
  return skills.flatMap(s=>{
    const intent=intents.find(i=>i[0]===s.name);
    if(explicit===s.name)return [{...s,reason:'explicit request',score:100}];
    if(explicit||!intent||!intent[2].test(prompt))return [];
    if(s.metadata && (s.metadata.stage!==intent[1] || !s.metadata.rule_ids?.length))return [];
    return [{...s,reason:intent[3],score:10-intents.indexOf(intent)}];
  }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,3);
}
export function nudge(prompt,skills) {const first=candidates(prompt,skills)[0];return first?`compass: consider /${first.name} — ${first.reason}`:'';}
export async function route(prompt,{cwd=process.cwd(),skills,branch,probeFn=probe}={}) {
  skills??=await discoverSkills({cwd});const options=candidates(prompt,skills);
  if(!options.length)return {status:'no-match',candidates:[],selected:null};
  const selected=options[0];
  if(options.filter(s=>s.name===selected.name).length>1)return {status:'ambiguous',candidates:options,selected:null,reason:'Duplicate skill name; select its installed path explicitly'};
  if(selected.dependency_status!=='declared')return {status:selected.dependency_status,candidates:options,selected,reason:selected.error??'Read third-party preflight; dependencies are undeclared'};
  const chosen=branch?selected.metadata.branches.find(b=>b.id===branch):selected.metadata.branches[0];
  if(!chosen)return {status:'blocked',candidates:options,selected,reason:'Unknown branch'};
  const prerequisites=await probeFn(chosen.requires,{cwd});
  return {status:prerequisites.every(p=>p.ok)?'ready':'blocked',candidates:options.map(s=>({name:s.name,path:s.path,reason:s.reason})),selected:{name:selected.name,path:selected.path},branch:chosen.id,entrypoint:inside(dirname(selected.path),chosen.entrypoint),prerequisites,reason:selected.reason,artifact_schema:chosen.artifact_schema};
}
