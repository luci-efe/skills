import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { parseGitNexusStatus, parsePorcelainPaths, status, query, execute } from '../skills/cartographer/scripts/cartographer.mjs';

const fixtures=resolve(import.meta.dirname,'fixtures/cartographer');
const fixture=name=>readFileSync(join(fixtures,name),'utf8');
const fresh=fixture('status-fresh.txt'),stale=fixture('status-stale.txt');
const method=JSON.parse(fixture('method-match.jsonl'));
const symbol={id:'Method:flow.py:Second.save',name:'save',filePath:'flow.py',startLine:5,endLine:6};
const data={processes:[],process_symbols:[symbol],definitions:[]}; // Synthetic query using the captured source/AST location.
const git=(cwd,args)=>childProcess.execFileSync('git',args,{cwd,stdio:'pipe',timeout:5000});
function repo() {
  const cwd=mkdtempSync(join(tmpdir(),'cartographer repo '));
  git(cwd,['init']);git(cwd,['config','user.email','test@example.invalid']);git(cwd,['config','user.name','Test']);
  copyFileSync(join(fixtures,'flow.py'),join(cwd,'flow.py'));
  git(cwd,['add','.']);git(cwd,['-c','commit.gpgsign=false','commit','-m','fixture']);
  return cwd;
}
// Native Node children keep tool protocol tests portable; actual CLI captures live in fixtures.
function tools(t,{index='stale',payload=data,ast=[method],rg=[],queryError=false}={}) {
  const spawn=childProcess.spawn,calls=[],outDir=mkdtempSync(join(tmpdir(),'carto tool output '));
  const mocked=mock.method(childProcess,'spawn',(bin,args,options)=>{
    if(!['gitnexus','ast-grep','rg'].includes(bin))return spawn(bin,args,options);
    if(bin==='ast-grep'&&ast==='real')return spawn(bin,args,options);
    calls.push([bin,...args]);
    if((bin==='gitnexus'&&index==='absent')||(bin==='ast-grep'&&ast===null)||(bin==='rg'&&rg===null))return spawn(join(tmpdir(),'missing-carto-tool-9dd6',bin),args,options);
    let out='',code=0;
    if(args[0]==='--version')out=`${bin} fixture`;
    else if(bin==='gitnexus') {
      if(args[0]==='status')out=index==='fresh'?fresh:index==='stale'?stale:'Repository not indexed.';
      else if(queryError){out='query failed';code=2;}else out=typeof payload==='string'?payload:JSON.stringify(payload);
    } else out=(bin==='ast-grep'?ast:rg).map(x=>JSON.stringify(x)).join('\n')+'\n';
    const output=join(outDir,String(calls.length));writeFileSync(output,out);
    return spawn(process.execPath,['-e',`process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(output)}));process.exitCode=${code}`],options);
  });
  syncBuiltinESMExports();
  t.after(()=>{mocked.mock.restore();syncBuiltinESMExports();});
  return calls;
}

