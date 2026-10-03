import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {readHermesLocal} from '../lib/hermes-local.mjs';
import {Store} from '../lib/store.mjs';
import {totals} from '../public/analytics-core.js';
import {taskRows} from '../public/tasks.js';
import {sessionTreeRows} from '../public/session-tree.js';

async function fixture(t) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-hermes-conversations-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const db=new DatabaseSync(path.join(dir,'state.db'));t.after(()=>db.close());
 db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY,source TEXT,title TEXT,model TEXT,started_at REAL,ended_at REAL,end_reason TEXT,parent_session_id TEXT,model_config TEXT,session_key TEXT,input_tokens INTEGER,output_tokens INTEGER,api_call_count INTEGER,cost_status TEXT,estimated_cost_usd REAL,cwd TEXT);
 CREATE TABLE messages(session_id TEXT,timestamp REAL);`);
 const insert=db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const add=(id,{parent='',source='telegram',title=id,start=1726048800,reason=null,config={},route='same-chat',tokens=100,cwd=''}={})=>insert.run(id,source,title,'gpt-6.1-sol',start,reason?start+10:null,reason,parent||null,JSON.stringify(config),route,tokens,10,1,'estimated',tokens/1000,cwd);
 const settings={claudeRoots:[],codexRoots:[],hermesRoots:[dir],prices:{}};
 const cache=path.join(dir,'cache.json');return {dir,db,add,settings,cache,store:new Store(cache)};
}

const bySuffix=(sessions,id)=>sessions.find(s=>s.sessionId.endsWith(`:${id}`));

test('Hermes reader distinguishes resets, compression and actual delegated work',async t=>{
 const {dir,add}=await fixture(t);
 add('root',{reason:'compression'});
 add('compressed',{parent:'root',start:1726048810});
 add('reset',{parent:'root',config:{_reset_from:'root'}});
 add('fork',{parent:'root',config:{_branched_from:'root'}});
 add('worker',{parent:'root',source:'subagent'});
 add('desktop-worker',{parent:'root',source:'desktop',config:{_delegate_from:'root'}});
 const {rows,warnings}=await readHermesLocal([dir]);assert.deepEqual(warnings,[]);
 const row=id=>rows.find(r=>r.id.endsWith(`:${id}`));
 assert.equal(row('compressed').relationType,'compression');
 assert.equal(row('reset').relationType,'reset');
 assert.equal(row('fork').relationType,'fork');
 assert.equal(row('worker').relationType,'subagent');
 assert.equal(row('desktop-worker').relationType,'subagent');
});

test('reset boundaries create independent conversations while compression merges usage and reattaches workers',async t=>{
 const {add,store,settings,cache,db,dir}=await fixture(t);
 add('suno',{tokens:100});
 add('weather',{parent:'suno',config:{_reset_from:'suno'},tokens:200});
 add('cookie-start',{parent:'weather',config:{_reset_from:'weather'},reason:'compression',tokens:300,title:null});
 add('cookie-end',{parent:'cookie-start',start:1726048810,tokens:400,title:'Session cookie'});
 add('pixel-start',{parent:'cookie-end',config:{_reset_from:'cookie-end'},reason:'compression',tokens:500,title:null});
 add('pixel-mid',{parent:'pixel-start',start:1726048810,reason:'compression',config:{_reset_from:'cookie-end'},tokens:600,title:null});
 add('pixel-end',{parent:'pixel-mid',start:1726048820,tokens:700,title:'Android APK',cwd:'/workspace/pixel'});
 add('worker-before',{source:'subagent',parent:'pixel-start',tokens:20});
 add('worker-after',{source:'subagent',parent:'pixel-end',tokens:30});
 const snapshot=await store.scan(settings),sessions=snapshot.sessions;
 assert.equal(sessions.length,6);
 const pixel=bySuffix(sessions,'pixel-start'),cookie=bySuffix(sessions,'cookie-start');
 assert.equal(pixel.name,'Android APK');assert.equal(pixel.cwd,'/workspace/pixel');
 assert.equal(pixel.parentId,'');assert.equal(cookie.parentId,'');
 assert.equal(bySuffix(sessions,'weather').parentId,'');
 assert.equal(pixel.segmentIds.length,3);assert.equal(cookie.segmentIds.length,2);
 assert.equal(pixel.started,'2024-09-11T10:00:00.000Z');
 assert.equal(pixel.lastActivity,'2024-09-11T10:00:20.000Z');
 assert.equal(totals(pixel.events).tokens,1830);
 for(const id of ['worker-before','worker-after']){
  const worker=bySuffix(sessions,id);assert.equal(worker.parentId,pixel.sessionId);assert.equal(worker.subagent,true);
 }
 const rawEvents=Object.values(store.hermesSources[dir].sessions).flatMap(s=>Object.values(s.events));
 assert.deepEqual(new Set(sessions.flatMap(s=>s.events).map(e=>e.id)),new Set(rawEvents.map(e=>e.id)));
 assert.equal(sessions.flatMap(s=>s.events).length,rawEvents.length);
 const rows=taskRows(sessions);assert.equal(rows.roots.length,4);
 const pixelTree=rows.roots.find(n=>n.session.id===pixel.id);assert.equal(pixelTree.children.length,2);assert.equal(pixelTree.total.tokens,1900);
 for(const sort of ['tokens','cost','activity']){
  const closed=sessionTreeRows(sessions,sessions,new Set(),sort,'desc'),open=sessionTreeRows(sessions,sessions,new Set([pixel.id]),sort,'desc');
  assert.deepEqual(open.filter(r=>r.treeDepth===0).map(r=>r.id),closed.map(r=>r.id));
  assert.equal(closed.find(r=>r.id===pixel.id).displayTotals.tokens,1900);
  assert.equal(open.find(r=>r.id===pixel.id).displayTotals.tokens,1900);
 }
 const detail=store.snapshot(settings,{sessionId:pixel.id}).sessions[0];assert.equal(totals(detail.events).tokens,1830);
 const alias=store.snapshot(settings,{sessionId:`hermes:${pixel.segmentIds.at(-1)}`}).sessions[0];assert.equal(alias.id,pixel.id);assert.equal(totals(alias.events).tokens,1830);
 const restarted=new Store(cache);await restarted.load();
 assert.deepEqual(restarted.snapshot(settings).sessions,sessions);
 assert.deepEqual((await restarted.scan(settings)).sessions,sessions);
 db.exec("UPDATE sessions SET input_tokens=710 WHERE id='pixel-end'");
 const updated=(await restarted.scan(settings)).sessions;assert.equal(totals(bySuffix(updated,'pixel-start').events).tokens,1840);
 assert.equal(totals((await restarted.scan(settings)).sessions.flatMap(s=>s.events)).tokens,totals(updated.flatMap(s=>s.events)).tokens);
});

test('legacy same-route resets remain independent without merging by title or platform',async t=>{
 const {add,store,settings}=await fixture(t);
 add('old',{reason:'session_reset',title:'Same title'});
 add('fresh',{parent:'old',title:'Same title'});
 add('unknown-link',{parent:'fresh',title:'Same title'});
 const sessions=(await store.scan(settings)).sessions;
 assert.equal(sessions.length,3);
 assert.ok(sessions.every(s=>s.parentId===''));
 assert.equal(taskRows(sessions).roots.length,3);
});

test('explicit branches and delegates never merge even when their parent was compressed',async t=>{
 const {add,store,settings}=await fixture(t);
 add('root',{reason:'compression'});
 add('tip',{parent:'root',start:1726048810});
 add('fork',{parent:'root',config:{_branched_from:'root'}});
 add('delegated',{parent:'tip',source:'desktop',config:{_delegate_from:'tip'}});
 add('nested-worker',{parent:'delegated',source:'subagent'});
 const sessions=(await store.scan(settings)).sessions;
 assert.equal(sessions.length,4);
 assert.equal(bySuffix(sessions,'fork').parentId,'');
 assert.equal(bySuffix(sessions,'fork').forkedFromId,bySuffix(sessions,'root').sessionId);
 assert.equal(bySuffix(sessions,'delegated').parentId,bySuffix(sessions,'root').sessionId);
 assert.equal(bySuffix(sessions,'nested-worker').parentId,bySuffix(sessions,'delegated').sessionId);
 assert.equal(taskRows(sessions).roots.length,2);
});

test('worker compression segments preserve inherited delegation without inventing nested agents',async t=>{
 const {add,store,settings}=await fixture(t);
 add('root',{reason:'compression'});
 add('worker',{parent:'root',source:'subagent',reason:'compression',config:{_delegate_from:'root'},tokens:20});
 add('worker-tip',{parent:'worker',source:'subagent',config:{_delegate_from:'root'},tokens:30});
 add('desktop-worker',{parent:'root',source:'desktop',reason:'compression',config:{_delegate_from:'root'}});
 add('desktop-tip',{parent:'desktop-worker',source:'desktop',config:{_delegate_from:'root'}});
 const sessions=(await store.scan(settings)).sessions;
 assert.equal(sessions.length,3);
 assert.equal(bySuffix(sessions,'worker').segmentIds.length,2);
 assert.equal(totals(bySuffix(sessions,'worker').events).tokens,70);
 assert.equal(bySuffix(sessions,'desktop-worker').segmentIds.length,2);
 assert.equal(taskRows(sessions).roots[0].children.length,2);
});

test('lineage projection migrates an existing raw cache without changing event IDs or source rows',async t=>{
 const {add,db,store,settings,cache}=await fixture(t);
 add('root',{reason:'compression'});add('tip',{parent:'root'});
 const sourceBefore=db.prepare('SELECT * FROM sessions ORDER BY id').all();
 await store.scan(settings);
 const cached=JSON.parse(await fs.readFile(cache,'utf8'));
 for(const source of Object.values(cached.hermesSources))for(const state of Object.values(source.sessions)){
  state.relationType=state.parentId?'related':'';state.relationEvidence=state.parentId?'hermes.sessions.parent_session_id':'';
 }
 const oldIds=Object.values(cached.hermesSources).flatMap(source=>Object.values(source.sessions).flatMap(s=>Object.values(s.events).map(e=>e.id))).sort();
 await fs.writeFile(cache,JSON.stringify(cached));
 const restarted=new Store(cache);await restarted.load();
 const snapshot=await restarted.scan(settings);assert.equal(snapshot.sessions.length,1);
 assert.deepEqual(snapshot.sessions.flatMap(s=>s.events.map(e=>e.id)).sort(),oldIds);
 assert.deepEqual(db.prepare('SELECT * FROM sessions ORDER BY id').all(),sourceBefore);
 const persisted=new Store(cache);await persisted.load();assert.equal(persisted.snapshot(settings).sessions.length,1);
});

test('identical local session IDs in different Hermes profiles never merge',async t=>{
 const {dir,add,store,settings}=await fixture(t);
 add('root',{reason:'compression'});add('tip',{parent:'root'});
 const profile=path.join(dir,'profiles','other');await fs.mkdir(profile,{recursive:true});
 await fs.copyFile(path.join(dir,'state.db'),path.join(profile,'state.db'));
 const sessions=(await store.scan(settings)).sessions;
 assert.equal(sessions.length,2);assert.notEqual(sessions[0].sessionId,sessions[1].sessionId);
 assert.ok(sessions.every(s=>s.segmentIds.length===2));
});

test('missing compression parents and cycles never lose events or recurse forever',async t=>{
 const {add,store,settings}=await fixture(t);
 add('missing',{parent:'gone'});
 add('a',{parent:'b',reason:'compression'});
 add('b',{parent:'a',reason:'compression'});
 add('self',{parent:'self',reason:'compression'});
 const sessions=(await store.scan(settings)).sessions;
 assert.equal(sessions.length,4);assert.equal(sessions.flatMap(s=>s.events).length,4);
 assert.ok(sessions.every(s=>s.parentId===''));
});
