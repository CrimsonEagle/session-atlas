import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {PARSER_VERSION,newState,ingest,sessionEvents} from '../lib/parser.mjs';
import {costFor} from '../lib/pricing.mjs';
const time='2026-09-11T10:00:00.000Z';
const event=(usage,total=usage,t=time)=>({timestamp:t,type:'event_msg',payload:{type:'token_count',info:{last_token_usage:usage,total_token_usage:total}}});
const usage=(input,output=10,cache=0)=>({input_tokens:input,output_tokens:output,cached_input_tokens:cache});
test('Codex repeated cumulative snapshots do not count the last response twice',()=>{
 const s=newState('codex','test.jsonl');ingest(s,event(usage(100,10,40)));ingest(s,event(usage(100,10,40),usage(100,10,40),'2026-09-11T10:01:00Z'));
 assert.equal(sessionEvents(s).length,1);assert.equal(sessionEvents(s)[0].input,60);assert.equal(sessionEvents(s)[0].cache,40);
});
test('First cumulative snapshot includes usage before the latest response',()=>{
 const s=newState('codex','test.jsonl');ingest(s,event(usage(20),usage(120,30)));assert.equal(sessionEvents(s)[0].input,120);assert.equal(sessionEvents(s)[0].output,30);
});
test('Codex cumulative deltas and resets remain nonnegative',()=>{
 const s=newState('codex','test.jsonl');ingest(s,event(usage(100)));ingest(s,event(usage(60,5),usage(160,15),'2026-09-11T10:01:00Z'));ingest(s,event(usage(20,2),usage(20,2),'2026-09-11T10:02:00Z'));
 assert.deepEqual(sessionEvents(s).map(e=>e.input),[100,60,20]);
});
test('Per-response records supersede duplicate cumulative events and deduplicate by response id',()=>{
 const s=newState('codex','test.jsonl');ingest(s,{timestamp:time,type:'session_meta',payload:{id:'thread',timestamp:time}});ingest(s,event(usage(100)));
 const record={timestamp:time,type:'token_usage_record',payload:{thread_id:'thread',response_id:'response',usage:usage(100)}};
 ingest(s,record);ingest(s,record);assert.equal(sessionEvents(s).length,1);assert.equal(sessionEvents(s)[0].input,100);
 ingest(s,{...record,payload:{...record.payload,thread_id:'parent',response_id:'other',usage:usage(500)}});assert.equal(sessionEvents(s).length,1);
});
test('Inherited history before session creation only establishes a cumulative baseline',()=>{
 const s=newState('codex','test.jsonl');ingest(s,{timestamp:time,type:'session_meta',payload:{id:'child',timestamp:time,source:{subagent:{}}}});
 ingest(s,event(usage(1000),usage(1000),'2026-09-11T09:59:00Z'));ingest(s,event(usage(40),usage(1040,20),'2026-09-11T10:01:00Z'));
 assert.equal(sessionEvents(s).length,1);assert.equal(sessionEvents(s)[0].input,40);assert.equal(s.subagent,true);
});
test('Codex session metadata preserves only explicit task relationships',()=>{
 const child=newState('codex','child.jsonl');ingest(child,{timestamp:time,type:'session_meta',payload:{id:'child',parent_thread_id:'parent',thread_source:'subagent'}});
 assert.equal(child.parserVersion,PARSER_VERSION);assert.equal(child.parentId,'parent');assert.equal(child.relationType,'subagent');assert.equal(child.relationEvidence,'session_meta.parent_thread_id');assert.equal(child.subagent,true);
 const review=newState('codex','review.jsonl');ingest(review,{timestamp:time,type:'session_meta',payload:{id:'review',parent_thread_id:'parent',thread_source:'guardian_review'}});
 assert.equal(review.relationType,'guardian_review');assert.equal(review.subagent,true);
 const fork=newState('codex','fork.jsonl');ingest(fork,{timestamp:time,type:'session_meta',payload:{id:'fork',forked_from_id:'source',thread_source:'user'}});
 assert.equal(fork.parentId,'');assert.equal(fork.forkedFromId,'source');assert.equal(fork.relationType,'fork');assert.equal(fork.subagent,false);
});
test('Claude message parentUuid is not inferred as a session relationship',()=>{
 const s=newState('claude','test.jsonl');ingest(s,{timestamp:time,type:'assistant',sessionId:'session',parentUuid:'message-parent',message:{id:'message',model:'claude-sonnet-4-6',usage:{input_tokens:1,output_tokens:1}}});
 assert.equal(s.parentId,'');assert.equal(s.relationType,'');assert.equal(s.forkedFromId,'');
});
test('Claude subagent paths and metadata preserve direct parents at arbitrary depth',()=>{
 const top=newState('claude',path.join('projects','root-session','subagents','agent-child.jsonl'));
 assert.equal(top.id,'child');assert.equal(top.parentId,'root-session');assert.equal(top.relationType,'subagent');assert.equal(top.relationEvidence,'claude.subagents_directory');
 ingest(top,{type:'agent_metadata',agentType:'Explore',parentAgentId:'root-session',spawnDepth:1});
 assert.equal(top.parentId,'root-session');assert.equal(top.relationEvidence,'claude.agent_metadata.parentAgentId');
 const nested=newState('claude',path.join('projects','root-session','subagents','agent-grandchild.jsonl'));
 ingest(nested,{type:'agent_metadata',parentAgentId:'child',spawnDepth:2});
 assert.equal(nested.id,'grandchild');assert.equal(nested.parentId,'child');assert.equal(nested.relationType,'subagent');assert.equal(nested.subagent,true);
});
test('Conflicting Claude parent metadata is marked ambiguous',()=>{
 const s=newState('claude',path.join('projects','root','subagents','agent-child.jsonl'));
 ingest(s,{type:'agent_metadata',parentAgentId:'first'});ingest(s,{type:'agent_metadata',parentAgentId:'second'});
 assert.equal(s.parentId,'');assert.equal(s.relationType,'ambiguous');assert.match(s.relationEvidence,/conflicting/);
});
test('Claude session names are read without timestamps and explicit names win',()=>{
 const s=newState('claude','session.jsonl');
 ingest(s,{type:'summary',summary:'Initial summary',sessionId:'session'});
 ingest(s,{type:'ai-title',aiTitle:'Generated title',sessionId:'session'});
 ingest(s,{type:'custom-title',customTitle:'  My\nNamed\tSession  ',sessionId:'session'});
 ingest(s,{type:'ai-title',aiTitle:'Later generated title',sessionId:'session'});
 assert.equal(s.name,'My Named Session');assert.equal(s.title,'My Named Session');assert.equal(s.nameSource,'claude.custom-title');assert.equal(s.namePriority,3);
});
test('Claude title records for another session are ignored',()=>{
 const s=newState('claude','session.jsonl');ingest(s,{type:'ai-title',aiTitle:'Wrong session',sessionId:'other'});
 assert.equal(s.name,'');assert.equal(s.title,'');
});
test('Claude subagent names belong to their log even when records carry the root session ID',()=>{
 const s=newState('claude',path.join('projects','root','subagents','agent-child.jsonl'));
 ingest(s,{type:'agent-name',agentName:'Research agent',sessionId:'root'});
 assert.equal(s.name,'Research agent');assert.equal(s.nameSource,'claude.agent-name');
});
test('Claude streaming chunks merge usage and retain one-hour cache writes',()=>{
 const s=newState('claude','test.jsonl');const x={timestamp:time,type:'assistant',sessionId:'claude-session',message:{id:'m1',model:'claude-opus-4-8',usage:{input_tokens:5,output_tokens:10,cache_read_input_tokens:100,cache_creation_input_tokens:20,cache_creation:{ephemeral_1h_input_tokens:15}}}};
 ingest(s,x);ingest(s,{...x,message:{...x.message,usage:{...x.message.usage,output_tokens:30}}});const e=sessionEvents(s)[0];
 assert.equal(sessionEvents(s).length,1);assert.equal(e.output,30);assert.equal(e.input,5);assert.equal(e.writeHour,15);
});
test('Context samples track explicit windows, model changes and compaction markers without affecting usage',()=>{
 const codex=newState('codex','test.jsonl');ingest(codex,{timestamp:time,type:'turn_context',payload:{model:'gpt-6-astra'}});ingest(codex,{timestamp:time,type:'event_msg',payload:{type:'token_count',turn_id:'one',info:{model_context_window:200000,last_token_usage:{input_tokens:90000,output_tokens:10000},total_token_usage:{input_tokens:90000,output_tokens:10000}}}});ingest(codex,{timestamp:'2026-09-11T10:01:00Z',type:'event_msg',payload:{type:'context_compacted'}});
 assert.equal(Object.values(codex.contextSamples)[0].usedTokens,100000);assert.equal(Object.values(codex.contextSamples)[0].windowTokens,200000);assert.equal(Object.values(codex.contextMarkers)[0].kind,'compaction');assert.equal(sessionEvents(codex).length,1);
 const claude=newState('claude','test.jsonl'),message={timestamp:time,type:'assistant',sessionId:'session',message:{id:'one',model:'claude-sonnet-4-6',usage:{input_tokens:100,cache_read_input_tokens:200,cache_creation_input_tokens:50,output_tokens:10,model_context_window:1000}}};ingest(claude,message);ingest(claude,{timestamp:'2026-09-11T10:02:00Z',type:'system',subtype:'compact_boundary',uuid:'compact'});
 assert.equal(Object.values(claude.contextSamples)[0].usedTokens,350);assert.equal(Object.values(claude.contextSamples)[0].windowTokens,1000);assert.equal(Object.values(claude.contextMarkers).length,1);assert.equal(sessionEvents(claude).length,1);
});
test('Limits update even when the token snapshot is unchanged',()=>{
 const s=newState('codex','test.jsonl');ingest(s,event(usage(100)));const x=event(usage(100));x.payload.rate_limits={limit_id:'codex',primary:{used_percent:34,window_minutes:300}};ingest(s,x);
 assert.equal(s.limits.codex.primary.used_percent,34);assert.equal(sessionEvents(s).length,1);
});
test('Codex keeps distinct historical limit observations for E3',()=>{
 const s=newState('codex','test.jsonl'),one=event(usage(100)),two=event(usage(100),usage(100),'2026-09-11T10:05:00Z');one.payload.rate_limits={limit_id:'codex',primary:{used_percent:20,window_minutes:300}};two.payload.rate_limits={limit_id:'codex',primary:{used_percent:30,window_minutes:300}};ingest(s,one);ingest(s,two);
 assert.equal(Object.keys(s.limitObservations).length,2);assert.deepEqual(Object.values(s.limitObservations).map(limit=>limit.primary.used_percent),[20,30]);
});
test('Prices account for cache TTL and do not double charge reasoning',()=>{
 const e={model:'claude-opus-4-8',input:1e6,cache:1e6,write:2e6,writeHour:1e6,output:1e6,reasoning:500000,tier:'standard'};
 assert.equal(costFor(e),46.75);assert.equal(costFor({...e,tier:'fast'}),93.5);
});
test('Unknown model and unsupported fast rate stay unknown',()=>{
 const e={model:'codex-auto-review',input:10,cache:0,write:0,writeHour:0,output:10};assert.equal(costFor(e),null);
 assert.equal(costFor({...e,model:'claude-sonnet-4-6',tier:'fast'}),null);
 assert.equal(costFor(e,{'codex-auto-review':[1,.1,5]}),.00006);
});
test('Dated Claude model names resolve and published Codex fast prices apply',()=>{
 const e={model:'claude-haiku-4-5-20251001',input:100,cache:0,write:0,writeHour:0,output:20};assert.equal(costFor(e),.0002);
 assert.equal(costFor({...e,model:'gpt-6-astra',tier:'priority'}),.004);
});
