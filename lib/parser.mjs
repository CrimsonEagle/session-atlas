import path from 'node:path';
import {cleanSessionName} from './session-names.mjs';
export const PARSER_VERSION=6;
const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const stamp=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const agentId=v=>String(v||'').replace(/^agent-/,'');
function claudeSubagentPath(file) {
 const parts=path.normalize(file).split(path.sep),index=parts.map(part=>part.toLowerCase()).lastIndexOf('subagents');
 if(index<1)return null;
 return {id:agentId(path.basename(file,'.jsonl')),rootId:parts[index-1]};
}
export function newState(tool,file) {
 const claudeAgent=tool==='claude'?claudeSubagentPath(file):null;
 return {tool,file,parserVersion:PARSER_VERSION,offset:0,id:claudeAgent?.id||path.basename(file,'.jsonl'),cwd:'',name:'',nameSource:'',namePriority:0,title:'',branch:'',model:'unknown',tier:'standard',effort:'',origin:'',started:null,lastActivity:null,events:{},records:{},contextSamples:{},contextMarkers:{},limits:{},limitObservations:{},totals:null,malformed:0,contextWindow:null,contextUsed:null,subagent:Boolean(claudeAgent),parentId:claudeAgent?.rootId||'',relationType:claudeAgent?'subagent':'',relationEvidence:claudeAgent?'claude.subagents_directory':'',forkedFromId:''};
}
function setSessionName(state,value,source,priority) {
 const name=cleanSessionName(value);if(!name||priority<(state.namePriority||0))return;
 state.name=name;state.title=name;state.nameSource=source;state.namePriority=priority;
}
function normalized(u,tool) {
 const cache=n(u.cached_input_tokens??u.cache_read_input_tokens), write=n(u.cache_write_input_tokens??u.cache_creation_input_tokens);
 return {input:tool==='codex'?Math.max(0,n(u.input_tokens)-cache):n(u.input_tokens),cache,write,writeHour:Math.min(write,n(u.cache_creation?.ephemeral_1h_input_tokens)),output:n(u.output_tokens),reasoning:n(u.reasoning_output_tokens)};
}
export function ingest(s,x,observedLimits=null) {
 const p=x.payload||{};
 if(s.tool==='claude'&&x.type==='agent_metadata') {
  const ownId=agentId(x.agentId||x.agent_id);if(ownId)s.id=ownId;
  const parent=agentId(x.parentAgentId||x.parent_agent_id);
  if(parent) {
   const explicit=s.relationEvidence==='claude.agent_metadata.parentAgentId';
   if(explicit&&s.parentId&&s.parentId!==parent) {s.parentId='';s.relationType='ambiguous';s.relationEvidence='conflicting claude agent_metadata.parentAgentId';}
   else if(s.relationType!=='ambiguous') {s.parentId=parent;s.relationType='subagent';s.relationEvidence='claude.agent_metadata.parentAgentId';s.subagent=true;}
  }
 }
 if(s.tool==='claude'&&(s.subagent||!x.sessionId||String(x.sessionId)===s.id)) {
  if(x.type==='custom-title')setSessionName(s,x.customTitle,'claude.custom-title',3);
  else if(x.type==='agent-name')setSessionName(s,x.agentName,'claude.agent-name',3);
  else if(x.type==='ai-title')setSessionName(s,x.aiTitle||x.title,'claude.ai-title',2);
  else if(x.type==='summary')setSessionName(s,x.summary,'claude.summary',1);
 }
 const t=stamp(x.timestamp); if(!t) return;
 if(!s.started || t<s.started) s.started=t;
 if(!s.lastActivity || t>s.lastActivity) s.lastActivity=t;
 if(x.cwd) s.cwd=x.cwd;
 if(x.gitBranch) s.branch=x.gitBranch;
 if(s.tool==='claude') {
  if(x.sessionId&&!s.subagent) s.id=x.sessionId;
  const subtype=String(x.subtype||x.message?.subtype||'');
  if(x.type==='system'&&['compact_boundary','context_compaction','compaction'].includes(subtype)) {
   const marker={id:`claude:compact:${x.uuid||t}`,kind:'compaction',time:t,model:s.model,source:`claude.system.${subtype}`,responseRef:null};s.contextMarkers[marker.id]=marker;return;
  }
  if(x.type!=='assistant'||!x.message?.usage||x.message.model==='<synthetic>') return;
  const m=x.message; s.model=m.model||'unknown';
  const key=m.id||x.uuid||t;
  const e={id:`claude:${key}`,time:t,model:s.model,tier:m.usage.speed||'standard',geo:m.usage.inference_geo||'',...normalized(m.usage,'claude')};
  // Streaming chunks can repeat message IDs; retain the most complete usage.
  const old=s.events[key]; if(old) for(const k of ['input','cache','write','writeHour','output','reasoning']) e[k]=Math.max(old[k],e[k]);
  s.events[key]=e;
  const used=e.input+e.cache+e.write,window=n(m.usage.model_context_window||m.context_window||x.context_window)||null;
  if(used>0){const sample={id:`claude:context:${key}`,kind:'sample',time:t,model:s.model,usedTokens:used,windowTokens:window,source:'claude.message.usage',responseRef:String(key)};s.contextSamples[sample.id]=sample;s.contextUsed=used;if(window)s.contextWindow=window;}
  return;
 }
 if(x.type==='session_meta') {
  s.id=p.id||p.session_id||s.id; s.cwd=p.cwd||s.cwd;s.branch=p.git?.branch||s.branch;
  s.origin=p.originator||p.source; s.sessionStart=stamp(p.timestamp)||t;
  s.parentId=String(p.parent_thread_id||s.parentId||'');s.forkedFromId=String(p.forked_from_id||s.forkedFromId||'');
  if(s.parentId) {s.relationType=p.thread_source==='guardian_review'?'guardian_review':'subagent';s.relationEvidence='session_meta.parent_thread_id';}
  else if(s.forkedFromId) {s.relationType='fork';s.relationEvidence='session_meta.forked_from_id';}
  s.subagent=Boolean(s.parentId||p.source?.subagent||p.thread_source==='subagent'||p.thread_source==='guardian_review'||s.subagent);
 }
 if(x.type==='turn_context') {s.model=p.model||s.model;s.cwd=p.cwd||s.cwd;s.tier=p.service_tier||s.tier;s.effort=p.effort||p.reasoning_effort||s.effort;}
 if(p.type==='thread_settings_applied') {const z=p.thread_settings||p.settings||p;s.model=z.model||s.model;s.tier=z.service_tier||'standard';s.cwd=z.cwd||s.cwd;}
 const markerType=String(p.type||x.type||'');
 if(['context_compacted','thread_compacted','compaction','compact'].includes(markerType)) {const marker={id:`codex:compact:${p.id||p.turn_id||x.ordinal||t}`,kind:'compaction',time:t,model:s.model,source:`codex.${markerType}`,responseRef:p.response_id||null};s.contextMarkers[marker.id]=marker;}
 if(p.rate_limits) {
  const list=Array.isArray(p.rate_limits)?p.rate_limits:[p.rate_limits];
  for(const r of list) {const value={...r,observedAt:t};s.limits[r.limit_id||'codex']=value;s.limitObservations[`${r.limit_id||'codex'}:${t}`]=value;observedLimits?.push(value);}
 }
 const event=u=>({time:t,model:s.model,tier:s.tier,effort:s.effort||'',geo:'',...normalized(u,'codex')});
 if(x.type==='token_usage_record' && p.usage) {
  // Per-response records avoid cumulative resets and inherited parent histories.
  if(p.thread_id && p.thread_id!==s.id) return;
  if(s.sessionStart&&t<s.sessionStart) return;
  const key=p.response_id||`${p.turn_id}:${x.ordinal??t}`;
  s.records[key]={id:`codex:${key}`,...event(p.usage)}; return;
 }
 if(p.type!=='token_count'||!p.info) return;
 const info=p.info, total=info.total_token_usage;
 s.contextWindow=n(info.model_context_window)||s.contextWindow;
 if(info.last_token_usage) {
  s.contextUsed=n(info.last_token_usage.total_tokens)||n(info.last_token_usage.input_tokens)+n(info.last_token_usage.output_tokens);
  if(s.contextUsed>0){const reference=p.response_id||p.turn_id||x.ordinal||t,sample={id:`codex:context:${reference}:${t}`,kind:'sample',time:t,model:s.model,usedTokens:s.contextUsed,windowTokens:s.contextWindow||null,source:'codex.token_count.last_token_usage',responseRef:String(reference)};s.contextSamples[sample.id]=sample;}
 }
 let delta=info.last_token_usage;
 if(total) {
  const old=s.totals;
  const keys=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens'];
  if(old && keys.every(k=>n(old[k])===n(total[k]))) return;
  delta=old&&n(total.input_tokens)>=n(old.input_tokens)&&n(total.output_tokens)>=n(old.output_tokens)
   ? Object.fromEntries(keys.map(k=>[k,Math.max(0,n(total[k])-n(old[k]))]))
   : (old?(info.last_token_usage||total):total);
  s.totals=total;
 }
 if(!delta || (s.sessionStart&&t<s.sessionStart)) return;
 const key=`${t}:${JSON.stringify(delta)}`;s.events[key]={id:`codex:${s.id}:${key}`,...event(delta)};
}
export function sessionEvents(s) {return Object.values(Object.keys(s.records).length?s.records:s.events);}
