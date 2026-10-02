import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {coworkLimit,defaultCoworkRoot,discoverCowork,readCoworkMetadata} from '../lib/cowork.mjs';
import {Store} from '../lib/store.mjs';

async function fixture(t) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-cowork-'));
 t.after(async()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-cowork-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});});
 const root=path.join(dir,'local-agent-mode-sessions'),org=path.join(root,'account','org'),session=path.join(org,'local_one');
 const transcripts=path.join(session,'.claude','projects','-sessions-calm-river');
 await fs.mkdir(path.join(transcripts,'cli-session','subagents'),{recursive:true});
 for(const skipped of ['outputs','uploads','host-cwd'])await fs.mkdir(path.join(session,skipped),{recursive:true});
 await fs.mkdir(path.join(org,'cowork_plugins','plugin','node_modules'),{recursive:true});
 await fs.writeFile(path.join(org,'cowork_plugins','plugin','node_modules','trap.jsonl'),'{}\n');
 await fs.writeFile(path.join(session,'outputs','trap.jsonl'),'{}\n');
 await fs.writeFile(path.join(org,'local_one.json'),JSON.stringify({sessionId:'local_one',cliSessionId:'cli-session',title:'Plan the trip',systemPrompt:'PRIVATE',emailAddress:'private@example.com'}));
 const transcript=path.join(transcripts,'cli-session.jsonl');
 await fs.writeFile(transcript,assistant('msg-a','2026-10-02T20:00:00Z')+assistant('msg-b','2026-10-02T20:05:00Z'));
 const event=(time,info)=>JSON.stringify({type:'rate_limit_event',rate_limit_info:info,session_id:'cli-session',timestamp:time})+'\n';
 await fs.writeFile(path.join(session,'audit.jsonl'),
  JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'PRIVATE CONVERSATION'}],usage:{input_tokens:100,output_tokens:10}},timestamp:'2026-10-02T20:00:00Z'})+'\n'
  +event('2026-03-26T17:50:14Z',{status:'allowed_warning',rateLimitType:'five_hour',utilization:.97,resetsAt:1774551600})
  +event('2026-10-02T20:05:00Z',{status:'allowed',unifiedWindows:{five_hour:{utilization:.07,resetsAt:1790990400},seven_day:{utilization:.01,resetsAt:1791050400}}}));
 return {dir,root,session,transcript};
}
function assistant(id,time) {
 return JSON.stringify({type:'assistant',timestamp:time,sessionId:'cli-session',cwd:'/sessions/calm-river',message:{id,model:'claude-opus-5-5',usage:{input_tokens:100,output_tokens:10}}})+'\n';
}

test('Cowork discovery finds transcripts, audits and metadata without entering content folders',async t=>{
 const {root,session}=await fixture(t),found=await discoverCowork(root);
 assert.deepEqual(found.transcripts.map(file=>path.basename(file)),['cli-session.jsonl']);
 assert.deepEqual(found.audits,[path.join(session,'audit.jsonl')]);
 assert.deepEqual(found.metadata.map(file=>path.basename(file)),['local_one.json']);
 assert.deepEqual(await discoverCowork(path.join(root,'missing')),{transcripts:[],audits:[],metadata:[]});
 const cache=new Map(),names=await readCoworkMetadata(found.metadata,[],cache);
 assert.deepEqual([...names],[['cli-session','Plan the trip']]);
 assert.deepEqual(Object.keys([...cache.values()][0]).sort(),['mtime','sessionId','size','title']);
});

test('Cowork rate limit events become Claude limit readings in percent',()=>{
 const full=coworkLimit({type:'rate_limit_event',timestamp:'2026-10-02T20:26:21.928Z',rate_limit_info:{status:'allowed',unifiedWindows:{five_hour:{utilization:.07,resetsAt:1790990400},seven_day:{utilization:.01,resetsAt:1791050400}}}});
 assert.deepEqual(full,{limit_id:'claude',plan_type:'',source:'cowork',primary:{window_minutes:300,used_percent:7,resets_at:1790990400},secondary:{window_minutes:10080,used_percent:1,resets_at:1791050400},observedAt:'2026-10-02T20:26:21.928Z'});
 const warning=coworkLimit({type:'rate_limit_event',timestamp:'2026-03-26T17:50:14Z',rate_limit_info:{status:'allowed_warning',rateLimitType:'seven_day',utilization:.9,resetsAt:1774551600}});
 assert.equal(warning.primary,null);assert.equal(warning.secondary.used_percent,90);
 assert.equal(coworkLimit({type:'rate_limit_event',timestamp:'2026-03-26T17:50:14Z',rate_limit_info:{status:'allowed',rateLimitType:'five_hour',resetsAt:1774551600}}),null);
 assert.equal(coworkLimit({type:'assistant',timestamp:'2026-03-26T17:50:14Z'}),null);
 assert.match(defaultCoworkRoot('win32',{APPDATA:'C:\\Users\\a\\AppData\\Roaming'},'C:\\Users\\a'),/Claude[\\/]local-agent-mode-sessions$/);
 assert.equal(defaultCoworkRoot('linux',{},'/home/a'),path.join('/home/a','.config','Claude','local-agent-mode-sessions'));
});

test('Cowork sessions count as Claude usage and keep the Claude limit card current',async t=>{
 const {dir,root,transcript}=await fixture(t),cache=path.join(dir,'cache.json'),settings={claudeRoots:[],codexRoots:[],coworkRoots:[root],prices:{}};
 const store=new Store(cache),snapshot=await store.scan(settings);
 assert.equal(snapshot.sessions.length,1);
 const [session]=snapshot.sessions;
 assert.deepEqual({tool:session.tool,id:session.sessionId,name:session.name,origin:session.origin,repository:session.repository,events:session.events.length},{tool:'claude',id:'cli-session',name:'Plan the trip',origin:'cowork',repository:'Claude Cowork',events:2});
 assert.equal(snapshot.limits.claude.source,'cowork');assert.equal(snapshot.limits.claude.primary.used_percent,7);assert.equal(snapshot.limits.claude.secondary.used_percent,1);
 assert.deepEqual(store.limitHistory.filter(point=>point.tool==='claude').map(point=>[point.windowMinutes,point.usedPercent]).sort(),[[10080,1],[300,7],[300,97]]);
 const saved=await fs.readFile(cache,'utf8');assert.ok(!saved.includes('PRIVATE'));
 // Appending to an active Cowork session keeps its metadata stable and needs no urgent cache write.
 const restored=new Store(cache,null,{persistIntervalMs:60000});await restored.load();await restored.scan(settings);
 await fs.appendFile(transcript,assistant('msg-c','2026-10-02T20:10:00Z'));
 const next=await restored.scan(settings);
 assert.equal(next.stats.metadataChanges,0);assert.equal(next.sessions[0].events.length,3);assert.equal(next.sessions[0].repository,'Claude Cowork');
 // Removing the Cowork folder from the settings removes its sessions and its limit reading.
 const without=restored.snapshot({...settings,coworkRoots:[]});
 assert.equal(without.sessions.length,0);assert.notEqual(without.limits.claude?.source,'cowork');
});
