import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {defaultHermesHome,readHermesLocal,validateHermesRoots} from '../lib/hermes-local.mjs';
import {Store} from '../lib/store.mjs';
import {totals} from '../public/analytics-core.js';

function database(file,{models=true}={}){
 const db=new DatabaseSync(file);
 db.exec(`CREATE TABLE sessions (id TEXT, source TEXT, model TEXT, title TEXT, started_at REAL, ended_at REAL, parent_session_id TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, estimated_cost_usd REAL, actual_cost_usd REAL, cost_status TEXT, cwd TEXT, git_branch TEXT, api_call_count INTEGER, billing_provider TEXT, billing_base_url TEXT, billing_mode TEXT);
 CREATE TABLE messages (session_id TEXT, timestamp REAL);`);
 db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('same-id','cli','google/gemini-2.5-flash','Hermes work',1726048800,null,null,120,30,0,0,0,.03,null,'estimated','/repo','main',2,'openrouter','https://openrouter.ai/api/v1','api');
 db.prepare('INSERT INTO messages VALUES (?,?)').run('same-id',1726048860);
 if(models){
  db.exec('CREATE TABLE session_model_usage (session_id TEXT, model TEXT, billing_provider TEXT, billing_base_url TEXT, billing_mode TEXT, task TEXT, api_call_count INTEGER, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, estimated_cost_usd REAL, actual_cost_usd REAL, cost_status TEXT, last_seen REAL)');
  const insert=db.prepare('INSERT INTO session_model_usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run('same-id','anthropic/claude-sonnet-4.6','openrouter','https://openrouter.ai/api/v1','api','',1,100,20,0,0,0,.03,0,'estimated',1726048830);
  insert.run('same-id','google/gemini-2.5-flash','openrouter','https://openrouter.ai/api/v1','api','',1,20,10,0,0,0,0,0,'unknown',1726048860);
 }
 db.close();
}

test('Hermes home follows HERMES_HOME and paths are validated',()=>{
 assert.equal(defaultHermesHome({HERMES_HOME:path.resolve('sample')},'linux'),path.resolve('sample'));
 assert.deepEqual(validateHermesRoots([path.resolve('sample'),path.resolve('sample')]),[path.resolve('sample')]);
 assert.throws(()=>validateHermesRoots(['relative/hermes']));
});

test('local Hermes reader finds profiles and attributes model switches',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-hermes-local-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const profile=path.join(root,'profiles','coder');await fs.mkdir(profile,{recursive:true});
 database(path.join(root,'state.db'));database(path.join(profile,'state.db'),{models:false});
 const {rows,warnings}=await readHermesLocal([root]);
 assert.deepEqual(warnings,[]);assert.equal(rows.length,2);
 assert.notEqual(rows[0].id,rows[1].id);
 const main=rows.find(row=>row.profile==='default');
 assert.equal(main.usages.length,2);
 assert.deepEqual(main.usages.map(item=>item.model),['anthropic/claude-sonnet-4.6','google/gemini-2.5-flash']);
 assert.equal(main.usages[0].reportedCost,.03);
 assert.equal(main.usages[1].reportedCost,null);
 assert.equal(main.usages[1].priceModel,'openrouter:google/gemini-2.5-flash');
 assert.equal(main.lastActivity,'2024-09-11T10:01:00.000Z');
});

test('local Hermes scans preserve deltas and use OpenRouter fallback for unknown costs',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-hermes-local-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=path.join(dir,'hermes');await fs.mkdir(root);const file=path.join(root,'state.db');database(file);
 const settings={claudeRoots:[],codexRoots:[],hermesRoots:[root],prices:{'openrouter:google/gemini-2.5-flash':[1,null,2,null]}};
 const store=new Store(path.join(dir,'cache.json'));
 let snapshot=await store.scan(settings),session=snapshot.sessions[0];
 assert.equal(session.events.length,2);
 assert.equal(session.events.find(event=>event.model.startsWith('anthropic/')).cost,.03);
 assert.equal(session.events.find(event=>event.model.startsWith('google/')).cost,.00004);
 snapshot=await store.scan(settings);assert.equal(snapshot.sessions[0].events.length,2);
 const db=new DatabaseSync(file);db.exec("UPDATE session_model_usage SET input_tokens=130, output_tokens=24, api_call_count=2, estimated_cost_usd=0.04, last_seen=1726048920 WHERE model LIKE 'anthropic/%'");db.exec('UPDATE sessions SET input_tokens=150, output_tokens=34, api_call_count=3, estimated_cost_usd=0.04');db.close();
 snapshot=await store.scan(settings);session=snapshot.sessions[0];
 assert.equal(session.events.length,3);
 assert.ok(Math.abs(session.events.find(event=>event.input===30)?.cost-.01)<1e-8);
 const costDb=new DatabaseSync(file);costDb.exec("UPDATE session_model_usage SET actual_cost_usd=0.01, cost_status='actual' WHERE model LIKE 'google/%'");costDb.close();
 snapshot=await store.scan(settings);session=snapshot.sessions[0];
 assert.ok(Math.abs(session.events.filter(event=>event.model.startsWith('google/')).reduce((sum,event)=>sum+event.cost,0)-.01)<1e-8);
 assert.equal(session.events.filter(event=>event.model.startsWith('google/')).length,2);
 assert.equal(session.events.find(event=>event.model.startsWith('google/')&&event.input===0).requestCount,0);
 assert.equal(totals(session.events).requests,3);
 const restored=new Store(path.join(dir,'cache.json'));await restored.load();
 assert.equal(restored.snapshot(settings).sessions[0].events.length,4);
});

test('Hermes parent links do not imply a subagent',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-hermes-relations-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'state.db');database(file,{models:false});
 const db=new DatabaseSync(file);
 db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('continuation','cli','google/gemini-2.5-flash','Continued',1726049000,null,'same-id',10,2,0,0,0,0,null,'unknown','/repo','main',1,'openrouter','https://openrouter.ai/api/v1','api');
 db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('worker','subagent','google/gemini-2.5-flash','Worker',1726049100,null,'same-id',10,2,0,0,0,0,null,'unknown','/repo','main',1,'openrouter','https://openrouter.ai/api/v1','api');
 db.close();
 const settings={claudeRoots:[],codexRoots:[],hermesRoots:[dir],prices:{}};
 const sessions=(await new Store(path.join(dir,'cache.json')).scan(settings)).sessions;
 assert.equal(sessions.find(item=>item.sessionId.endsWith(':continuation')).relationType,'related');
 assert.equal(sessions.find(item=>item.sessionId.endsWith(':continuation')).subagent,false);
 assert.equal(sessions.find(item=>item.sessionId.endsWith(':worker')).relationType,'subagent');
 assert.equal(sessions.find(item=>item.sessionId.endsWith(':worker')).subagent,true);
});
