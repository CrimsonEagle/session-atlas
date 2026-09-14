import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../lib/store.mjs';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-test-'));t.after(async()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-test-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});});const logs=path.join(dir,'logs');await fs.mkdir(logs);return {dir,logs,settings:{claudeRoots:[logs],codexRoots:[],prices:{}}};}
const line=(id,output=10)=>JSON.stringify({type:'assistant',timestamp:'2026-09-11T10:00:00Z',sessionId:'session',cwd:'C:/example',message:{id,model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:output},content:[{type:'text',text:'PRIVATE CONTENT SHOULD NEVER BE CACHED'}]}})+'\n';
const codexLine=value=>JSON.stringify(value)+'\n';
const codexMeta=(id='thread')=>codexLine({type:'session_meta',timestamp:'2026-09-11T10:00:00Z',payload:{id,timestamp:'2026-09-11T10:00:00Z',cwd:'C:/example'}});
const codexCumulative=(input=100)=>codexLine({type:'event_msg',timestamp:'2026-09-11T10:01:00Z',payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,output_tokens:10},total_token_usage:{input_tokens:input,output_tokens:10}}}});
const codexRecord=(id='thread',response='response',input=100)=>codexLine({type:'token_usage_record',timestamp:'2026-09-11T10:01:00Z',payload:{thread_id:id,response_id:response,usage:{input_tokens:input,output_tokens:10}}});
test('Incremental scan handles split UTF-8 lines, cache reload and historical retention',async t=>{
 const {dir,logs,settings}=await fixture(t);const file=path.join(logs,'session.jsonl'),cache=path.join(dir,'cache.json');const s=new Store(cache);
 await fs.writeFile(file,line('one')+line('twö').slice(0,60));let x=await s.scan(settings);assert.equal(x.sessions[0].events.length,1);
 const unchanged=await s.scan(settings);assert.equal(unchanged.stats.bytes,0);assert.equal(unchanged.stats.changed,0);
 await fs.appendFile(file,line('twö').slice(60));x=await s.scan(settings);assert.equal(x.sessions[0].events.length,2);
 const saved=await fs.readFile(cache,'utf8');assert.ok(!saved.includes('PRIVATE CONTENT'));const restored=new Store(cache);await restored.load();assert.equal(restored.snapshot(settings).sessions[0].events.length,2);
 await fs.unlink(file);x=await restored.scan(settings);assert.equal(x.sessions[0].events.length,2);
 assert.equal(restored.snapshot({...settings,claudeRoots:[]}).sessions.length,0);
});
test('Truncated files restart parsing; malformed complete lines do not abort the scan',async t=>{
 const {dir,logs,settings}=await fixture(t);const file=path.join(logs,'test.jsonl');const s=new Store(path.join(dir,'cache.json'));
 await fs.writeFile(file,line('one')+line('two'));await s.scan(settings);await fs.writeFile(file,'bad json\n'+line('new'));const x=await s.scan(settings);
 assert.equal(x.sessions[0].events.length,1);assert.equal(x.sessions[0].malformed,1);
});
test('A larger rewritten file is reimported instead of being treated as an append',async t=>{
 const {dir,logs,settings}=await fixture(t),file=path.join(logs,'rewrite.jsonl'),cache=path.join(dir,'cache.json'),s=new Store(cache);
 await fs.writeFile(file,line('old'));await s.scan(settings);
 const replacement=JSON.stringify({type:'assistant',timestamp:'2026-09-11T10:00:00Z',sessionId:'session',cwd:'C:/example',padding:'x'.repeat(500),message:{id:'replacement',model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:10}}})+'\n'+line('new');
 await fs.writeFile(file,replacement);let x=await s.scan(settings);
 assert.deepEqual(x.sessions[0].events.map(event=>event.id).sort(),['claude:new','claude:replacement']);assert.equal(x.sessions[0].malformed,0);
 const restored=new Store(cache);await restored.load();x=restored.snapshot(settings);assert.deepEqual(x.sessions[0].events.map(event=>event.id).sort(),['claude:new','claude:replacement']);
});
test('Version 2 cache entries are safely reimported and migrated',async t=>{
 const {dir,logs,settings}=await fixture(t),file=path.join(logs,'migration.jsonl'),cache=path.join(dir,'cache.json'),first=new Store(cache);
 await fs.writeFile(file,line('one'));await first.scan(settings);
 const saved=JSON.parse(await fs.readFile(cache,'utf8'));saved.version=2;delete saved.files[file].prefixHash;await fs.writeFile(cache,JSON.stringify(saved));
 const restored=new Store(cache);await restored.load();const x=await restored.scan(settings);
 assert.equal(x.sessions[0].events.length,1);assert.match(restored.files[file].prefixHash,/^[a-f0-9]{64}$/);assert.equal(JSON.parse(await fs.readFile(cache,'utf8')).version,3);
});
test('A valid final JSON record without a newline is counted once',async t=>{
 const {dir,logs,settings}=await fixture(t);const file=path.join(logs,'tail.jsonl'),s=new Store(path.join(dir,'cache.json'));
 await fs.writeFile(file,line('one').trimEnd());let x=await s.scan(settings);assert.equal(x.sessions[0].events.length,1);
 await fs.appendFile(file,'\n'+line('two'));x=await s.scan(settings);assert.equal(x.sessions[0].events.length,2);
});
test('Duplicate files and concurrent refresh requests do not multiply usage',async t=>{
 const {dir,logs,settings}=await fixture(t);await fs.writeFile(path.join(logs,'one.jsonl'),line('shared'));await fs.writeFile(path.join(logs,'two.jsonl'),line('shared'));
 const s=new Store(path.join(dir,'cache.json'));const [a,b]=await Promise.all([s.scan(settings),s.scan(settings)]);assert.equal(s.scanCount,1);assert.equal(a.sessions.length,1);assert.equal(b.sessions[0].events.length,1);
});
test('Codex response records supersede cumulative usage across all files of a session',async t=>{
 const {dir,logs}=await fixture(t),active=path.join(logs,'sessions'),archive=path.join(logs,'archived_sessions');await fs.mkdir(active);await fs.mkdir(archive);
 await fs.writeFile(path.join(active,'thread.jsonl'),codexMeta()+codexCumulative());
 await fs.writeFile(path.join(archive,'thread-copy.jsonl'),codexMeta()+codexCumulative()+codexRecord());
 const settings={claudeRoots:[],codexRoots:[logs],prices:{}},cache=path.join(dir,'cache.json'),s=new Store(cache);let x=await s.scan(settings);
 assert.equal(x.sessions.length,1);assert.equal(x.sessions[0].events.length,1);assert.equal(x.sessions[0].events[0].input,100);
 s.files=Object.fromEntries(Object.entries(s.files).reverse());x=s.snapshot(settings);assert.equal(x.sessions[0].events.length,1);assert.equal(x.sessions[0].events[0].input,100);
 const restored=new Store(cache);await restored.load();x=restored.snapshot(settings);assert.equal(x.sessions[0].events.length,1);assert.equal(x.sessions[0].events[0].input,100);
});
test('Event identifiers only deduplicate within their own session',async t=>{
 const {dir,logs}=await fixture(t);await fs.writeFile(path.join(logs,'one.jsonl'),codexMeta('one')+codexRecord('one','shared'));
 await fs.writeFile(path.join(logs,'two.jsonl'),codexMeta('two')+codexRecord('two','shared'));
 const settings={claudeRoots:[],codexRoots:[logs],prices:{}},s=new Store(path.join(dir,'cache.json')),x=await s.scan(settings);
 assert.equal(x.sessions.length,2);assert.equal(x.sessions.reduce((sum,session)=>sum+session.events.length,0),2);
});
test('Git worktree resolves to common repository root',async t=>{
 const {dir}=await fixture(t),repo=path.join(dir,'repo'),worktree=path.join(dir,'worktree'),gitDir=path.join(repo,'.git','worktrees','branch');await fs.mkdir(gitDir,{recursive:true});await fs.mkdir(worktree);await fs.writeFile(path.join(worktree,'.git'),`gitdir: ${gitDir}`);await fs.writeFile(path.join(gitDir,'commondir'),'../..');
 // repository() canonicalizes its result, so the expectation has to be canonical too: a TMP
 // pointing at an 8.3 short path would otherwise fail the comparison on spelling alone.
 const s=new Store(path.join(dir,'cache.json'));assert.equal(await s.repository(worktree),await fs.realpath(repo));
});

