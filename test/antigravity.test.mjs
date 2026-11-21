import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {defaultAntigravityRoots,antigravitySessionId,uriToPath,normalizeAntigravityModel,discoverAntigravity} from '../lib/antigravity.mjs';
import {Store} from '../lib/store.mjs';
import {createBackup,parseBackup} from '../lib/backup.mjs';

test('defaultAntigravityRoots, antigravitySessionId and uriToPath normalize paths across platforms',()=>{
 assert.deepEqual(defaultAntigravityRoots({ANTIGRAVITY_HOME:path.join(os.tmpdir(),'custom-agy')},'/ignored'),[path.resolve(path.join(os.tmpdir(),'custom-agy'))]);
 const defaults=defaultAntigravityRoots({},'/home/alice');
 assert.equal(defaults.length,3);
 assert.ok(defaults[0].endsWith(path.join('.gemini','antigravity-cli')));
 assert.ok(defaults[1].endsWith(path.join('.gemini','antigravity')));
 assert.ok(defaults[2].endsWith(path.join('.t3','userdata','providers','antigravity')));
 const customT3=defaultAntigravityRoots({T3CODE_HOME:path.join(os.tmpdir(),'custom-t3')},'/home/alice');
 assert.equal(customT3[2],path.resolve(path.join(os.tmpdir(),'custom-t3'),'userdata','providers','antigravity'));
 assert.equal(antigravitySessionId('/home/alice/.gemini/antigravity-cli/brain/24ffe499-af1b-414c-b804-48aba2d65e46/.system_generated/logs/transcript.jsonl'),'24ffe499-af1b-414c-b804-48aba2d65e46');
 assert.equal(antigravitySessionId('C:\\Users\\Marco\\.gemini\\antigravity\\brain\\conv-123\\transcript.jsonl'),'conv-123');
 assert.equal(uriToPath('file:///C:/AI/ai-usage-visualizer'),path.win32.normalize('C:/AI/ai-usage-visualizer'));
 assert.equal(uriToPath('file:///C:/My%20Repo/project'),path.win32.normalize('C:/My Repo/project'));
 if(process.platform!=='win32')assert.equal(uriToPath('file:///home/user/repo'),'/home/user/repo');
});

test('discoverAntigravity finds canonical transcript.jsonl without duplicating full logs, chunks or steps',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-agy-discover-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const convA=path.join(root,'brain','conv-a','.system_generated','logs');
 const convB=path.join(root,'brain','conv-b','.system_generated','logs');
 const convC=path.join(root,'brain','conv-c');
 await fs.mkdir(path.join(convA,'chunks','0'),{recursive:true});
 await fs.mkdir(path.join(convA,'steps','1'),{recursive:true});
 await fs.mkdir(convB,{recursive:true});
 await fs.mkdir(convC,{recursive:true});
 await fs.writeFile(path.join(root,'history.jsonl'),'{"id":"conv-a"}\n');
 await fs.writeFile(path.join(convA,'transcript.jsonl'),'{}');
 await fs.writeFile(path.join(convA,'transcript_full.jsonl'),'{}');
 await fs.writeFile(path.join(convA,'chunks','0','transcript.jsonl'),'{}');
 await fs.writeFile(path.join(convA,'steps','1','log.jsonl'),'{}');
 await fs.writeFile(path.join(convB,'transcript_full.jsonl'),'{}');
 await fs.writeFile(path.join(convC,'transcript.jsonl'),'{}');
 const warnings=[],files=await discoverAntigravity(root,warnings);
 assert.equal(warnings.length,0);
 assert.deepEqual(files.sort(),[
  path.join(convA,'transcript.jsonl'),
  path.join(convB,'transcript_full.jsonl'),
  path.join(convC,'transcript.jsonl')
 ].sort());
});

