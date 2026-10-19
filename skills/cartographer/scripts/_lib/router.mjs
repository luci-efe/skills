import { realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inside } from './files.mjs';
import { discoverSkills } from './skills.mjs';
import { probe } from './probe.mjs';
const intents = [
  ['doctor','orient',/\b(install|setup|doctor|missing (?:binary|tool|dependenc\w*))\b/i,'check installation and prerequisites'],
  ['reproduce','build',/\b(bug|regression|reproduce|fail|fails|failed|failing|flaky|intermittent(?:ly)?|broken|debug)\b/i,'isolate failing behavior'],
  ['red-team','prove',/\b(cve|vulnerab\w*|exploit|security audit|advisor(?:y|ies))\b/i,'investigate security exposure'],
  ['relay','continue',/\b(handoff|hand off|continue session|context window|resume)\b/i,'continue from a checkpoint'],
  ['council','decide',/\b(council|debate|independent review|second opinion)\b/i,'review an artifact independently'],
  ['cartographer','orient',/\b(architecture|domain|codebase|flow|navigate)\b/i,'trace a domain or flow'],
  ['crucible','decide',/\b(requirements|scope|clarify|design|trade.?off)\b/i,'resolve scope and design forks'],
  ['proof','prove',/\b(verify|verification|proof|test|tests|ship|benchmark|visual|validate|prove|works|done)\b/i,'verify completion evidence'],
  ['compass','orient',/\b(which skill|route|compass)\b/i,'find the next skill'],
];
function explicitSkill(prompt,skills) {return [...prompt.matchAll(/(?:^|\s)\/([a-z][a-z-]*)(?=$|[\s.,!?])/g)].find(m=>skills.some(s=>s.name===m[1]))?.[1];}
export function candidates(prompt,skills) {
  const explicit=explicitSkill(prompt,skills);
  return skills.flatMap(s=>{
    const intent=intents.find(i=>i[0]===s.name);
    if(explicit===s.name)return [{...s,reason:'explicit request',score:100}];
    if(explicit||!intent||!intent[2].test(prompt))return [];
    if(s.metadata && (s.metadata.stage!==intent[1] || !s.metadata.rule_ids?.length))return [];
    return [{...s,reason:intent[3],score:10-intents.indexOf(intent)}];
  }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,3);
}
export function nudge(prompt,skills) {
  if(explicitSkill(prompt,skills))return '';
  const first=candidates(prompt,skills)[0];if(!first)return '';
  const pattern=intents.find(i=>i[0]===first.name)[2];
  const signals=new Set((prompt.match(new RegExp(pattern.source,'gi'))??[]).map(s=>s.toLowerCase()));
  return signals.size>=2?`compass: consider /${first.name} — ${first.reason}`:'';
}
export async function route(prompt,{cwd=process.cwd(),skills,branch,skill,probeFn=probe}={}) {
  skills??=await discoverSkills({cwd});if(skill) {
    let path;try{path=await realpath(resolve(cwd,skill));}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    skills=skills.filter(s=>s.name===skill||s.path===path);
  }
  const options=candidates(prompt,skills);
  if(!options.length)return {status:'no-match',candidates:[],selected:null};
  const selected=options[0];
  if(options.filter(s=>s.name===selected.name).length>1)return {status:'ambiguous',candidates:options,selected:null,reason:'Duplicate skill name; use --skill with its absolute SKILL.md path'};
  if(selected.dependency_status!=='declared')return {status:selected.dependency_status,candidates:options,selected,reason:selected.error??'Read third-party preflight; dependencies are undeclared'};
  const chosen=branch?selected.metadata.branches.find(b=>b.id===branch):selected.metadata.branches[0];
  if(!chosen)return {status:'blocked',candidates:options,selected,reason:`Unknown branch ${branch}; to pick a skill use --skill <path to SKILL.md> (branches of ${selected.name}: ${selected.metadata.branches.map(b=>b.id).join(', ')})`};
  const prerequisites=await probeFn(chosen.requires,{cwd});
  return {status:prerequisites.every(p=>p.ok)?'ready':'blocked',candidates:options.map(s=>({name:s.name,path:s.path,reason:s.reason})),selected:{name:selected.name,path:selected.path},branch:chosen.id,entrypoint:inside(dirname(selected.path),chosen.entrypoint),prerequisites,reason:selected.reason,artifact_schema:chosen.artifact_schema};
}