test('real status captures parse fresh, stale and unindexed',()=>{
  assert.deepEqual(parseGitNexusStatus(fresh),{gitnexus:'fresh',indexed:'9ea8a9d',current:'9ea8a9d'});
  assert.equal(parseGitNexusStatus(stale).gitnexus,'stale');
  assert.equal(parseGitNexusStatus(fixture('status-unindexed.txt')).gitnexus,'unindexed');
});
test('D14 NUL porcelain preserves spaces, unicode, arrows and both rename paths',()=>{
  assert.deepEqual(parsePorcelainPaths(' M src/ñ space.py\0R  new -> file.py\0old\nname.py\0?? x.py\0'),['src/ñ space.py','new -> file.py','old\nname.py','x.py']);
});
test('D1 verifies the indexed method, not the first same-named definition',async t=>{
  const cwd=repo(),calls=tools(t);const result=await query('save',{cwd});
  assert.equal(result.verified_symbols[0].verified,true);assert.equal(result.verified_symbols[0].live_line,6);assert.equal(result.verified_symbols[0].indexed_line,6);
  const rule=JSON.parse(calls.find(x=>x[1]==='scan')[3]);
  assert.equal(rule.rule.all[0].kind,'function_definition');assert.equal(rule.rule.all[2].inside.has.regex,'^Second$');
});
test('D1 ambiguous duplicates and distant definitions never verify',async t=>{
  tools(t,{ast:[method,{...method,range:{start:{line:6}}}]});
  const result=await query('save',{cwd:repo()});assert.equal(result.verified_symbols[0].ambiguous,true);assert.equal(result.verified_symbols[0].verified,false);
});
test('D1 stale line far outside the window is not silently replaced',async t=>{
  tools(t,{payload:{process_symbols:[{...symbol,startLine:100,endLine:101}]}});
  const result=await query('save',{cwd:repo()});assert.equal(result.verified_symbols[0].definition_found,true);assert.equal(result.verified_symbols[0].verified,false);assert.equal(result.verified_symbols[0].live_line,null);
});
test('D2 normalizes fresh start/end lines and the captured context offset',async t=>{
  tools(t,{index:'fresh'});const result=await query('save',{cwd:repo()});
  assert.equal(result.stale_overlay,false);assert.equal(result.process_symbols[0].startLine,6);assert.equal(result.process_symbols[0].endLine,7);
  const captured=JSON.parse(fixture('context-result.json')).symbol;
  assert.match(fixture('flow.py').split('\n')[captured.startLine],/^def refund_order/);
});
test('D3 missing tools block with actionable install commands',async t=>{
  tools(t,{index:'absent',rg:null,ast:null});const result=await query('refundOrder(',{cwd:repo()});
  assert.equal(result.status,'blocked');assert.deepEqual(result.missing_tools.map(x=>x.id),['rg','ast-grep']);assert.ok(result.missing_tools.every(x=>x.missing_install));
});
test('D3 literal search, bounded matches and captured baseline records',async t=>{
  const records=fixture('rg-match.jsonl').trim().split('\n').map(JSON.parse);
  const calls=tools(t,{index:'absent',rg:records});const result=await query('save(',{cwd:repo(),pattern:'def $NAME($$$): $$$',lang:'py'});
  assert.equal(result.mode,'baseline');assert.equal(result.status,'ok');assert.ok(result.rg_matches.length>0);assert.equal(result.ast_matches[0].line,6);
  const args=calls.find(x=>x[0]==='rg'&&x[1]!=='--version');assert.ok(args.includes('--fixed-strings'));assert.ok(args.includes('--max-count'));assert.equal(args[args.indexOf('--')+1],'save(');
});
test('D3 large streamed output is retained and explicitly truncated',async t=>{
  const record={type:'match',data:{path:{text:'big.js'},line_number:1,lines:{text:'refund '.repeat(200)}}};
  tools(t,{index:'absent',rg:Array.from({length:4000},()=>record)});
  const result=await query('refund',{cwd:repo()});assert.ok(result.rg_matches.length>0);assert.ok(result.rg_matches.length<=200);assert.equal(result.truncated,true);assert.equal(result.status,'ok');
});
test('D3 a failed or malformed GitNexus query is explicit and does not become baseline',async t=>{
  tools(t,{queryError:true});const result=await query('save',{cwd:repo()});assert.equal(result.status,'blocked');assert.match(result.gitnexus_error,/exit 2/);assert.equal(result.mode,undefined);
});
test('D4 subdirectory queries use root paths and real dirty intersections',async t=>{
  const cwd=repo();mkdirSync(join(cwd,'nested'));writeFileSync(join(cwd,'flow.py'),fixture('flow.py')+'# dirty\n');tools(t,{index:'fresh'});
  const result=await query('save',{cwd:join(cwd,'nested')});assert.equal(result.stale_overlay,true);assert.deepEqual(result.intersecting_dirty_files,['flow.py']);assert.equal(result.verified_symbols[0].live_line,6);
});
test('D5 comments and string mentions do not verify a deleted definition',async t=>{
  const cwd=repo();writeFileSync(join(cwd,'flow.py'),'# def save(self):\ntext = "def save(self):"\n');tools(t,{ast:[]});
  const result=await query('save',{cwd});assert.equal(result.verified_symbols[0].verified,false);assert.equal(result.verified_symbols[0].definition_found,false);
});
test('D6 child execution times out explicitly',async()=>{
  const result=await execute(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:50});assert.equal(result.error,'timeout');
});
test('D7 captured degraded query JSON is preserved honestly',async t=>{
  const capture=JSON.parse(fixture('query-result.json'));tools(t,{index:'fresh',payload:capture});
  const result=await query('refund',{cwd:repo()});assert.equal(result.warning,capture.warning);assert.deepEqual(result.processes,capture.processes);
});
test('D8 and D13 flags precede separator; only read-only GitNexus commands run',async t=>{
  const calls=tools(t,{index:'fresh'});await status({cwd:repo()});await query('--help',{cwd:repo()});
  assert.deepEqual(calls.find(x=>x[1]==='query'),['gitnexus','query','-l','5','--','--help']);
  assert.ok(calls.filter(x=>x[0]==='gitnexus').every(x=>['--version','status','query'].includes(x[1])));
});
test('D9 cross-repository selectors are rejected before query',async t=>{
  const calls=tools(t);const result=await query('save',{cwd:repo(),repo:'another'});assert.equal(result.status,'blocked');assert.match(result.errors[0],/--repo/);assert.equal(calls.some(x=>x[1]==='query'),false);
});
test('D14 real git status handles unicode paths and renames',async t=>{
  const cwd=repo();git(cwd,['mv','flow.py','ñ space.py']);tools(t,{index:'fresh',payload:{process_symbols:[{...symbol,id:'Method:ñ space.py:Second.save',filePath:'ñ space.py'}]}});
  const result=await query('save',{cwd});assert.deepEqual(result.intersecting_dirty_files,['ñ space.py']);assert.equal(result.verified_symbols[0].verified,true);
});
test('explicit pattern selects baseline even with a fresh index',async t=>{
  const calls=tools(t,{index:'fresh'});const result=await query('save',{cwd:repo(),pattern:'def $NAME($$$): $$$',lang:'py'});
  assert.equal(result.mode,'baseline');assert.equal(calls.some(x=>x[1]==='query'),false);
});
test('malformed GitNexus output is a blocked error',async t=>{
  tools(t,{payload:'not JSON'});const result=await query('save',{cwd:repo()});assert.equal(result.status,'blocked');assert.ok(result.gitnexus_error);
});

