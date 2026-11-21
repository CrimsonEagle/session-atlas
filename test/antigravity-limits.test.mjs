import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AntigravityLimitError,createAntigravityLimitPoller,normalizeAntigravityLimit,parseAntigravityUsageOutput} from '../lib/antigravity-limits.mjs';
import {updateLimitHistory} from '../lib/limit-history.mjs';
import {Store} from '../lib/store.mjs';
import {antigravityModelMatchesQuota} from '../public/usage-overview.js';
import {estimateCostLimits,limitHistoryView} from '../public/limit-history.js';

const FIXTURE=JSON.stringify({
 conversation_id:'',
 status:'SUCCESS',
 response:'Gemini Models\tWeekly Limit Remaining\t98%\t2026-11-28T19:07:31Z\n',
 duration_seconds:0,
 num_turns:0,
 usage:{input_tokens:0,output_tokens:0,thinking_tokens:0,cache_read_tokens:0,total_tokens:0},
 command:{
  name:'usage',
  data:{
   description:'Within each group, models share a weekly limit and a 5-hour limit.',
   groups:[
    {
     name:'Gemini Models',
     description:'Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Gemini 3.8 Flash',
     buckets:[
      {id:'gemini-weekly',name:'Weekly Limit Remaining',window:'weekly',remaining_fraction:0.9815,reset_time:'2026-11-28T19:07:31Z'},
      {id:'gemini-5h',name:'Five Hour Limit Remaining',window:'5h',remaining_fraction:0.9353,reset_time:'2026-11-22T00:07:31Z'}
     ]
    },
    {
     name:'Claude and GPT models',
     description:'Models within this group: Claude Opus 5.5, Claude Sonnet 5.5, GPT-OSS 120B',
     buckets:[
      {id:'3p-weekly',name:'Weekly Limit Remaining',window:'weekly',remaining_fraction:0.885,reset_time:'2026-11-28T17:00:00Z'},
      {id:'3p-5h',name:'Five Hour Limit Remaining',window:'5h',remaining_fraction:0.9998,reset_time:'2026-11-22T00:11:46Z'}
     ]
    },
    {
     name:'Gemini 4 Argon',
     description:'For paid Pro plans, Argon quota is separate.',
     buckets:[
      {id:'gemini-argon-wtu-weekly',name:'Gemini 4 Argon Weekly Limit',window:'weekly',remaining_fraction:0.585,reset_time:'2026-11-27T22:18:50Z'}
     ]
    }
   ]
  }
 }
});

test('parseAntigravityUsageOutput parses all groups, buckets, full-bucket resets and leading log lines',()=>{
 const parsed=parseAntigravityUsageOutput(`INFO starting language server\n${FIXTURE}\n`,'2026-11-21T19:11:46Z');
 assert.equal(parsed.limit_id,'antigravity');
 assert.equal(parsed.source,'antigravity-cli');
 assert.equal(parsed.groups.length,3);
 assert.equal(parsed.buckets.length,5);
 assert.equal(parsed.primary.bucketId,'gemini-5h');
 assert.equal(parsed.primary.window_minutes,300);
 assert.equal(parsed.primary.used_percent,6.47);
 assert.equal(parsed.primary.resets_at,Math.floor(Date.parse('2026-11-22T00:07:31Z')/1000));
 assert.equal(parsed.secondary.bucketId,'gemini-weekly');
 assert.equal(parsed.secondary.window_minutes,10080);
 assert.equal(parsed.secondary.used_percent,1.85);
 // Full bucket (>= 0.9995) zeroes usage and drops rolling reset timestamp.
 const full3p=parsed.groups[1].buckets.find(b=>b.id==='3p-5h');
 assert.equal(full3p.full,true);
 assert.equal(full3p.used_percent,0);
 assert.equal(full3p.resets_at,null);
 assert.equal(parsed.groups[2].buckets.length,1);
 assert.equal(parsed.groups[2].buckets[0].used_percent,41.5);
 const roundTrip=normalizeAntigravityLimit(JSON.parse(JSON.stringify(parsed)));
 assert.deepEqual(roundTrip.buckets,parsed.buckets);
});

test('parseAntigravityUsageOutput tolerates malformed buckets and throws typed errors on invalid responses',()=>{
 const partial=parseAntigravityUsageOutput(JSON.stringify({
  status:'SUCCESS',
  command:{name:'usage',data:{groups:[{name:'Gemini Models',buckets:[{id:'bad',window:'5h'},{id:'gemini-5h',window:'5h',remaining_fraction:0.5,reset_time:'2026-11-22T00:00:00Z'}]}]}}
 }),'2026-11-21T20:00:00Z');
 assert.equal(partial.buckets.length,1);
 assert.equal(partial.primary.used_percent,50);
 assert.throws(()=>parseAntigravityUsageOutput(JSON.stringify({status:'ERROR',error:'not logged in'})),err=>err instanceof AntigravityLimitError&&err.code==='AGY_FAILED');
 assert.throws(()=>parseAntigravityUsageOutput(JSON.stringify({status:'SUCCESS',command:{name:'other',data:{}}})),err=>err instanceof AntigravityLimitError&&err.code==='AGY_PARSE_ERROR');
 assert.throws(()=>parseAntigravityUsageOutput('not json at all'),err=>err instanceof AntigravityLimitError&&err.code==='AGY_PARSE_ERROR');
});

