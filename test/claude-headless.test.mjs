import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as limits from '../lib/claude-limits.mjs';
import {coworkLimit} from '../lib/cowork.mjs';
import {Store} from '../lib/store.mjs';
const {cliCandidates,normalizeBridge,normalizeCli,rateInfoWindows,readLimitInbox,readLimits}=limits;
const CLI_FILE='session-atlas-cli-limits.json',INBOX_DIR='session-atlas-limit-inbox';
// Every test drives a fake child instead of the official CLI, so no request is ever sent.
const wrapper=fileURLToPath(new URL('../bridge/atlas-claude.mjs',import.meta.url));
const FAKE=`import fs from 'node:fs';
const plan=JSON.parse(fs.readFileSync(process.env.FAKE_PLAN,'utf8'));
if(plan.argvFile)fs.writeFileSync(plan.argvFile,JSON.stringify(process.argv.slice(2)));
if(plan.stderr)process.stderr.write(plan.stderr);
if(plan.waitForTerm){process.on('SIGTERM',()=>{fs.writeFileSync(plan.waitForTerm,'TERM');process.exit(143);});process.stdout.write('ready\\n');setInterval(()=>{},1000);}
else {
 for(const chunk of plan.chunks||[]){await new Promise(done=>process.stdout.write(Buffer.from(chunk,'base64'),done));await new Promise(done=>setTimeout(done,2));}
 if(plan.signal)process.kill(process.pid,plan.signal);
 else process.exitCode=plan.exit??0;
}
`;
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-test-'));t.after(async()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-test-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});});await fs.writeFile(path.join(dir,'fake-claude.mjs'),FAKE);return dir;}
const STREAM=['--output-format','stream-json','--verbose'];
// Runs the wrapper around the fake child. `chunks` are Buffers written with pauses in between.
async function run(dir,{chunks=[],exit,signal,stderr,mode=[],args=STREAM,env={},binary=process.execPath,argvFile,waitForTerm,onSpawn}={}) {
 const planFile=path.join(dir,`plan-${Math.random().toString(36).slice(2)}.json`);
 await fs.writeFile(planFile,JSON.stringify({chunks:chunks.map(chunk=>Buffer.from(chunk).toString('base64')),exit,signal,stderr,argvFile,waitForTerm}));
 const file=path.join(dir,CLI_FILE),inbox=path.join(dir,INBOX_DIR);
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[wrapper,...mode,'--',binary,path.join(dir,'fake-claude.mjs'),...args],{env:{...process.env,ATLAS_CLI_LIMIT_FILE:file,ATLAS_RATE_LIMIT_INBOX:inbox,FAKE_PLAN:planFile,...env},stdio:['ignore','pipe','pipe']});
  const out=[],err=[];child.stdout.on('data',d=>out.push(d));child.stderr.on('data',d=>err.push(d));
  onSpawn?.(child);
  child.on('error',reject);child.on('close',(code,sig)=>resolve({code,signal:sig,out:Buffer.concat(out),err:Buffer.concat(err).toString('utf8'),file,inbox}));
 });
}
const rateEvent=(info,extra={})=>JSON.stringify({type:'rate_limit_event',rate_limit_info:info,uuid:'PRIVATE-UUID',session_id:'PRIVATE-SESSION',...extra});
const full={status:'allowed',rateLimitType:'five_hour',overageStatus:'PRIVATE-OVERAGE',unifiedWindows:{five_hour:{utilization:0.27,resetsAt:1791420600,label:'PRIVATE-LABEL'},seven_day:{utilization:0.12,resetsAt:1791655200}}};
const result=(text='done')=>JSON.stringify({type:'result',subtype:'success',is_error:false,result:text,session_id:'session',total_cost_usd:0.01});
const lines=(...items)=>items.map(item=>item+'\n');
const exists=file=>fs.access(file).then(()=>true,()=>false);
const inboxFiles=async dir=>(await fs.readdir(dir).catch(()=>[])).filter(name=>name.endsWith('.json'));

