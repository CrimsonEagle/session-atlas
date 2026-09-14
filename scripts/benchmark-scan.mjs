// Synthetic logs only. "Initial" means no application cache, not a cold OS disk cache.
// Optional argument: a second Store module to compare against the current implementation.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Store} from '../lib/store.mjs';

const variants=[{name:'current',Store}];
if(process.argv[2])variants.unshift({name:'baseline',Store:(await import(pathToFileURL(path.resolve(process.argv[2])).href)).Store});
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-benchmark-'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const fingerprint=snapshot=>createHash('sha256').update(JSON.stringify(snapshot.sessions.map(s=>({...s,events:[...s.events].sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
const line=(session,index,padding=1536)=>JSON.stringify({type:'assistant',timestamp:'2026-09-11T10:00:00Z',sessionId:session,cwd:dir,message:{id:`${session}-${index}`,model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:10},content:[{type:'text',text:'x'.repeat(padding)}]}})+'\n';
const expected=new Map(),results=new Map();
try {
 const logs=path.join(dir,'logs');await fs.mkdir(logs);
 for(let folder=0;folder<24;folder++) {
  const root=path.join(logs,String(folder));await fs.mkdir(root);
  await Promise.all(Array.from({length:8},async(_,file)=>{
   const id=`s-${folder}-${file}`;await fs.writeFile(path.join(root,`${id}.jsonl`),Array.from({length:64},(_,i)=>line(id,i)).join(''));
  }));
 }
 const growing=path.join(logs,'growing.jsonl'),original=Array.from({length:4096},(_,i)=>line('growing',i,2048)).join('');
 const settings={claudeRoots:[logs],codexRoots:[],prices:{}};
 for(let round=0;round<3;round++)for(const variant of round%2?[...variants].reverse():variants) {
  await fs.writeFile(growing,original);
  const cache=path.join(dir,`${variant.name}-${round}.json`),store=new variant.Store(cache);
  async function measure(phase,target=store) {
   const begin=performance.now(),snapshot=await target.scan(settings),elapsedMs=performance.now()-begin;
   const hash=fingerprint(snapshot);assert.equal(snapshot.stats.warnings.length,0);
   if(expected.has(phase))assert.equal(hash,expected.get(phase),`${variant.name}: changed data in ${phase}`);else expected.set(phase,hash);
   const key=`${variant.name}/${phase}`;if(!results.has(key))results.set(key,[]);
   results.get(key).push({elapsedMs,scanMs:snapshot.stats.durationMs,bytes:snapshot.stats.bytes});
  }
  await measure('initial');
  for(let i=0;i<7;i++)await measure('unchanged');
  const restored=new variant.Store(cache);await restored.load();await measure('after-cache-load',restored);
  await fs.appendFile(growing,line('growing','appended'));
  await measure('append');
 }
 const rows=[...results].map(([scenario,samples])=>({scenario,runs:samples.length,totalMs:+median(samples.map(s=>s.elapsedMs)).toFixed(2),scanMs:median(samples.map(s=>s.scanMs)),readMiB:+(median(samples.map(s=>s.bytes))/1024/1024).toFixed(2)}));
 console.log(JSON.stringify({fixture:{files:193,events:16384,rounds:3},note:'Median; initial has no application cache, OS caches may be warm. totalMs includes persistence and snapshot; scanMs is the existing UI metric. Session content is checked across every run and variant.',results:rows},null,2));
}finally {
 if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-benchmark-'))throw Error('Unexpected cleanup path');
 await fs.rm(dir,{recursive:true,force:true});
}