test('Prefix hashes cover every consumed byte across chunks, malformed lines and partial UTF-8 tails',async t=>{
 const {dir,logs,settings}=await fixture(t),file=path.join(logs,'chunks.jsonl'),cache=path.join(dir,'cache.json');
 const large=JSON.stringify({type:'ignored',timestamp:'2026-09-11T10:00:00Z',text:'ö'.repeat(300000)})+'\n';
 const complete=Buffer.from(large+'invalid json\n'+line('one')),tail=Buffer.from(line('twö'));
 const split=tail.indexOf(Buffer.from('ö'))+1;
 await fs.writeFile(file,Buffer.concat([complete,tail.subarray(0,split)]));
 const store=new Store(cache);await store.scan(settings);
 assert.equal(store.files[file].offset,complete.length);
 assert.equal(store.files[file].prefixHash,createHash('sha256').update(complete).digest('hex'));
 const restored=new Store(cache);await restored.load();await fs.appendFile(file,tail.subarray(split));
 const result=await restored.scan(settings);
 assert.equal(result.sessions[0].events.length,2);assert.equal(result.sessions[0].malformed,1);
 assert.equal(restored.files[file].prefixHash,createHash('sha256').update(Buffer.concat([complete,tail])).digest('hex'));
});

test('Changing the middle of a grown log is detected after a cache restart',async t=>{
 const {dir,logs,settings}=await fixture(t),file=path.join(logs,'middle.jsonl'),cache=path.join(dir,'cache.json');
 const head=line('head'),tail=line('tail');await fs.writeFile(file,head+line('old')+tail);
 const store=new Store(cache);await store.scan(settings);
 const restored=new Store(cache);await restored.load();
 await fs.writeFile(file,head+line('new')+tail+line('added'));
 const result=await restored.scan(settings);
 assert.deepEqual(result.sessions[0].events.map(e=>e.id).sort(),['claude:added','claude:head','claude:new','claude:tail']);
 assert.equal(result.sessions[0].malformed,0);
});