test('Rate limit info is parsed strictly; unknown values never become zero',()=>{
 assert.deepEqual(rateInfoWindows(full),{five_hour:{utilization:0.27,resetsAt:1791420600},seven_day:{utilization:0.12,resetsAt:1791655200}});
 assert.deepEqual(rateInfoWindows({rateLimitType:'seven_day',utilization:0.9,resetsAt:1774551600}),{seven_day:{utilization:0.9,resetsAt:1774551600}});
 for(const utilization of [null,'',true,false,'0.5',Number.NaN,Infinity,-0.1,undefined,{}])
  assert.deepEqual(rateInfoWindows({unifiedWindows:{five_hour:{utilization,resetsAt:1791420600},seven_day:null}}),{},`utilization ${String(utilization)} is unknown`);
 for(const resetsAt of [null,'',true,'1791420600',Number.NaN,-1])
  assert.deepEqual(rateInfoWindows({unifiedWindows:{five_hour:{utilization:0.3,resetsAt}}}),{five_hour:{utilization:0.3,resetsAt:null}});
 assert.deepEqual(rateInfoWindows(null),{});
 assert.deepEqual(rateInfoWindows({unifiedWindows:'broken'}),{});
 // Cowork shares the parser: a null utilization no longer reads as 0 %.
 assert.equal(coworkLimit({type:'rate_limit_event',timestamp:'2026-10-02T20:26:21.928Z',rate_limit_info:{unifiedWindows:{five_hour:{utilization:null,resetsAt:1790990400},seven_day:{utilization:false}}}}),null);
});

test('CLI readings normalize under their own source and never claim the status line',()=>{
 const observedAtMs=Date.parse('2026-10-07T10:00:00Z'),state={version:1,source:'claude-cli',observedAtMs,rate_limits:rateInfoWindows(full)};
 assert.deepEqual(normalizeCli(state),{limit_id:'claude',plan_type:'',source:'claude-cli',primary:{window_minutes:300,used_percent:27,resets_at:1791420600},secondary:{window_minutes:10080,used_percent:12,resets_at:1791655200},observedAt:'2026-10-07T10:00:00.000Z'});
 assert.equal(normalizeBridge(state),null,'a CLI reading is not a status line reading');
 assert.equal(normalizeCli({...state,source:'statusline'}),null);
 assert.equal(normalizeCli({...state,version:2}),null);
 assert.equal(normalizeCli({...state,rate_limits:{five_hour:{utilization:null},seven_day:{utilization:'0.1'}}}),null);
 const partial=normalizeCli({...state,rate_limits:{seven_day:{utilization:0.5,resetsAt:null}}});
 assert.equal(partial.primary,null);
 assert.deepEqual(partial.secondary,{window_minutes:10080,used_percent:50,resets_at:null});
});

test('Ordinary mode forwards stdout byte for byte and records only allowlisted limits',async t=>{
 const dir=await fixture(t),argvFile=path.join(dir,'argv.json');
 const big='{"type":"assistant","text":"'+'ä€😀x'.repeat(400000)+'"}\n';
 const bytes=Buffer.from(lines(JSON.stringify({type:'system',subtype:'init',session_id:'PRIVATE-SESSION',cwd:'/PRIVATE/PROJECT'}),rateEvent(full,{account:'PRIVATE@example.com'})).join('')+big+result('Grüße 😀'));
 // Split inside a multibyte character and inside the rate event to exercise chunk boundaries.
 const cut1=bytes.indexOf('rate_limit_event')+5,cut2=bytes.indexOf(Buffer.from('😀'))+2;
 const r=await run(dir,{chunks:[bytes.subarray(0,cut1),bytes.subarray(cut1,cut2),bytes.subarray(cut2)],exit:0,stderr:'child diagnostics\n',argvFile});
 assert.equal(r.code,0);
 assert.ok(r.out.equals(bytes),'stdout is unchanged, including the final line without newline');
 assert.equal(r.err,'child diagnostics\n','stderr is inherited');
 assert.deepEqual(JSON.parse(await fs.readFile(argvFile,'utf8')),STREAM,'caller flags are passed through untouched');
 const state=JSON.parse(await fs.readFile(r.file,'utf8'));
 assert.deepEqual(Object.keys(state).sort(),['observedAtMs','rate_limits','source','version']);
 assert.equal(state.source,'claude-cli');
 assert.deepEqual(state.rate_limits,{five_hour:{utilization:0.27,resetsAt:1791420600},seven_day:{utilization:0.12,resetsAt:1791655200}});
 const [entry,...rest]=await inboxFiles(r.inbox);
 assert.equal(rest.length,0);
 const queued=JSON.parse(await fs.readFile(path.join(r.inbox,entry),'utf8'));
 assert.deepEqual(Object.keys(queued).sort(),['id','observedAtMs','rate_limits','source','version']);
 for(const text of [JSON.stringify(state),JSON.stringify(queued)])assert.ok(!/PRIVATE|session|cwd|account/i.test(text),'no prompt, session, account or path data is stored');
 if(process.platform!=='win32') {
  assert.equal((await fs.stat(r.file)).mode&0o777,0o600);
  assert.equal((await fs.stat(path.join(r.inbox,entry))).mode&0o777,0o600);
 }
});

