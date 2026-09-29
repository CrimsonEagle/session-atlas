import test from 'node:test';
import assert from 'node:assert/strict';
import {billingCostOrigin,billingProviderRows,billingProviderSessions,formatBillingCost,placeProviderCards,prioritizeUsageTools,usageWindow,visibleBillingRows} from '../public/usage-overview.js';

const sessions=[
 {id:'hermes-a',tool:'hermes',events:[
  {provider:'openrouter',cost:.12,reportedCost:.12,model:'a'},
  {provider:'openrouter',cost:null,model:'b'},
  {provider:'openai-codex',cost:2.5,model:'c'},
  {provider:'other-api',cost:.3,model:'d'}]},
 {id:'hermes-b',tool:'hermes',events:[{provider:'openrouter',cost:.08,model:'e'}]},
 {id:'codex-a',tool:'codex',events:[{cost:1,model:'f'}]}
];

test('billing rows separate explicit external providers from tools and subscription estimates',()=>{
 const rows=billingProviderRows(sessions);
 assert.deepEqual(rows.map(row=>row.provider),['openrouter','other-api']);
 assert.equal(rows[0].cost,.2);
 assert.equal(rows[0].requests,3); // null-cost event is counted separately
 assert.equal(rows[0].unknown,1);
 assert.equal(rows[0].reported,1);
 assert.deepEqual(rows[0].tools,['hermes']);
 assert.equal(rows[1].cost,.3);
});

test('provider selection keeps only the chosen billing events within each session',()=>{
 const selected=billingProviderSessions(sessions,'openrouter');
 assert.deepEqual(selected.map(row=>row.id),['hermes-a','hermes-b']);
 assert.deepEqual(selected[0].events.map(event=>event.model),['a','b']);
 assert.equal(billingProviderSessions(sessions,'openai-codex')[0].events[0].model,'c');
});

test('an empty period produces no invented account balance or subscription budget',()=>{
 assert.deepEqual(billingProviderRows([]),[]);
 assert.deepEqual(billingProviderRows([{tool:'hermes',events:[{provider:'openrouter',cost:null}]}])[0].cost,0);
});

test('the first two visible provider cards sit beside the chart and all later cards move below',()=>{
 assert.deepEqual(prioritizeUsageTools(['new-tool','claude','codex','hermes','future']),['claude','codex','hermes','new-tool','future']);
 assert.deepEqual(placeProviderCards(['codex','claude','hermes'],['openrouter']),{beside:['codex','claude'],below:['hermes','openrouter']});
 assert.deepEqual(placeProviderCards(['claude','hermes'],['openrouter']),{beside:['claude','hermes'],below:['openrouter']});
 assert.deepEqual(placeProviderCards(['hermes'],['openrouter']),{beside:['hermes','openrouter'],below:[]});
 assert.deepEqual(placeProviderCards([],['openrouter']),{beside:['openrouter'],below:[]});
 assert.deepEqual(placeProviderCards([],[]),{beside:[],below:[]});
 assert.deepEqual(placeProviderCards(['codex','claude'],['openrouter'],0),{beside:[],below:['codex','claude','openrouter']});
});

test('OpenRouter visibility hides only its billing card, not Hermes usage or other providers',()=>{
 const rows=billingProviderRows(sessions);
 assert.deepEqual(visibleBillingRows(rows,[]).map(row=>row.provider),['openrouter','other-api']);
 assert.deepEqual(visibleBillingRows(rows,['openrouter']).map(row=>row.provider),['other-api']);
 assert.deepEqual(visibleBillingRows(rows,['hermes']).map(row=>row.provider),['openrouter','other-api']);
 assert.equal(sessions[0].events.length,4);
 assert.deepEqual(placeProviderCards(['codex','hermes'],visibleBillingRows(rows,['openrouter']).map(row=>row.provider)),{beside:['codex','hermes'],below:['other-api']});
});

test('provider cost origin distinguishes reported, estimated and mixed values',()=>{
 assert.equal(billingCostOrigin({requests:2,unknown:0,reported:2}),'gemeldet');
 assert.equal(billingCostOrigin({requests:3,unknown:1,reported:1}),'teils gemeldet, teils geschätzt');
 assert.equal(billingCostOrigin({requests:2,unknown:0,reported:0}),'geschätzt');
});

test('small nonzero provider amounts are not displayed as zero',()=>{
 assert.equal(formatBillingCost(.0043,'de-DE'),'0,0043 $');
 assert.equal(formatBillingCost(0,'de-DE'),'0,00 $');
 assert.equal(formatBillingCost(.11,'de-DE'),'0,11 $');
});

test('usage window keeps saved readings and hides missing or reset windows',()=>{
 const now=Date.parse('2026-09-27T12:00:00Z');
 const window={used_percent:42,resets_at:(now+3600000)/1000};
 assert.deepEqual(usageWindow(window,{now}),{known:true,used:42,reset:now+3600000,expired:false});
 assert.equal(usageWindow({...window,resets_at:(now-1000)/1000},{now}).expired,true);
 assert.equal(usageWindow(null,{now}).known,false);
 assert.equal(usageWindow({...window,used_percent:NaN},{now}).known,false);
});

test('saved limits stay visible regardless of age or collector state until their reset',()=>{
 const now=Date.parse('2026-09-29T12:00:00Z'),window={used_percent:42,resets_at:(now+3*86400000)/1000};
 const saved=usageWindow(window,{now,observedAt:'2026-09-26T12:00:00Z',serviceFresh:false});
 assert.equal(saved.known,true);assert.equal(saved.expired,false);
 assert.equal(usageWindow({...window,resets_at:null},{now,observedAt:'2026-09-26T12:00:00Z'}).known,true);
 assert.equal(usageWindow(window,{now:window.resets_at*1000}).known,false);
 assert.equal(usageWindow({...window,used_percent:0},{now}).known,true);
});