test('N1 real ast-grep does not substitute a class method for a deleted top-level function',async t=>{
  const cwd=repo();writeFileSync(join(cwd,'flow.py'),'class K:\n    def standalone(self):\n        return 1\n');
  tools(t,{ast:'real',payload:{process_symbols:[{id:'Function:flow.py:standalone',name:'standalone',filePath:'flow.py',startLine:1,endLine:2}]}});
  const result=await query('standalone',{cwd});
  assert.notEqual(result.status,'blocked',JSON.stringify(result));
  assert.equal(result.verified_symbols[0].verified,false);
  assert.equal(result.verified_symbols[0].definition_found,false);
  writeFileSync(join(cwd,'flow.py'),'def standalone():\n    return 1\n');
  const live=await query('standalone',{cwd});assert.equal(live.verified_symbols[0].verified,true);assert.equal(live.verified_symbols[0].live_line,1);
});
function plain(files) {
  const cwd=mkdtempSync(join(tmpdir(),'carto plain '));
  for(const [name,text] of Object.entries(files))writeFileSync(join(cwd,name),text);
  return cwd;
}
test('baseline scopes AST hits to files the query hit, honours limit and reports ok',async()=>{
  const cwd=plain({'hit.js':'refund(1)\nrefund(2)\nrefund(3)\n','other.js':'call(1)\ncall(2)\n'});
  const r=await query('refund',{cwd,pattern:'$F($$$)',lang:'js',limit:2});
  assert.equal(r.status,'ok');assert.equal(r.rg_matches.length,2);assert.equal(r.ast_matches.length,2);
  assert.ok(r.ast_matches.every(m=>m.file==='hit.js'));assert.equal(r.truncated,true);
  const all=await query('refund',{cwd,pattern:'$F($$$)',lang:'js',limit:10});
  assert.equal(all.rg_matches.length,3);assert.equal(all.ast_matches.length,3);assert.equal(all.truncated,false);
});
test('baseline malformed ast-grep pattern is blocked with an error',async()=>{
  const cwd=plain({'a.js':'foo(1)\n'});
  const r=await query('foo',{cwd,pattern:'foo(',lang:'js'});
  assert.equal(r.status,'blocked');assert.match(r.errors.join(),/invalid pattern/);
});
test('baseline default limit is 50 and an explicit limit is honoured with truncated',async()=>{
  const cwd=plain({'big.js':Array.from({length:60},(_,i)=>`needle(${i})`).join('\n')+'\n'});
  const d=await query('needle',{cwd});
  assert.equal(d.rg_matches.length,50);assert.equal(d.truncated,true);
  const few=await query('needle',{cwd,limit:60});assert.equal(few.rg_matches.length,60);assert.equal(few.truncated,false);
  assert.equal((await query('needle',{cwd,limit:101})).status,'blocked');
});
test('baseline runs ast-grep on the whole repo when rg has no hits but a pattern is given',async()=>{
  const cwd=plain({'a.js':'foo(1)\nfoo(2)\n','b.js':'bar(1)\n'});
  const r=await query('no-such-concept',{cwd,pattern:'foo($A)',lang:'js'});
  assert.equal(r.status,'ok');assert.equal(r.ast_scope,'repo');assert.equal(r.rg_matches.length,0);assert.equal(r.ast_matches.length,2);
  assert.equal((await query('foo',{cwd,pattern:'foo($A)',lang:'js'})).ast_scope,'rg_files');
});