test('Malformed, null and partial windows never fake a complete snapshot',async t=>{
 const dir=await fixture(t);
 const r=await run(dir,{chunks:lines('not json {',rateEvent(null),rateEvent({unifiedWindows:{five_hour:null,seven_day:{utilization:true,resetsAt:1}}}),rateEvent({unifiedWindows:{five_hour:{utilization:'',resetsAt:1791420600}}}),JSON.stringify({type:'rate_limit_event'}),result())});
 assert.equal(r.code,0);
 assert.equal(await exists(r.file),false,'nothing usable, nothing written');
 assert.deepEqual(await inboxFiles(r.inbox),[]);
 // A complete reading, then a single window: history gets both, the snapshot keeps the pair.
 const second=await run(dir,{chunks:lines(rateEvent(full),rateEvent({status:'allowed_warning',rateLimitType:'five_hour',utilization:0.81,resetsAt:1791420600}),result())});
 assert.equal(second.code,0);
 assert.deepEqual(JSON.parse(await fs.readFile(second.file,'utf8')).rate_limits,rateInfoWindows(full));
 const queued=await readLimitInbox([path.join(dir,'projects')]);
 assert.deepEqual(queued.map(entry=>[entry.limit.source,entry.limit.primary?.used_percent,entry.limit.secondary?.used_percent??null]).sort(),[['claude-cli',27,12],['claude-cli',81,null]]);
});

test('Repeated identical readings are queued once',async t=>{
 const dir=await fixture(t);
 await run(dir,{chunks:lines(rateEvent(full),rateEvent(full),result())});
 await run(dir,{chunks:lines(rateEvent(full),result())});
 assert.equal((await inboxFiles(path.join(dir,INBOX_DIR))).length,1);
});

test('Without stream-json output the wrapper does not inspect stdout',async t=>{
 const dir=await fixture(t),bytes=Buffer.from(lines(rateEvent(full),result()).join(''));
 const r=await run(dir,{chunks:[bytes],args:['--output-format','text']});
 assert.equal(r.code,0);
 assert.ok(r.out.equals(bytes));
 assert.equal(await exists(r.file),false);
});

test('Result mode emits exactly the final result line and keeps collecting limits',async t=>{
 const dir=await fixture(t),large=result('Ergebnis 😀 '+'x'.repeat(3*1024*1024));
 const r=await run(dir,{mode:['--result-json'],chunks:[...lines(JSON.stringify({type:'system',subtype:'init'}),rateEvent(full),JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'{"type":"result"}'}]}})),large]});
 assert.equal(r.code,0);
 assert.equal(r.out.toString('utf8'),large+'\n');
 assert.equal(JSON.parse(await fs.readFile(r.file,'utf8')).source,'claude-cli');
 // An error result is still delivered with the child's exit code.
 const failed=await run(dir,{mode:['--result-json'],chunks:lines(JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true})),exit:1});
 assert.equal(failed.code,1);
 assert.deepEqual(JSON.parse(failed.out.toString('utf8')),{type:'result',subtype:'error_during_execution',is_error:true});
});

