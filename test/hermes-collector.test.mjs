import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {collect} from '../bridge/hermes-usage.mjs';
import {normalizeHermesUsage,HERMES_LIMIT_FILE,HERMES_LIMIT_INBOX} from '../lib/hermes-limits.mjs';
import {Store} from '../lib/store.mjs';
import {limitHistoryView} from '../public/limit-history.js';
import {install} from '../scripts/install-hermes-collector.mjs';
const raw=(session=20,weekly=18,reset='2026-10-03T17:13:36Z')=>({provider:'openai-codex',source:'usage_api',plan:'Plus',windows:[{label:'Session',used_percent:session,resets_at:'2026-09-29T03:14:00Z'},{label:'Weekly',used_percent:weekly,resets_at:reset}]});
async function fixture(t){const home=await fs.mkdtemp(path.join(process.env.TMPDIR||os.tmpdir(),'atlas-hermes-collector-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));return home;}
const settings=home=>({codexRoots:[],claudeRoots:[],hermesRoots:[home],prices:{},limitRetentionDays:90});
test('collector writes once per change only; unchanged polls, errors, resets and CLI extras do not grow files',async t=>{
 const home=await fixture(t),file=path.join(home,HERMES_LIMIT_FILE),inbox=path.join(home,HERMES_LIMIT_INBOX);let response=raw();
 const run=()=>collect({home,fetchUsage:async()=>JSON.stringify(response)});
 assert.deepEqual(await run(),{changed:true});const before=await fs.stat(file);assert.equal((await fs.readdir(inbox)).length,1);
 response={...response,details:['different note'],fetched_at:new Date().toISOString()};assert.deepEqual(await run(),{changed:false});assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);assert.equal((await fs.readdir(inbox)).length,1);
 response=raw(21);assert.deepEqual(await run(),{changed:true});assert.equal((await fs.readdir(inbox)).length,2);
 response=raw(20);assert.deepEqual(await run(),{changed:true});assert.equal((await fs.readdir(inbox)).length,3,'return to previous value is a real transition');
 response=raw(20,18,'2026-10-10T17:13:36Z');assert.deepEqual(await run(),{changed:true},'a reset starts a new window');
 const unchanged=await fs.stat(file);response={...raw(),windows:[]};await assert.rejects(run(),/keine gültigen/);assert.equal((await fs.stat(file)).mtimeMs,unchanged.mtimeMs);assert.equal((await fs.readdir(inbox)).length,4);
 assert.equal(normalizeHermesUsage({...raw(),provider:'other'}),null);
 assert.doesNotMatch(await fs.readFile(file,'utf8'),/details|fetched_at|secret|token/);
});
test('Atlas drains offline inbox only after persist; keeps returning values and does not grow cache on unchanged scans',async t=>{
 const home=await fixture(t),inbox=path.join(home,HERMES_LIMIT_INBOX),cache=path.join(home,'cache.json');let value=20;
 await collect({home,fetchUsage:async()=>JSON.stringify(raw(value))});value=21;await collect({home,fetchUsage:async()=>JSON.stringify(raw(value))});value=20;await collect({home,fetchUsage:async()=>JSON.stringify(raw(value))});
 const store=new Store(cache),first=await store.scan(settings(home));assert.equal(first.limitHistory.filter(p=>p.tool==='hermes').length,6);assert.equal(first.limits.hermes.primary.used_percent,20);assert.equal((await fs.readdir(inbox)).length,0);
 const mtime=(await fs.stat(cache)).mtimeMs;await store.scan(settings(home));assert.equal((await fs.stat(cache)).mtimeMs,mtime,'a repeat scan must not persist unchanged usage');
 const restored=new Store(cache);await restored.load();assert.equal(restored.snapshot(settings(home)).limitHistory.filter(p=>p.tool==='hermes').length,6);
 const html=limitHistoryView({history:restored.limitHistory,tool:'hermes',mode:'cost',period:'all',esc:String,date:String});assert.match(html,/data-limit-history-mode="cost"[^>]*aria-pressed="true"/);assert.match(html,/noch kein Kostenlimit hochrechnen/i);
});
test('installer creates only a fixed stopped user timer and service',{skip:process.platform!=='linux'},async t=>{
 const home=await fixture(t),config=path.join(home,'config');await install({configHome:config,home,cli:process.execPath,reload:false});
 const service=await fs.readFile(path.join(config,'systemd/user/session-atlas-hermes-usage.service'),'utf8'),timer=await fs.readFile(path.join(config,'systemd/user/session-atlas-hermes-usage.timer'),'utf8');
 assert.match(service,/Type=oneshot/);assert.match(timer,/OnUnitActiveSec=5min/);assert.doesNotMatch(timer,/OnBootSec|ExecStart/);assert.doesNotMatch(service,/WantedBy/);
 await install({configHome:config,home,cli:process.execPath,reload:false});assert.equal((await fs.readdir(path.join(config,'systemd/user'))).length,2);
});