test('Store scans Antigravity transcripts, enriches metadata, tracks compactions and omits private text',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-agy-store-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=path.join(dir,'antigravity-cli'),repo=path.join(dir,'repo'),otherRepo=path.join(dir,'other-repo');
 await fs.mkdir(path.join(repo,'.git'),{recursive:true});
 await fs.mkdir(path.join(otherRepo,'.git'),{recursive:true});
 const parentLogs=path.join(root,'brain','parent-session','.system_generated','logs');
 const childLogs=path.join(root,'brain','child-session','.system_generated','logs');
 const annotatedLogs=path.join(root,'brain','annotated-session','.system_generated','logs');
 await fs.mkdir(parentLogs,{recursive:true});
 await fs.mkdir(childLogs,{recursive:true});
 await fs.mkdir(annotatedLogs,{recursive:true});
 await fs.mkdir(path.join(root,'annotations'),{recursive:true});
 await fs.mkdir(path.join(root,'conversations'),{recursive:true});

 const parentTranscript=[
  {step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-04T22:00:00Z',content:'<USER_REQUEST>\nBitte baue Antigravity-Support ein. GEHEIMER PROMPT TEXT\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nModel Selection: Claude Opus 4.6 (Thinking) (High)\n</USER_SETTINGS_CHANGE>'},
  {step_index:1,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-04T22:00:10Z',input_tokens:5000,cache_read_tokens:20000,cache_write_tokens:1000,output_tokens:400,thinking_tokens:150,content:'GEHEIME ANTWORT',thinking:'GEHEIMES THINKING'},
  {step_index:2,source:'SYSTEM',type:'CHECKPOINT',status:'DONE',created_at:'2026-11-04T22:05:00Z',input_tokens:2000,cache_read_tokens:50000,output_tokens:1200,content:'# Resuming from a compaction'},
  {step_index:3,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-04T22:06:00Z',content:'<USER_REQUEST>\nWeiter gehts\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nModel Selection: Gemini 3.1 Pro (Medium)\n</USER_SETTINGS_CHANGE>'},
  {step_index:4,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-04T22:06:15Z',input_tokens:3000,cache_read_tokens:10000,output_tokens:250}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n';
 await fs.writeFile(path.join(parentLogs,'transcript.jsonl'),parentTranscript);

 const childTranscript=[
  {step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-04T22:01:00Z',content:'<USER_REQUEST>\nSubagent research task\n</USER_REQUEST>'},
  {step_index:1,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-04T22:01:05Z',model:'gemini-3-flash',input_tokens:1000,cache_read_tokens:500,output_tokens:100}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n';
 await fs.writeFile(path.join(childLogs,'transcript.jsonl'),childTranscript);

 const annotatedTranscript=[
  {step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-04T21:00:00Z',content:'<USER_REQUEST>\nFallback request title\n</USER_REQUEST>'},
  {step_index:1,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-04T21:00:05Z',input_tokens:800,output_tokens:80},
  {step_index:2,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-04T21:01:00Z',content:'<USER_REQUEST>\nSwitch model\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user has updated their settings:\n- Changed `Model Selection` from Gemini 3.1 Pro (High) to Gemini 4 Argon (Low).\n</USER_SETTINGS_CHANGE>'},
  {step_index:3,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-04T21:01:05Z',input_tokens:900,output_tokens:90,content:'Here is a quote: Changed `Model Selection` from Gemini 3.1 Pro to Gemini 4 Argon, ...``) und inklusive rückwirkender Zuordnung normalisiert.'}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n';
 await fs.writeFile(path.join(annotatedLogs,'transcript.jsonl'),annotatedTranscript);
 await fs.writeFile(path.join(root,'annotations','annotated-session.pbtxt'),'last_user_view_time:{seconds:1775938559} title:"Annotation Title"\n');

 const repoUri='file:///'+(repo.replaceAll('\\','/').replace(/^\/+/,''));
 const otherUri='file:///'+(otherRepo.replaceAll('\\','/').replace(/^\/+/,''));
 const summaryDb=new DatabaseSync(path.join(root,'conversation_summaries.db'));
 summaryDb.exec('CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT, preview TEXT, status TEXT, created_at TEXT, updated_at TEXT, workspace_uris TEXT, parent_conversation_id TEXT, agent_name TEXT, metadata TEXT)');
 summaryDb.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
  'parent-session','Summary Title','Preview text','idle','2026-11-04T22:00:00Z','2026-11-04T22:06:15Z',JSON.stringify([repoUri]),null,'main','{}'
 );
 summaryDb.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
  'child-session',null,'Subagent preview','idle','2026-11-04T22:01:00Z','2026-11-04T22:01:05Z',JSON.stringify([repoUri]),'parent-session','research','{}'
 );
 summaryDb.close();

 const convDb=new DatabaseSync(path.join(root,'conversations','annotated-session.db'));
 convDb.exec('CREATE TABLE trajectory_metadata_blob (id TEXT PRIMARY KEY, data BLOB)');
 convDb.prepare('INSERT INTO trajectory_metadata_blob VALUES (?, ?)').run('main',Buffer.from(`prefix ${otherUri} suffix`));
 convDb.close();

 const cacheFile=path.join(dir,'usage-cache.json'),store=new Store(cacheFile);
 const settings={claudeRoots:[],codexRoots:[],coworkRoots:[],hermesRoots:[],antigravityRoots:[root],prices:{}};
 const snapshot=await store.scan(settings);

 assert.equal(snapshot.sessions.length,3);
 const byId=new Map(snapshot.sessions.map(s=>[s.sessionId,s]));
 const parent=byId.get('parent-session'),child=byId.get('child-session'),annotated=byId.get('annotated-session');

 assert.equal(parent.tool,'antigravity');
 assert.equal(parent.name,'Summary Title');
 assert.equal(parent.nameSource,'antigravity.summaries.title');
 assert.equal(parent.repository,await fs.realpath(repo));
 assert.equal(parent.events.length,3);
 assert.equal(parent.events[0].model,'claude-opus-4-6');
 assert.equal(parent.events[0].effort,'high');
 assert.equal(parent.events[0].input,5000);
 assert.equal(parent.events[0].cache,20000);
 assert.equal(parent.events[0].write,1000);
 assert.equal(parent.events[0].output,400);
 assert.equal(parent.events[0].reasoning,150);
 assert.ok(parent.events[0].cost>0);
 assert.equal(parent.events[2].model,'gemini-3.1-pro-preview');
 assert.equal(parent.events[2].effort,'medium');
 assert.ok(parent.events[2].cost>0);

 const detailedParent=store.snapshot(settings,{sessionId:'antigravity:parent-session'}).sessions[0];
 assert.ok(detailedParent.contextTimeline.some(item=>item.kind==='compaction'));
 assert.equal(detailedParent.contextTimeline.find(item=>item.kind==='sample').usedTokens,26000);

 assert.equal(child.parentId,'parent-session');
 assert.equal(child.subagent,true);
 assert.equal(child.relationType,'subagent');
 assert.equal(child.name,'Subagent preview');
 assert.equal(child.events[0].model,'gemini-3-flash-preview');
 assert.ok(child.events[0].cost>0);

 assert.equal(annotated.name,'Annotation Title');
 assert.equal(annotated.nameSource,'antigravity.annotations.title');
 assert.equal(annotated.repository,await fs.realpath(otherRepo));
 assert.equal(annotated.events[0].model,'gemini-3.1-pro-preview');
 assert.equal(annotated.events[0].effort,'high');
 assert.ok(annotated.events[0].cost>0);
 assert.equal(annotated.events[1].model,'gemini-4-argon');
 assert.equal(annotated.events[1].effort,'low');
 assert.ok(annotated.events[1].cost>0);
 assert.deepEqual(normalizeAntigravityModel('Claude Opus 4.6 (Thinking) (High)'),{model:'claude-opus-4-6',effort:'high'});
 assert.deepEqual(normalizeAntigravityModel('Gemini 4 Argon (High)'),{model:'gemini-4-argon',effort:'high'});
 assert.deepEqual(normalizeAntigravityModel('Gemini 4 Neon (Minimal)'),{model:'gemini-4-neon',effort:'minimal'});
 assert.deepEqual(normalizeAntigravityModel('gemini-4-neon-medium'),{model:'gemini-4-neon',effort:'medium'});
 assert.deepEqual(normalizeAntigravityModel('gemini-4-neon-high'),{model:'gemini-4-neon',effort:'high'});
 assert.deepEqual(normalizeAntigravityModel('gemini-4-neon-low'),{model:'gemini-4-neon',effort:'low'});
 assert.deepEqual(normalizeAntigravityModel('gemini-4-neon-xhigh'),{model:'gemini-4-neon',effort:'xhigh'});
 assert.deepEqual(normalizeAntigravityModel('gemini-4-hydrogen-tiered-high'),{model:'gemini-4-hydrogen',effort:'high'});
 assert.deepEqual(normalizeAntigravityModel('gemini-4-hydrogen-tiered'),{model:'gemini-4-hydrogen',effort:''});
 assert.deepEqual(normalizeAntigravityModel('gemini-3-flash-high'),{model:'gemini-3-flash-preview',effort:'high'});
 assert.deepEqual(normalizeAntigravityModel('gemini-3.1-pro-medium'),{model:'gemini-3.1-pro-preview',effort:'medium'});
 assert.deepEqual(normalizeAntigravityModel('gemini-high'),{model:'gemini-high',effort:''});
 assert.deepEqual(normalizeAntigravityModel('None'),{model:'',effort:''});

 const rawCache=await fs.readFile(cacheFile,'utf8');
 assert.ok(!rawCache.includes('GEHEIMER PROMPT TEXT'));
 assert.ok(!rawCache.includes('GEHEIME ANTWORT'));
 assert.ok(!rawCache.includes('GEHEIMES THINKING'));

 await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(settings));
 const backup=await createBackup(dir,{sessionCount:3}),parsed=parseBackup(backup.buffer);
 assert.deepEqual(parsed.preview.sourceRoots,[{tool:'antigravity',path:root}]);
});

test('Antigravity transcripts normalize effort-suffixed Gemini model ids and price them',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-agy-effort-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=path.join(dir,'antigravity-cli');
 const logs=path.join(root,'brain','neon-session','.system_generated','logs');
 await fs.mkdir(logs,{recursive:true});
 const transcript=[
  {step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-19T20:00:00Z',content:'<USER_REQUEST>\nTest Gemini 4 Neon\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Neon (Medium).\n</USER_SETTINGS_CHANGE>'},
  {step_index:1,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-19T20:00:05Z',model:'gemini-4-neon-medium',input_tokens:10000,cache_read_tokens:0,output_tokens:500},
  {step_index:2,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-19T20:01:05Z',model:'gemini-4-neon-high',input_tokens:2000,cache_read_tokens:10000,output_tokens:400},
  {step_index:3,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-19T20:02:05Z',model:'gemini-4-hydrogen-tiered-high',input_tokens:3000,cache_read_tokens:2000,output_tokens:200}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n';
 await fs.writeFile(path.join(logs,'transcript.jsonl'),transcript);

 const store=new Store(path.join(dir,'usage-cache.json'));
 const snapshot=await store.scan({claudeRoots:[],codexRoots:[],coworkRoots:[],hermesRoots:[],antigravityRoots:[root],prices:{}});
 assert.equal(snapshot.sessions.length,1);
 const [session]=snapshot.sessions;
 assert.deepEqual(session.events.map(e=>[e.model,e.effort]),[
  ['gemini-4-neon','medium'],
  ['gemini-4-neon','high'],
  ['gemini-4-hydrogen','high']
 ]);
 for(const ev of session.events)assert.ok(ev.cost>0);
});

test('Store discovers T3 Code antigravity-acp profiles, metadata, and swarm worker agent names',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-agy-t3-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const providersRoot=path.join(dir,'providers','antigravity');
 const acpHome=path.join(providersRoot,'ac0a3dfd6ddd','antigravity-acp');
 const repo=path.join(dir,'better-taskmanager');
 await fs.mkdir(path.join(repo,'.git'),{recursive:true});
 const coordLogs=path.join(acpHome,'brain','coord-1','.system_generated','logs');
 const workerLogs=path.join(acpHome,'brain','worker-1','.system_generated','logs');
 await fs.mkdir(coordLogs,{recursive:true});
 await fs.mkdir(workerLogs,{recursive:true});
 await fs.writeFile(path.join(coordLogs,'transcript.jsonl'),[
  {step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-20T15:55:00Z',content:'<USER_REQUEST>\nAnalyze project\n</USER_REQUEST>'},
  {step_index:1,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-20T15:55:10Z',model:'gemini-4-neon-medium',input_tokens:30000,cache_read_tokens:0,output_tokens:500}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n');
 await fs.writeFile(path.join(workerLogs,'transcript.jsonl'),[
  {step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',status:'DONE',created_at:'2026-11-20T15:56:00Z',content:'<USER_REQUEST>\nVery long swarm briefing text that should be overridden by agent_name\n</USER_REQUEST>'},
  {step_index:1,source:'MODEL',type:'PLANNER_RESPONSE',status:'DONE',created_at:'2026-11-20T15:56:10Z',model:'gemini-4-neon-high',input_tokens:12000,cache_read_tokens:8000,output_tokens:400}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n');

 const repoUri='file:///'+(repo.replaceAll('\\','/').replace(/^\/+/,''));
 const db=new DatabaseSync(path.join(acpHome,'conversation_summaries.db'));
 db.exec('CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT, preview TEXT, workspace_uris TEXT, parent_conversation_id TEXT, agent_name TEXT)');
 db.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?)').run('coord-1','Task Manager Swarm Analysis','Task Manager Swarm Analysis',JSON.stringify([repoUri]),'','');
 db.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?)').run('worker-1','','',JSON.stringify([repoUri]),'coord-1','backend-analyst');
 db.close();

 const store=new Store(path.join(dir,'usage-cache.json'));
 const snapshot=await store.scan({claudeRoots:[],codexRoots:[],coworkRoots:[],hermesRoots:[],antigravityRoots:[providersRoot],prices:{}});
 assert.equal(snapshot.sessions.length,2);
 const byId=new Map(snapshot.sessions.map(s=>[s.sessionId,s]));
 const coord=byId.get('coord-1'),worker=byId.get('worker-1');
 assert.equal(coord.name,'Task Manager Swarm Analysis');
 assert.equal(coord.repository,await fs.realpath(repo));
 assert.equal(coord.events[0].model,'gemini-4-neon');
 assert.equal(coord.events[0].effort,'medium');
 assert.ok(coord.events[0].cost>0);
 assert.equal(worker.name,'backend-analyst');
 assert.equal(worker.nameSource,'antigravity.summaries.agent_name');
 assert.equal(worker.parentId,'coord-1');
 assert.equal(worker.subagent,true);
 assert.equal(worker.repository,await fs.realpath(repo));
 assert.equal(worker.events[0].model,'gemini-4-neon');
 assert.equal(worker.events[0].effort,'high');
 assert.ok(worker.events[0].cost>0);
});