test('A successful run without a result fails instead of inventing one',async t=>{
 const dir=await fixture(t);
 const missing=await run(dir,{mode:['--result-json'],chunks:lines(rateEvent(full),JSON.stringify({type:'assistant'})),exit:0});
 assert.notEqual(missing.code,0);
 assert.equal(missing.out.length,0);
 assert.match(missing.err,/result/i);
 const crashed=await run(dir,{mode:['--result-json'],chunks:lines(JSON.stringify({type:'assistant'})),exit:7});
 assert.equal(crashed.code,7,'the child exit code wins');
 assert.equal(crashed.out.length,0);
});

test('Exit codes, signals and missing executables are preserved',async t=>{
 const dir=await fixture(t);
 assert.equal((await run(dir,{chunks:lines(result()),exit:3})).code,3);
 if(process.platform!=='win32') {
  const killed=await run(dir,{chunks:lines(rateEvent(full)),signal:'SIGTERM'});
  assert.equal(killed.signal,'SIGTERM');
  const marker=path.join(dir,'term.txt');
  const forwarded=await run(dir,{waitForTerm:marker,onSpawn:child=>child.stdout.once('data',()=>child.kill('SIGTERM'))});
  assert.equal(await fs.readFile(marker,'utf8'),'TERM','SIGTERM reaches the child');
  assert.equal(forwarded.code,143);
 }
 const missing=await run(dir,{binary:path.join(dir,'no-such-claude')});
 assert.equal(missing.code,127);
 assert.equal(missing.out.length,0);
 assert.match(missing.err,/ENOENT/);
 const relative=await run(dir,{binary:'node'});
 assert.equal(relative.code,2,'only an absolute binary is accepted, so the wrapper never resolves itself');
 assert.equal((await run(dir,{mode:['--unknown']})).code,2);
});

test('Storage problems never affect the wrapped run',async t=>{
 const dir=await fixture(t),blocker=path.join(dir,'blocker');
 await fs.writeFile(blocker,'');
 const bytes=Buffer.from(lines(rateEvent(full),result()).join(''));
 const r=await run(dir,{chunks:[bytes],exit:0,env:{ATLAS_CLI_LIMIT_FILE:path.join(blocker,'x',CLI_FILE),ATLAS_RATE_LIMIT_INBOX:path.join(blocker,'inbox')}});
 assert.equal(r.code,0);
 assert.ok(r.out.equals(bytes));
 assert.equal(r.err,'');
});

test('Wrapper and Atlas share a custom Claude configuration directory',async t=>{
 const dir=await fixture(t),roots=[path.join(dir,'projects')];
 assert.equal(limits.CLI_FILE,CLI_FILE);
 assert.deepEqual(cliCandidates(roots),[path.join(dir,CLI_FILE),path.join(path.dirname(dir),CLI_FILE)]);
 const r=await run(dir,{chunks:lines(rateEvent(full),result()),env:{CLAUDE_CONFIG_DIR:dir,ATLAS_CLI_LIMIT_FILE:'',ATLAS_RATE_LIMIT_INBOX:''}});
 assert.equal(r.code,0);
 const limit=await readLimits(roots);
 assert.equal(limit.source,'claude-cli');
 assert.equal(limit.primary.used_percent,27);
 assert.equal((await readLimitInbox(roots)).length,1);
});