test('createAntigravityLimitPoller deduplicates in-flight fetches and throttles rapid manual refreshes',async()=>{
 let calls=0,clock=Date.parse('2026-11-21T20:00:00Z');
 const recorded=[];
 const poller=createAntigravityLimitPoller({
  getSettings:()=>({antigravityLimitPollMinutes:15,hiddenProviders:[],antigravityRoots:['/agy']}),
  onLimit:limit=>{recorded.push(limit);},
  fetcher:async()=>{
   calls++;
   await new Promise(r=>setTimeout(r,20));
   return parseAntigravityUsageOutput(FIXTURE,new Date(clock).toISOString());
  },
  minManualIntervalMs:30_000,
  now:()=>clock
 });
 const [a,b]=await Promise.all([poller.refresh({force:true}),poller.refresh({force:true})]);
 assert.equal(calls,1);
 assert.equal(a.ok,true);assert.equal(b.ok,true);
 assert.equal(recorded.length,1);
 const throttled=await poller.refresh({force:true});
 assert.equal(throttled.throttled,true);
 assert.equal(calls,1);
 clock+=31_000;
 const next=await poller.refresh({force:true});
 assert.equal(next.ok,true);
 assert.equal(calls,2);
 poller.stop();
});

test('Antigravity limits persist in Store, populate multi-bucket history and extrapolate costs per quota group',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-agy-limits-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const cacheFile=path.join(dir,'usage-cache.json'),store=new Store(cacheFile);
 const observed='2026-11-21T19:11:46Z',now=Date.parse(observed);
 const limit=parseAntigravityUsageOutput(FIXTURE,observed);
 const settings={limitRetentionDays:90,limitThresholds:{antigravity:{300:[5,80],10080:[40,95]}}};
 const saved=await store.recordAntigravityLimit(limit,settings);
 assert.equal(saved.changed,true);
 assert.equal(store.limitHistory.length,5);
 // Alert fired for gemini-5h (6.47% >= 5%) and gemini-argon-wtu-weekly (41.5% >= 40%) separately.
 const alerts=store.takeLimitAlerts();
 assert.deepEqual(alerts.map(a=>[a.bucketId,a.threshold]).sort(),[['gemini-5h',5],['gemini-argon-wtu-weekly',40]]);
 // Reloading from disk restores antigravityLimits and history.
 const reloaded=new Store(cacheFile);
 await reloaded.load();
 assert.equal(reloaded.antigravityLimits.groups.length,3);
 const snap=reloaded.snapshot({claudeRoots:[],codexRoots:[],coworkRoots:[],hermesRoots:[],antigravityRoots:[],prices:{}});
 assert.equal(snap.limits.antigravity.primary.used_percent,6.47);
 // Model matching separates Gemini Models, Claude/GPT (3P), and Gemini 4 Argon.
 assert.equal(antigravityModelMatchesQuota('gemini-4-neon','Gemini Models','gemini-5h',{hasSeparateArgon:true}),true);
 assert.equal(antigravityModelMatchesQuota('gemini-4-argon','Gemini Models','gemini-5h',{hasSeparateArgon:true}),false);
 assert.equal(antigravityModelMatchesQuota('gemini-4-argon','Gemini 4 Argon','gemini-argon-wtu-weekly',{hasSeparateArgon:true}),true);
 assert.equal(antigravityModelMatchesQuota('claude-opus-5-5','Claude and GPT models','3p-weekly',{hasSeparateArgon:true}),true);
 assert.equal(antigravityModelMatchesQuota('gemini-4-neon','Claude and GPT models','3p-weekly',{hasSeparateArgon:true}),false);
 // Cost extrapolation matches only the corresponding model pool per quota group.
 const sessions=[{tool:'antigravity',events:[
  {time:'2026-11-21T19:08:00Z',model:'gemini-4-neon',cost:1.294},
  {time:'2026-11-21T19:09:00Z',model:'gemini-4-argon',cost:4.15},
  {time:'2026-11-21T19:10:00Z',model:'claude-opus-5-5',cost:2.3}
 ]}];
 const estimates=estimateCostLimits(reloaded.limitHistory,sessions,'antigravity');
 const gemini5h=estimates.find(p=>p.bucketId==='gemini-5h');
 const argonWeek=estimates.find(p=>p.bucketId==='gemini-argon-wtu-weekly');
 const claudeWeek=estimates.find(p=>p.bucketId==='3p-weekly');
 assert.ok(Math.abs(gemini5h.estimatedLimit-20)<1e-6);
 assert.ok(Math.abs(argonWeek.estimatedLimit-10)<1e-6);
 assert.ok(Math.abs(claudeWeek.estimatedLimit-20)<1e-6);
 // Limit history view renders quota selector and source label.
 const html=limitHistoryView({history:reloaded.limitHistory,sessions,tool:'antigravity',mode:'usage',period:'all',now,esc:String,date:String});
 assert.match(html,/id="limit-history-group"/);
 assert.match(html,/Gemini Models/);
 assert.match(html,/Claude and GPT models/);
 assert.match(html,/Gemini 4 Argon/);
 assert.match(html,/Antigravity-CLI/);
 // Deduplication prevents duplicate history rows on repeated identical readings.
 const again=updateLimitHistory([limit],reloaded.limitHistory,reloaded.limitNotified,{now:now+60_000,thresholds:settings.limitThresholds});
 assert.equal(again.added.length,0);
 assert.equal(again.alerts.length,0);
});
