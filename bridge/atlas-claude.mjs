#!/usr/bin/env node
// Headless `claude -p` runs never render a status line, so the status line bridge never sees
// their limits. With `--output-format stream-json --verbose` the official CLI prints a
// rate_limit_event per response instead. This wrapper runs the CLI unchanged and copies only the
// window utilization and reset of those events into the files Atlas already imports.
//
//   node atlas-claude.mjs -- /abs/path/claude -p ... --output-format stream-json --verbose
//       stdout, stderr, stdin and the exit status are the CLI's own, byte for byte
//   node atlas-claude.mjs --result-json -- /abs/path/claude -p ... --output-format stream-json --verbose
//       stdout carries only the final type=result line, like --output-format json would
//
// Caller flags are never rewritten and a failed run is never retried. Complete readings (both
// windows) replace the snapshot ATLAS_CLI_LIMIT_FILE, default session-atlas-cli-limits.json in
// the Claude configuration directory; every changed reading, partial ones included, is also
// queued in ATLAS_RATE_LIMIT_INBOX for the limit history. Storage problems never fail the run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {CLI_FILE,INBOX_DIR,rateInfoWindows} from '../lib/claude-limits.mjs';
const RATE_LINE_MAX=64*1024,RESULT_LINE_MAX=32*1024*1024,FORWARDED=['SIGTERM','SIGINT','SIGHUP'];
const RATE_MARK=Buffer.from('"rate_limit_event"'),RESULT_MARK=Buffer.from('"result"');

function fail(message,code) {process.stderr.write(`atlas-claude: ${message}\n`);process.exitCode=code;}
const separator=process.argv.indexOf('--'),options=separator===-1?process.argv.slice(2):process.argv.slice(2,separator),[binary,...args]=separator===-1?[]:process.argv.slice(separator+1);
const resultMode=options.includes('--result-json');
if(options.some(option=>option!=='--result-json')||!binary)fail('usage: atlas-claude.mjs [--result-json] -- <absolute claude binary> <args>',2);
// An absolute path keeps the wrapper from resolving itself when it is installed as `claude`.
else if(!path.isAbsolute(binary))fail(`${binary} is not an absolute path`,2);
else run();

function target() {
 return process.env.ATLAS_CLI_LIMIT_FILE||path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),CLI_FILE);
}
function writePrivate(file,data) {
 const tmp=`${file}.${process.pid}-${randomUUID()}.tmp`;
 try {fs.writeFileSync(tmp,data,{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
 catch(e) {try{fs.unlinkSync(tmp);}catch{}throw e;}
}
let lastQueued='';
function record(windows) {
 const keys=Object.keys(windows);
 if(!keys.length)return;
 const file=target(),observedAtMs=Date.now(),state={version:1,source:'claude-cli',observedAtMs,rate_limits:windows},key=JSON.stringify(windows);
 let previous='';
 try{previous=JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8')).rate_limits);}catch{}
 // The inbox is committed first: a snapshot that already shows a reading suppresses its queue
 // entry, so it may only advance once that reading is safely queued.
 if(key!==lastQueued&&key!==previous)try {
  const dir=process.env.ATLAS_RATE_LIMIT_INBOX||path.join(path.dirname(file),INBOX_DIR),id=`${observedAtMs}-${process.pid}-${randomUUID()}`;
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  writePrivate(path.join(dir,`${id}.json`),JSON.stringify({...state,id}));
  lastQueued=key;
 }catch{return;}
 if(keys.length===2)try {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  writePrivate(file,JSON.stringify(state));
 }catch{}
}
function rateLine(line) {
 if(line.length>RATE_LINE_MAX||!line.includes(RATE_MARK))return;
 try {const x=JSON.parse(line.toString('utf8'));if(x?.type==='rate_limit_event')record(rateInfoWindows(x.rate_limit_info));}catch{}
}
// Splits on newline bytes, so multibyte characters split across chunks stay intact. A line
// longer than `max` is skipped as a whole; only one bounded line is ever held in memory.
function splitter(max,onLine) {
 let parts=[],size=0,overflow=false;
 const add=part=>{if(overflow||!part.length)return;if(size+part.length>max){overflow=true;parts=[];size=0;return;}parts.push(part);size+=part.length;};
 const flush=()=>{if(!overflow&&size)onLine(Buffer.concat(parts,size));else if(overflow)onLine(null);parts=[];size=0;overflow=false;};
 return {
  push(chunk){let start=0;for(let nl=chunk.indexOf(10);nl!==-1;nl=chunk.indexOf(10,start)){add(chunk.subarray(start,nl));flush();start=nl+1;}add(chunk.subarray(start));},
  end:flush
 };
}

function run() {
 const streaming=args.some((arg,i)=>arg==='--output-format=stream-json'||arg==='--output-format'&&args[i+1]==='stream-json');
 let result=null,oversized=false,outputBroken=false,spawnFailed=false;
 const tap=resultMode?splitter(RESULT_LINE_MAX,line=>{
  if(!line){oversized=true;return;}
  if(streaming)rateLine(line);
  if(line.includes(RESULT_MARK))try{if(JSON.parse(line.toString('utf8'))?.type==='result')result=line;}catch{}
 }):streaming?splitter(RATE_LINE_MAX,line=>{if(line)rateLine(line);}):null;
 const child=spawn(binary,args,{stdio:['inherit','pipe','inherit']});
 const forward=signal=>{try{child.kill(signal);}catch{}};
 for(const signal of FORWARDED)process.on(signal,forward);
 process.stdout.on('error',()=>{outputBroken=true;child.stdout.resume();});
 child.stdout.on('data',chunk=>{
  // Storage is best effort and must never interrupt the CLI's own output.
  try{tap?.push(chunk);}catch{}
  if(resultMode||outputBroken)return;
  if(!process.stdout.write(chunk)){child.stdout.pause();process.stdout.once('drain',()=>child.stdout.resume());}
 });
 child.on('error',e=>{spawnFailed=true;fail(`cannot start ${binary}: ${e.code||e.message}`,e.code==='ENOENT'?127:126);});
 child.on('close',(code,signal)=>{
  if(spawnFailed)return;
  try{tap?.end();}catch{}
  if(resultMode&&result===null&&code===0&&!signal)return fail(oversized?'the result line exceeds 32 MB':'the CLI exited without a result line',1);
  const finish=()=>{
   if(!signal){process.exitCode=code;return;}
   // Re-raise the child's signal so the caller sees the same termination.
   for(const name of FORWARDED)process.off(name,forward);
   process.exitCode=128+(os.constants.signals[signal]||0);
   process.kill(process.pid,signal);
  };
  if(resultMode&&result!==null&&!outputBroken)process.stdout.write(Buffer.concat([result,Buffer.from('\n')]),finish);
  else process.stdout.write('',finish);
 });
}
