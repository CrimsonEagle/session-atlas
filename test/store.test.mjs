import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../lib/store.mjs';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-test-'));t.after(async()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-test-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});});const logs=path.join(dir,'logs');await fs.mkdir(logs);return {dir,logs,settings:{claudeRoots:[logs],codexRoots:[],prices:{}}};}
const line=(id,output=10)=>JSON.stringify({type:'assistant',timestamp:'2026-09-11T10:00:00Z',sessionId:'session',cwd:'C:/example',message:{id,model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:output},content:[{type:'text',text:'PRIVATE CONTENT SHOULD NEVER BE CACHED'}]}})+'\n';
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
test('A valid final JSON record without a newline is counted once',async t=>{
 const {dir,logs,settings}=await fixture(t);const file=path.join(logs,'tail.jsonl'),s=new Store(path.join(dir,'cache.json'));
 await fs.writeFile(file,line('one').trimEnd());let x=await s.scan(settings);assert.equal(x.sessions[0].events.length,1);
 await fs.appendFile(file,'\n'+line('two'));x=await s.scan(settings);assert.equal(x.sessions[0].events.length,2);
});
test('Duplicate files and concurrent refresh requests do not multiply usage',async t=>{
 const {dir,logs,settings}=await fixture(t);await fs.writeFile(path.join(logs,'one.jsonl'),line('shared'));await fs.writeFile(path.join(logs,'two.jsonl'),line('shared'));
 const s=new Store(path.join(dir,'cache.json'));const [a,b]=await Promise.all([s.scan(settings),s.scan(settings)]);assert.equal(s.scanCount,1);assert.equal(a.sessions.length,1);assert.equal(b.sessions[0].events.length,1);
});
test('Git worktree resolves to common repository root',async t=>{
 const {dir}=await fixture(t),repo=path.join(dir,'repo'),worktree=path.join(dir,'worktree'),gitDir=path.join(repo,'.git','worktrees','branch');await fs.mkdir(gitDir,{recursive:true});await fs.mkdir(worktree);await fs.writeFile(path.join(worktree,'.git'),`gitdir: ${gitDir}`);await fs.writeFile(path.join(gitDir,'commondir'),'../..');
 // repository() canonicalizes its result, so the expectation has to be canonical too: a TMP
 // pointing at an 8.3 short path would otherwise fail the comparison on spelling alone.
 const s=new Store(path.join(dir,'cache.json'));assert.equal(await s.repository(worktree),await fs.realpath(repo));
});
