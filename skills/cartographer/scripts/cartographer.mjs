#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe } from './_lib/probe.mjs';

// Keep complete JSON lines when a search exceeds the bounded output budget.
export function execute(bin,args,{cwd,env,timeout=30000,maxOutput=4*1024*1024}={}) {
  return new Promise(done=>{
    const child=spawn(bin,args,{cwd,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',bytes=0,truncated=false,error=null;
    const stop=()=>{child.kill('SIGKILL');child.stdout.destroy();child.stderr.destroy();};
    const timer=setTimeout(()=>{error='timeout';stop();},timeout);
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>maxOutput){truncated=true;stop();}else stdout+=chunk.toString();});
    child.stderr.on('data',chunk=>{if(stderr.length<16384)stderr+=chunk.toString();});
    child.on('error',err=>{error=err.code??err.message;});
    child.on('close',code=>{clearTimeout(timer);done({code,stdout,stderr,error,truncated});});
  });
}
const stripAnsi = (str) => String(str ?? '').replace(/\x1b\[[0-9;]*m/g, '')

export const parseGitNexusStatus = (raw) => {
  const text = stripAnsi(raw)
  if (
    /Repository not indexed/i.test(text) ||
    /stale KuzuDB index/i.test(text) ||
    /Not a git repository/i.test(text)
  ) {
    return { gitnexus: 'unindexed', indexed: null, current: null }
  }

  const indexedMatch = text.match(/Indexed commit:\s*([0-9a-f]+)/i)
  const currentMatch = text.match(/Current commit:\s*([0-9a-f]+)/i)
  const indexed = indexedMatch ? indexedMatch[1] : null
  const current = currentMatch ? currentMatch[1] : null

  if (/Status:\s*[^\n]*stale/i.test(text) || (indexed && current && indexed !== current)) {
    return { gitnexus: 'stale', indexed, current }
  }

  if (/Status:\s*[^\n]*up-to-date/i.test(text) || (indexed && current && indexed === current)) {
    return { gitnexus: 'fresh', indexed, current }
  }

  return { gitnexus: 'unindexed', indexed: null, current: null }
}

export const parsePorcelainPaths = raw => {
  const entries=String(raw).split('\0'),paths=[];
  for(let i=0;i<entries.length;i++) {
    const entry=entries[i];if(!entry)continue;
    paths.push(entry.slice(3));
    if(/[RC]/.test(entry.slice(0,2)))paths.push(entries[++i]);
  }
  return [...new Set(paths.filter(Boolean))];
};
const failed=r=>r.error||r.truncated||![0,1].includes(r.code);
const diagnostic=r=>r.error??(r.truncated?'output limit exceeded':r.stderr.trim()||`exit ${r.code}`);
const git=(args,options)=>execute('git',['--no-optional-locks',...args],{...options,timeout:5000});
async function repository(options) {
  const result=await git(['rev-parse','--show-toplevel'],options);
  if(result.code===0)return realpathSync(result.stdout.trim());
  if(result.stderr.includes('not a git repository'))return realpathSync(options.cwd);
  throw new Error(`git root: ${diagnostic(result)}`);
}
export async function status({cwd=process.cwd(),env=process.env}={}) {
  const required=await probe(['git'],{cwd,env});
  if(!required[0].ok)return {gitnexus:'error',status:'blocked',missing_tools:required,errors:['git unavailable'],dirty_files:[]};
  try {
    cwd=await repository({cwd,env});
    const head=await git(['rev-parse','--short','HEAD'],{cwd,env});
    const dirty=await git(['status','--porcelain=v1','-z','--untracked-files=all'],{cwd,env});
    const errors=dirty.code!==0&&!dirty.stderr.includes('not a git repository')?[`git status: ${diagnostic(dirty)}`]:[];
    const base={root:cwd,indexed:null,current:head.code===0?head.stdout.trim():null,dirty_files:dirty.code===0?parsePorcelainPaths(dirty.stdout):[],errors};
    const ready=(await probe(['gitnexus'],{cwd,env}))[0];
    if(!ready.ok)return {...base,gitnexus:ready.diagnostic?.includes('ENOENT')?'absent':'error',...(ready.diagnostic?.includes('ENOENT')?{}:{gitnexus_error:ready.diagnostic,status:'blocked'})};
    const result=await execute('gitnexus',['status'],{cwd,env,timeout:5000});
    const raw=result.stdout+'\n'+result.stderr,parsed=parseGitNexusStatus(raw);
    if(result.error||result.truncated||(result.code!==0&&!/Repository not indexed|stale KuzuDB index|Not a git repository/i.test(raw)))return {...base,gitnexus:'error',gitnexus_error:diagnostic(result),status:'blocked'};
    if(parsed.gitnexus==='unindexed'&&!/Repository not indexed|stale KuzuDB index|Not a git repository/i.test(raw))return {...base,gitnexus:'error',gitnexus_error:'unrecognized status output',status:'blocked'};
    return {...base,...parsed,current:parsed.current??base.current};
  } catch(error) {return {gitnexus:'error',status:'blocked',errors:[error.message],dirty_files:[]};}
}
function jsonLines(result) {
  const lines=result.stdout.split('\n');
  if(result.truncated)lines.pop();
  return lines.filter(Boolean).map(line=>JSON.parse(line));
}
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// shortcut: automatic definition verification covers Python and JS/TS; other languages stay unverified until structural rules are added.
function definitionRule(sym) {
  const extension=extname(sym.filePath),python=extension==='.py';
  const language=python?'Python':({'.js':'JavaScript','.jsx':'Jsx','.mjs':'JavaScript','.cjs':'JavaScript','.ts':'TypeScript','.tsx':'Tsx'})[extension];
  const kind=sym.id?.split(':')[0],kinds=python?{Function:'function_definition',Method:'function_definition',Class:'class_definition'}:{Function:'function_declaration',Method:'method_definition',Class:'class_declaration',Interface:'interface_declaration',TypeAlias:'type_alias_declaration',Variable:'variable_declarator'};
  if(!language||!kinds[kind])return null;
  const all=[{kind:kinds[kind]},{has:{field:'name',regex:`^${escapeRegex(sym.name)}$`}}];
  if(python&&kind==='Function')all.push({not:{inside:{kind:'class_definition',stopBy:'end'}}});
  if(kind==='Method') {
    const qualified=sym.id.slice(sym.id.lastIndexOf(':')+1).split('.');
    if(qualified.length!==2)return null;
    all.push({inside:{kind:python?'class_definition':'class_declaration',has:{field:'name',regex:`^${escapeRegex(qualified[0])}$`},stopBy:'end'}});
  }
  return {id:'definition',language,rule:{all}};
}
async function verifySymbolLive(sym,{cwd,env}) {
  const base={id:sym.id,name:sym.name,filePath:sym.filePath,indexed_line:sym.startLine,verified:false,live_line:null,definition_found:false,ambiguous:false};
  const rule=definitionRule(sym);
  if(!rule)return {...base,reason:'unsupported definition kind or language'};
  let path;
  try {path=realpathSync(resolve(cwd,sym.filePath));}catch(error){if(error.code==='ENOENT')return {...base,reason:'indexed file missing; search baseline for moves'};throw error;}
  const rel=relative(cwd,path);
  if(rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('indexed path escapes repository');
  const result=await execute('ast-grep',['scan','--inline-rules',JSON.stringify(rule),'--json=stream','--',path],{cwd,env});
  if(failed(result))throw new Error(`ast-grep: ${diagnostic(result)}`);
  const candidates=jsonLines(result).map(m=>m.range.start.line+1);
  const window=Math.max(3,Math.min(20,(sym.endLine??sym.startLine)-sym.startLine));
  const nearby=candidates.filter(line=>Math.abs(line-sym.startLine)<=window);
  return {...base,definition_found:candidates.length>0,ambiguous:nearby.length>1,verified:nearby.length===1,live_line:nearby.length===1?nearby[0]:null,...(nearby.length===0?{reason:'no definition within indexed line window; use baseline to locate moves'}:{})};
}
export async function query(concept,{cwd=process.cwd(),env=process.env,repo,limit=5,pattern,lang,regex=false}={}) {
  const st=await status({cwd,env});
  if(st.status==='blocked'||st.errors.length)return {...st,status:'blocked'};
  cwd=st.root;
  if(repo!==undefined)return {...st,status:'blocked',errors:['--repo is not supported; run from the target repository instead']};
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)return {...st,status:'blocked',errors:['limit must be an integer from 1 to 100']};
  if(!pattern&&(st.gitnexus==='fresh'||st.gitnexus==='stale')) {
    const result=await execute('gitnexus',['query','-l',String(limit),'--',concept],{cwd,env});
    try {
      if(result.code!==0||result.error||result.truncated)throw new Error(diagnostic(result));
      const parsed=JSON.parse(result.stdout);
      for(const field of ['process_symbols','definitions'])parsed[field]=(parsed[field]??[]).map(sym=>({...sym,startLine:Number.isInteger(sym.startLine)?sym.startLine+1:null,endLine:Number.isInteger(sym.endLine)?sym.endLine+1:null}));
      const symbols=[...parsed.process_symbols,...parsed.definitions];
      const intersecting_dirty_files=st.dirty_files.filter(file=>symbols.some(sym=>sym.filePath===file));
      const stale_overlay=st.gitnexus==='stale'||intersecting_dirty_files.length>0;
      const output={...parsed,...st,mode:'gitnexus',stale_overlay,intersecting_dirty_files};
      if(!stale_overlay)return output;
      const missing_tools=(await probe(['ast-grep'],{cwd,env})).filter(row=>!row.ok);
      if(missing_tools.length)return {...output,status:'blocked',missing_tools};
      const seen=new Set();output.verified_symbols=[];
      for(const sym of symbols) {
        if(!sym.name||!sym.filePath||sym.startLine===null||sym.id?.startsWith('File:'))continue;
        const key=JSON.stringify([sym.id,sym.filePath,sym.name,sym.startLine]);
        if(seen.has(key))continue;seen.add(key);
        try {output.verified_symbols.push(await verifySymbolLive(sym,{cwd,env}));}
        catch(error){output.errors.push(error.message);output.status='blocked';}
      }
      return output;
    }catch(error){return {...st,status:'blocked',gitnexus_error:error.message,errors:[`gitnexus query: ${error.message}`]};}
  }
  const missing_tools=(await probe(['rg','ast-grep'],{cwd,env})).filter(row=>!row.ok);
  const output={...st,mode:'baseline',stale_overlay:false,missing_tools,rg_matches:[],ast_matches:[],truncated:false};
  if(missing_tools.length)return {...output,status:'blocked'};
  const rg=await execute('rg',['--json','--max-count','100',...(regex?[]:['--fixed-strings']),'--',concept,'.'],{cwd,env});
  const perFile=new Map();
  try {
    if(rg.error||(!rg.truncated&&![0,1].includes(rg.code)))throw new Error(`rg: ${diagnostic(rg)}`);
    const records=jsonLines(rg);let total=0;
    for(const record of records)if(record.type==='match') {
      const data=record.data,file=data.path.text??Buffer.from(data.path.bytes,'base64').toString();
      perFile.set(file,(perFile.get(file)??0)+1);total++;
      if(output.rg_matches.length<Math.min(limit,200))output.rg_matches.push({file:file.replace(/^\.\//,''),line:data.line_number,text:(data.lines.text??Buffer.from(data.lines.bytes,'base64').toString()).trim().slice(0,1000)});
    }
    output.truncated ||= rg.truncated||total>output.rg_matches.length||[...perFile.values()].some(n=>n>=100);
  }catch(error){output.errors.push(error.message);}
  if(pattern&&!output.errors.length) {
    // AST hits are scoped to files the query's rg search hit; no rg hits means no AST scope.
    const files=[...perFile.keys()].slice(0,500);
    output.ast_scope='rg_files';
    if(perFile.size>files.length)output.truncated=true;
    if(files.length) {
      const ast=await execute('ast-grep',['run','-p',pattern,'--json=stream',...(lang?['-l',lang]:[]),'--',...files],{cwd,env});
      try {
        if(ast.error||(!ast.truncated&&![0,1].includes(ast.code)))throw new Error(`ast-grep: ${diagnostic(ast)}`);
        if(/Pattern contains an ERROR node|Cannot parse|invalid pattern|multiple AST nodes/i.test(ast.stderr))throw new Error(`ast-grep: invalid pattern: ${ast.stderr.trim().split('\n')[0]}`);
        const records=jsonLines(ast),cap=Math.min(limit,200);output.ast_matches=records.slice(0,cap).map(m=>({file:m.file.replace(/^\.\//,''),line:m.range.start.line+1,text:m.text.slice(0,1000)}));
        output.truncated ||= ast.truncated||records.length>cap;
      }catch(error){output.errors.push(error.message);}
    }
  }
  output.status=output.errors.length?'blocked':'ok';
  return output;
}
const parseCliArgs = (argv) => {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') { positional.push(...argv.slice(i+1)); break;
    } else if (arg === '--regex') { flags.regex=true;
    } else if (arg === '--repo' || arg === '-r') {
      flags.repo = argv[++i]
    } else if (arg === '--limit' || arg === '-l') {
      flags.limit = Number(argv[++i])
    } else if (arg === '--pattern' || arg === '-p') {
      flags.pattern = argv[++i]
    } else if (arg === '--lang') {
      flags.lang = argv[++i]
    } else if (arg === '--cwd') {
      flags.cwd = resolve(argv[++i])
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

const main = async () => {
  const { positional, flags } = parseCliArgs(process.argv.slice(2))
  const subcommand = positional[0] ?? 'status'
  const cwd = flags.cwd ?? process.cwd()

  if (subcommand === 'status') {
    const result = await status({ cwd })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if(result.status==='blocked')process.exitCode=2;
    return
  }

  if (subcommand === 'query') {
    const concept = positional[1]
    if (!concept) {
      process.stderr.write('Usage: cartographer.mjs query "<concept>" [--limit <n>] [--pattern <p>] [--lang <l>] [--regex]\n')
      process.exit(1)
    }
    const result = await query(concept, {
      cwd,
      repo: flags.repo,
      limit: flags.limit ?? 5,
      pattern: flags.pattern,
      lang: flags.lang,
      regex: flags.regex,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if(result.status==='blocked')process.exitCode=2;
    return
  }

  process.stderr.write(`Unknown subcommand: ${subcommand}. Expected "status" or "query".\n`)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