test('The newest reading wins and keeps the configured plan without merging stale windows',async t=>{
 const dir=await fixture(t),roots=[path.join(dir,'projects')];
 const at=iso=>Date.parse(iso);
 await fs.writeFile(path.join(dir,'.claude.json'),JSON.stringify({oauthAccount:{userRateLimitTier:'default_claude_max_5x'},cachedUsageUtilization:{fetchedAtMs:at('2026-10-07T08:00:00Z'),utilization:{five_hour:{utilization:5,resets_at:null},seven_day:{utilization:6,resets_at:null}}}}));
 await fs.writeFile(path.join(dir,CLI_FILE),JSON.stringify({version:1,source:'claude-cli',observedAtMs:at('2026-10-07T10:00:00Z'),rate_limits:rateInfoWindows(full)}));
 const cli=await readLimits(roots);
 assert.equal(cli.source,'claude-cli');
 assert.equal(cli.plan_type,'Max 5×');
 assert.deepEqual([cli.primary.used_percent,cli.secondary.used_percent],[27,12]);
 await fs.writeFile(path.join(dir,'session-atlas-limits.json'),JSON.stringify({version:1,observedAtMs:at('2026-10-07T11:00:00Z'),rate_limits:{five_hour:{used_percentage:30}}}));
 const status=await readLimits(roots);
 assert.equal(status.source,'statusline');
 assert.equal(status.secondary,null,'the CLI weekly value is not merged into a newer partial reading');
});

test('Store imports CLI readings, retries failed persistence and drops them with the source',async t=>{
 const dir=await fixture(t),logs=path.join(dir,'projects'),inbox=path.join(dir,INBOX_DIR),cacheFile=path.join(dir,'cache.json');
 await fs.mkdir(logs);await fs.mkdir(inbox);
 const state=(iso,rate_limits)=>({version:1,source:'claude-cli',observedAtMs:Date.parse(iso),rate_limits});
 const first=state('2026-10-07T10:00:00Z',rateInfoWindows(full)),partial=state('2026-10-07T10:05:00Z',{five_hour:{utilization:0.31,resetsAt:1791420600}});
 await fs.writeFile(path.join(inbox,'one.json'),JSON.stringify({...first,id:'one'}));
 await fs.writeFile(path.join(inbox,'two.json'),JSON.stringify({...partial,id:'two'}));
 await fs.writeFile(path.join(dir,CLI_FILE),JSON.stringify(first));
 const settings={claudeRoots:[logs],codexRoots:[],prices:{},limitRetentionDays:90},store=new Store(cacheFile),persist=store.persist.bind(store);
 store.persist=async()=>{const error=Error('simulated');error.code='EIO';throw error;};
 const failed=await store.scan(settings);
 assert.equal(failed.limits.claude.source,'claude-cli');
 assert.equal(failed.claudeBridge.active,false,'the CLI wrapper is not reported as the status line bridge');
 const points=failed.limitHistory.filter(point=>point.tool==='claude');
 assert.deepEqual(points.map(point=>[point.windowMinutes,point.usedPercent,point.source]),[[300,27,'claude-cli'],[10080,12,'claude-cli'],[300,31,'claude-cli']],'snapshot and inbox copies of one reading are deduplicated');
 assert.equal((await inboxFiles(inbox)).length,2,'failed persistence keeps the inbox intact');
 store.persist=persist;
 await store.scan(settings);
 assert.deepEqual(await inboxFiles(inbox),[]);
 assert.equal(JSON.parse(await fs.readFile(cacheFile,'utf8')).limitHistory.filter(point=>point.source==='claude-cli').length,3);
 assert.equal((await store.scan({...settings,claudeRoots:[]})).limits.claude,undefined);
});

test('A reading whose queue write failed is queued once the inbox recovers',async t=>{
 const dir=await fixture(t),blocker=path.join(dir,'blocker'),env={ATLAS_RATE_LIMIT_INBOX:path.join(blocker,'inbox')};
 await fs.writeFile(blocker,'');
 const blocked=await run(dir,{chunks:lines(rateEvent(full),result()),env});
 assert.equal(blocked.code,0);
 assert.equal(blocked.err,'');
 await fs.rm(blocker);
 const next={unifiedWindows:{...full.unifiedWindows,five_hour:{utilization:0.4,resetsAt:1791420600}}};
 await run(dir,{chunks:lines(rateEvent(full),result()),env});
 const last=await run(dir,{chunks:lines(rateEvent(next),result()),env});
 const queued=await Promise.all((await inboxFiles(env.ATLAS_RATE_LIMIT_INBOX)).map(async name=>JSON.parse(await fs.readFile(path.join(env.ATLAS_RATE_LIMIT_INBOX,name),'utf8'))));
 queued.sort((a,b)=>a.observedAtMs-b.observedAtMs);
 assert.deepEqual(queued.map(entry=>entry.rate_limits.five_hour.utilization),[0.27,0.4],'the reading lost to the broken inbox is queued before the next value');
 assert.deepEqual(JSON.parse(await fs.readFile(last.file,'utf8')).rate_limits,rateInfoWindows(next));
});