test('A failed file update leaves its cached events untouched while other files can finish',async t=>{
 const {dir,logs,settings}=await fixture(t),file=path.join(logs,'one.jsonl'),cache=path.join(dir,'cache.json');
 await fs.writeFile(file,line('one'));const store=new Store(cache);await store.scan(settings);
 const previous=structuredClone(store.files[file]),repository=store.repository.bind(store);
 store.repository=async cwd=>{if(cwd===path.win32.normalize('C:/example'))throw Error('Simulated repository read failure');return repository(cwd);};
 await fs.appendFile(file,line('one',999)+line('two'));
 const other=JSON.parse(line('other'));other.sessionId='other-session';other.cwd=dir;
 await fs.writeFile(path.join(logs,'other.jsonl'),JSON.stringify(other)+'\n');
 const failed=await store.scan(settings);
 assert.equal(failed.stats.warnings.length,1);assert.equal(failed.stats.changed,1);
 assert.deepEqual(store.files[file],previous);
 const restored=new Store(cache);await restored.load();assert.deepEqual(restored.files[file],previous);
 store.repository=repository;const recovered=await store.scan(settings);
 const events=recovered.sessions.find(s=>s.sessionId==='session').events;
 assert.equal(events.length,2);assert.equal(events.find(e=>e.id==='claude:one').output,999);
});

test('Overlapping roots are read once and parallel completion preserves duplicate precedence',async t=>{
 const {dir,logs,settings}=await fixture(t),nested=path.join(logs,'nested');await fs.mkdir(nested);
 const values=[['a',10],['b',20],['c',30],['d',40],['e',50]];
 for(const [name,output] of values) {
  const entry=JSON.parse(line('shared',output));entry.cwd=path.join(dir,name);
  await fs.writeFile(path.join(nested,`${name}.jsonl`),JSON.stringify(entry)+'\n');
 }
 const store=new Store(path.join(dir,'cache.json'));
 store.repository=async cwd=>{if(path.basename(cwd)==='a')await new Promise(resolve=>setTimeout(resolve,25));return cwd;};
 const result=await store.scan({...settings,claudeRoots:[logs,nested,logs]});
 assert.equal(result.stats.changed,5);assert.equal(result.stats.files,5);
 assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].events.length,1);
 assert.equal(result.sessions[0].events[0].output,10);
 const unchanged=await store.scan(settings);assert.equal(unchanged.stats.changed,0);assert.equal(unchanged.stats.bytes,0);
});
