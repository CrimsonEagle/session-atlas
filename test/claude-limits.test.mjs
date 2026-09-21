import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BRIDGE_FILE,INBOX_DIR,bridgeCandidates,configCandidates,inboxCandidates,normalize,normalizeBridge,planLabel,readLimitInbox,readLimits} from '../lib/claude-limits.mjs';
import {Store} from '../lib/store.mjs';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-test-'));t.after(async()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-test-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});});return dir;}
const config=(fetchedAtMs,utilization)=>({
 oauthAccount:{userRateLimitTier:'default_claude_max_5x',fullName:'PRIVATE NAME'},
 projects:{'C:/example':{history:['PRIVATE PROMPT TEXT']}},
 cachedUsageUtilization:{fetchedAtMs,accountUuid:'PRIVATE-ACCOUNT-UUID',utilization}
});
const windows={
 five_hour:{utilization:16,resets_at:'2026-09-13T12:40:00.150533+00:00'},
 seven_day:{utilization:3,resets_at:'2026-09-15T12:00:00.150559+00:00'}
};
const statusline={five_hour:{used_percentage:42,resets_at:1789000000},seven_day:{used_percentage:9,resets_at:1789473600}};
const bridgeState=(observedAtMs,rate_limits=statusline)=>({version:1,observedAtMs,rate_limits});
const script=fileURLToPath(new URL('../bridge/atlas-statusline.mjs',import.meta.url));
function runBridge(args,input,env={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script,...args],{env:{...process.env,...env}});
  let out='';child.stdout.on('data',d=>{out+=d;});
  child.on('error',reject);child.on('exit',code=>resolve({code,out}));
  child.stdin.end(input);
 });
}
test('Claude utilization is normalized into the Codex window shape',()=>{
 const r=normalize(config(Date.parse('2026-09-13T10:00:00Z'),windows));
 assert.equal(r.limit_id,'claude');
 assert.equal(r.source,'config');
 assert.equal(r.plan_type,'Max 5×');
 assert.equal(r.observedAt,'2026-09-13T10:00:00.000Z');
 assert.deepEqual(r.primary,{window_minutes:300,used_percent:16,resets_at:Math.floor(Date.parse('2026-09-13T12:40:00.150533+00:00')/1000)});
 assert.deepEqual(r.secondary,{window_minutes:10080,used_percent:3,resets_at:Math.floor(Date.parse('2026-09-15T12:00:00.150559+00:00')/1000)});
 assert.equal(planLabel('default_claude_max_20x'),'Max 20×');
 assert.equal(planLabel('default_something_new'),'something new');
 assert.equal(planLabel(undefined),'');
});
test('Status line percentages and epoch resets normalize to the same shape',()=>{
 const r=normalizeBridge(bridgeState(Date.parse('2026-09-13T10:00:00Z')));
 assert.equal(r.limit_id,'claude');
 assert.equal(r.source,'statusline');
 assert.equal(r.plan_type,'');
 assert.equal(r.observedAt,'2026-09-13T10:00:00.000Z');
 assert.deepEqual(r.primary,{window_minutes:300,used_percent:42,resets_at:1789000000});
 assert.deepEqual(r.secondary,{window_minutes:10080,used_percent:9,resets_at:1789473600});
 // An unknown payload version is ignored rather than guessed at.
 assert.equal(normalizeBridge({...bridgeState(Date.now()),version:2}),null);
 assert.equal(normalizeBridge({}),null);
});
test('Missing measurements stay unknown instead of becoming zero',()=>{
 assert.equal(normalize({}),null);
 assert.equal(normalize(config(0,windows)),null);
 assert.equal(normalize(config(Date.parse('2026-09-13T10:00:00Z'),{})),null);
 assert.equal(normalize(config(Date.parse('2026-09-13T10:00:00Z'),{five_hour:null,seven_day:null})),null);
 assert.equal(normalizeBridge(bridgeState(Date.now(),{})),null);
 // A window without a reset timestamp keeps its percentage; the UI decides how to label it.
 const r=normalize(config(Date.parse('2026-09-13T10:00:00Z'),{five_hour:{utilization:7,resets_at:null}}));
 assert.deepEqual(r.primary,{window_minutes:300,used_percent:7,resets_at:null});
 assert.equal(r.secondary,null);
});
test('Both config layouts are probed and the newest measurement wins',async t=>{
 const dir=await fixture(t),nested=path.join(dir,'config');
 await fs.mkdir(path.join(nested,'projects'),{recursive:true});
 const roots=[path.join(nested,'projects')];
 assert.deepEqual(configCandidates(roots),[path.join(nested,'.claude.json'),path.join(dir,'.claude.json')]);
 assert.deepEqual(bridgeCandidates(roots),[path.join(nested,'session-atlas-limits.json'),path.join(dir,'session-atlas-limits.json')]);
 assert.deepEqual(inboxCandidates(roots),[path.join(nested,INBOX_DIR),path.join(dir,INBOX_DIR)]);
 const warnings=[];
 assert.equal(await readLimits(roots,warnings),null);
 assert.deepEqual(warnings,[]);
 await fs.writeFile(path.join(dir,'.claude.json'),JSON.stringify(config(Date.parse('2026-09-10T10:00:00Z'),windows)));
 assert.equal((await readLimits(roots,warnings)).observedAt,'2026-09-10T10:00:00.000Z');
 await fs.writeFile(path.join(nested,'.claude.json'),JSON.stringify(config(Date.parse('2026-09-13T10:00:00Z'),windows)));
 assert.equal((await readLimits(roots,warnings)).observedAt,'2026-09-13T10:00:00.000Z');
 assert.deepEqual(warnings,[]);
 await fs.writeFile(path.join(nested,'.claude.json'),'{ broken');
 assert.equal((await readLimits(roots,warnings)).observedAt,'2026-09-10T10:00:00.000Z');
 assert.equal(warnings.length,1);
});
test('The fresher source wins and the plan name survives a status line measurement',async t=>{
 const dir=await fixture(t),nested=path.join(dir,'config');
 await fs.mkdir(path.join(nested,'projects'),{recursive:true});
 const roots=[path.join(nested,'projects')],warnings=[];
 const bridgeFile=path.join(nested,'session-atlas-limits.json'),configFile=path.join(nested,'.claude.json');
 await fs.writeFile(configFile,JSON.stringify(config(Date.parse('2026-09-08T10:00:00Z'),windows)));
 assert.equal((await readLimits(roots,warnings)).source,'config');
 await fs.writeFile(bridgeFile,JSON.stringify(bridgeState(Date.parse('2026-09-13T10:00:00Z'))));
 const fresh=await readLimits(roots,warnings);
 assert.equal(fresh.source,'statusline');
 assert.equal(fresh.primary.used_percent,42);
 assert.equal(fresh.plan_type,'Max 5×','the plan name is only known to the configuration');
 // A stale bridge file must not displace a newer configuration measurement.
 await fs.writeFile(configFile,JSON.stringify(config(Date.parse('2026-09-14T10:00:00Z'),windows)));
 assert.equal((await readLimits(roots,warnings)).source,'config');
 assert.deepEqual(warnings,[]);
});
test('The bridge stores only the rate limit block and never fails loudly',async t=>{
 const dir=await fixture(t),file=path.join(dir,'session-atlas-limits.json');
 const payload=JSON.stringify({model:{display_name:'Opus 5'},cwd:'C:/PRIVATE/PROJECT',gitBranch:'PRIVATE-BRANCH',session_id:'PRIVATE-SESSION',context_window:{context_window_size:200000},rate_limits:statusline});
 const {code,out}=await runBridge([],payload,{ATLAS_RATE_LIMIT_FILE:file});
 assert.equal(code,0);
 assert.match(out,/Opus 5 · 5 h 42 % · Woche 9 %/);
 const state=JSON.parse(await fs.readFile(file,'utf8'));
 assert.deepEqual(Object.keys(state).sort(),['observedAtMs','rate_limits','version']);
 assert.ok(!JSON.stringify(state).includes('PRIVATE'),'no payload field beyond rate_limits is stored');
 assert.equal(normalizeBridge(state).primary.used_percent,42);
 const inbox=path.join(dir,INBOX_DIR),events=(await fs.readdir(inbox)).filter(name=>name.endsWith('.json'));
 assert.equal(events.length,1);
 const queued=JSON.parse(await fs.readFile(path.join(inbox,events[0]),'utf8'));
 assert.deepEqual(Object.keys(queued).sort(),['id','observedAtMs','rate_limits','version']);
 assert.ok(!JSON.stringify(queued).includes('PRIVATE'),'queued measurements retain no unrelated status-line fields');
 // Unparsable input and payloads without limits leave both the status line and the file intact.
 const other=path.join(dir,'other.json');
 assert.equal((await runBridge([],'not json at all',{ATLAS_RATE_LIMIT_FILE:other})).code,0);
 assert.equal((await runBridge([],JSON.stringify({model:{display_name:'Opus 5'}}),{ATLAS_RATE_LIMIT_FILE:other})).code,0);
 assert.equal(await fs.access(other).then(()=>true,()=>false),false);
});
test('The bridge queues changed measurements without accumulating unchanged renders',async t=>{
 const dir=await fixture(t),file=path.join(dir,BRIDGE_FILE),inbox=path.join(dir,INBOX_DIR),payload=JSON.stringify({rate_limits:statusline});
 await runBridge(['--quiet'],payload,{ATLAS_RATE_LIMIT_FILE:file});
 await runBridge(['--quiet'],payload,{ATLAS_RATE_LIMIT_FILE:file});
 assert.equal((await fs.readdir(inbox)).filter(name=>name.endsWith('.json')).length,1);
 const changed={...statusline,five_hour:{...statusline.five_hour,used_percentage:43}};
 await runBridge(['--quiet'],JSON.stringify({rate_limits:changed}),{ATLAS_RATE_LIMIT_FILE:file});
 const queued=await readLimitInbox([path.join(dir,'projects')]);
 assert.deepEqual(queued.map(entry=>entry.limit.primary.used_percent).sort((a,b)=>a-b),[42,43]);
});
test('Quiet mode prints nothing and a wrapped command still renders the line',async t=>{
 const dir=await fixture(t),file=path.join(dir,'session-atlas-limits.json');
 const payload=JSON.stringify({model:{display_name:'Opus 5'},rate_limits:statusline});
 const quiet=await runBridge(['--quiet'],payload,{ATLAS_RATE_LIMIT_FILE:file});
 assert.equal(quiet.out,'');
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).version,1);
 await fs.rm(file);
 const reader="let s='';process.stdin.on('data',d=>{s+=d;}).on('end',()=>process.stdout.write('WRAPPED:'+JSON.parse(s).model.display_name));";
 const wrapped=await runBridge(['--',process.execPath,'-e',reader],payload,{ATLAS_RATE_LIMIT_FILE:file});
 assert.equal(wrapped.code,0);
 assert.equal(wrapped.out,'WRAPPED:Opus 5','the wrapped command receives the untouched payload and owns the output');
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).version,1,'wrapping still records the measurement');
 // A missing wrapped command must not take the status line down.
 assert.equal((await runBridge(['--','definitely-not-a-real-command-xyz'],payload,{ATLAS_RATE_LIMIT_FILE:file})).code,0);
});
test('Claude limits reach the snapshot without caching the configuration',async t=>{
 const dir=await fixture(t),logs=path.join(dir,'projects');
 await fs.mkdir(logs);
 const settings={claudeRoots:[logs],codexRoots:[],prices:{}};
 await fs.writeFile(path.join(logs,'session.jsonl'),JSON.stringify({type:'assistant',timestamp:'2026-09-13T09:00:00Z',sessionId:'session',cwd:'C:/example',message:{id:'one',model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:10}}})+'\n');
 await fs.writeFile(path.join(dir,'.claude.json'),JSON.stringify(config(Date.parse('2026-09-13T10:00:00Z'),windows)));
 const cacheFile=path.join(dir,'cache.json'),store=new Store(cacheFile);
 const snapshot=await store.scan(settings);
 assert.equal(snapshot.limits.claude.plan_type,'Max 5×');
 assert.equal(snapshot.limits.claude.primary.used_percent,16);
 assert.equal(snapshot.claudeBridge.file,path.join(dir,'session-atlas-limits.json'));
 assert.equal(snapshot.claudeBridge.active,false);
 assert.deepEqual(store.stats.warnings,[]);
 const saved=await fs.readFile(cacheFile,'utf8');
 for(const secret of ['PRIVATE-ACCOUNT-UUID','PRIVATE NAME','PRIVATE PROMPT TEXT','cachedUsageUtilization'])assert.ok(!saved.includes(secret),`${secret} must not be cached`);
 // A bridge measurement taken later takes over and is reported as the active source.
 await fs.writeFile(path.join(dir,'session-atlas-limits.json'),JSON.stringify(bridgeState(Date.parse('2026-09-13T11:00:00Z'))));
 const fresh=await store.scan(settings);
 assert.equal(fresh.limits.claude.source,'statusline');
 assert.equal(fresh.claudeBridge.active,true);
 // A restored store reports no stale percentages until it has scanned again.
 const restored=new Store(cacheFile);await restored.load();
 assert.equal(restored.snapshot(settings).limits.claude,undefined);
 // Dropping the Claude source removes the limit as well.
 assert.equal((await store.scan({...settings,claudeRoots:[]})).limits.claude,undefined);
});
test('Queued limit measurements are committed before their inbox files are removed',async t=>{
 const dir=await fixture(t),logs=path.join(dir,'projects'),inbox=path.join(dir,INBOX_DIR),cacheFile=path.join(dir,'cache.json');
 await fs.mkdir(logs);await fs.mkdir(inbox);
 const first=bridgeState(Date.parse('2026-09-13T10:00:00Z')),
  second=bridgeState(Date.parse('2026-09-13T10:05:00Z'),{...statusline,five_hour:{...statusline.five_hour,used_percentage:47}});
 await fs.writeFile(path.join(inbox,'one.json'),JSON.stringify({...first,id:'one'}));
 await fs.writeFile(path.join(inbox,'two.json'),JSON.stringify({...second,id:'two'}));
 const settings={claudeRoots:[logs],codexRoots:[],prices:{},limitRetentionDays:90},store=new Store(cacheFile),persist=store.persist.bind(store);
 store.persist=async()=>{const error=Error('simulated');error.code='EIO';throw error;};
 const failed=await store.scan(settings);
 assert.equal(failed.limitHistory.filter(point=>point.tool==='claude').length,3,'the unchanged weekly value is deduplicated');
 assert.equal((await fs.readdir(inbox)).filter(name=>name.endsWith('.json')).length,2,'failed persistence keeps the inbox intact');
 assert.ok(failed.stats.warnings.some(warning=>warning.includes('EIO')));
 store.persist=persist;
 await store.scan(settings);
 assert.deepEqual((await fs.readdir(inbox)).filter(name=>name.endsWith('.json')),[],'a successful retry acknowledges the imported files');
 const saved=JSON.parse(await fs.readFile(cacheFile,'utf8'));
 assert.equal(saved.limitHistory.filter(point=>point.tool==='claude').length,3);
});
