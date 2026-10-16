import { spawn } from 'node:child_process';
export function execute(argv,{cwd,timeoutMs=120000,maxOutput=1024*1024,env=process.env}={}) {
  if(!Array.isArray(argv)||!argv.length||argv.some(a=>typeof a!=='string'||a.includes('\0'))||!argv[0])throw new Error('Command must be a nonempty argv array');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>3600000)throw new Error('Invalid check timeout');
  return new Promise(resolve=>{
    const started_at=new Date().toISOString();const chunks=[];let bytes=0,diagnostic=null,finished=false;
    const child=spawn(argv[0],argv.slice(1),{cwd,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const finish=(exit)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({exit,started_at,ended_at:new Date().toISOString(),output:Buffer.concat(chunks).toString('utf8'),diagnostic});};
    const halt=reason=>{diagnostic=reason;child.kill('SIGKILL');child.stdout.destroy();child.stderr.destroy();finish(null);};
    const timer=setTimeout(()=>halt('Check timed out'),timeoutMs);
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{if(finished)return;const keep=chunk.subarray(0,Math.max(0,maxOutput-bytes));chunks.push(keep);bytes+=chunk.length;if(bytes>maxOutput)halt('Check output limit exceeded');});
    child.on('error',error=>{diagnostic=`Cannot execute command: ${error.code??error.message}`;finish(null);});
    child.on('close',(code,signal)=>{if(signal)diagnostic??=`Check killed by ${signal}`;finish(code);});
  });
}