test('A snapshot that failed after a successful queue is repaired by the next identical reading',async t=>{
 const dir=await fixture(t),blocker=path.join(dir,'blocker'),file=path.join(blocker,CLI_FILE);
 await fs.writeFile(blocker,'');
 const blocked=await run(dir,{chunks:lines(rateEvent(full),result()),env:{ATLAS_CLI_LIMIT_FILE:file}});
 assert.equal(blocked.code,0);
 assert.equal((await inboxFiles(blocked.inbox)).length,1);
 await fs.rm(blocker);
 await run(dir,{chunks:lines(rateEvent(full),result()),env:{ATLAS_CLI_LIMIT_FILE:file}});
 assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).rate_limits,rateInfoWindows(full));
});

test('Result mode taps rate limits only when stream-json output was requested',async t=>{
 const dir=await fixture(t),argvFile=path.join(dir,'argv.json'),args=['-p','hi','--output-format','text'];
 const r=await run(dir,{mode:['--result-json'],args,argvFile,chunks:lines(rateEvent(full),result())});
 assert.equal(r.code,0);
 assert.equal(r.out.toString('utf8'),result()+'\n');
 assert.deepEqual(JSON.parse(await fs.readFile(argvFile,'utf8')),args,'child flags stay unmodified');
 assert.equal(await exists(r.file),false);
 assert.deepEqual(await inboxFiles(r.inbox),[]);
});

test('Unrepresentable resets, timestamps and fractions stay unknown instead of throwing',()=>{
 for(const resetsAt of [1e100,Number.MAX_VALUE,8.64e12+1])
  assert.deepEqual(rateInfoWindows({unifiedWindows:{five_hour:{utilization:0.3,resetsAt}}}),{five_hour:{utilization:0.3,resetsAt:null}},`resetsAt ${resetsAt}`);
 assert.deepEqual(rateInfoWindows({unifiedWindows:{five_hour:{utilization:1e305,resetsAt:1791420600}}}),{},'a fraction that overflows as a percentage is unknown');
 const state={version:1,source:'claude-cli',observedAtMs:1e100,rate_limits:rateInfoWindows(full)};
 assert.equal(normalizeCli(state),null);
});

test('Store scans survive corrupted reset metadata and never invent a 1970 reset',async t=>{
 const dir=await fixture(t),logs=path.join(dir,'projects'),inbox=path.join(dir,INBOX_DIR);
 await fs.mkdir(logs);await fs.mkdir(inbox);
 const observedAtMs=Date.parse('2026-10-07T10:00:00Z');
 await fs.writeFile(path.join(inbox,'unknown.json'),JSON.stringify({version:1,source:'claude-cli',observedAtMs,rate_limits:{five_hour:{utilization:0.27,resetsAt:null}},id:'unknown'}));
 await fs.writeFile(path.join(inbox,'huge.json'),JSON.stringify({version:1,source:'claude-cli',observedAtMs:observedAtMs+1000,rate_limits:{five_hour:{utilization:0.28,resetsAt:1e100}},id:'huge'}));
 await fs.writeFile(path.join(dir,'session-atlas-limits.json'),JSON.stringify({version:1,observedAtMs:observedAtMs+2000,rate_limits:{five_hour:{used_percentage:29,resets_at:1e100}}}));
 const store=new Store(path.join(dir,'cache.json'));
 const scan=await store.scan({claudeRoots:[logs],codexRoots:[],prices:{},limitRetentionDays:90});
 const points=scan.limitHistory.filter(point=>point.tool==='claude');
 assert.deepEqual(points.map(point=>[point.usedPercent,point.resetsAt]),[[27,null],[28,null],[29,null]]);
});
