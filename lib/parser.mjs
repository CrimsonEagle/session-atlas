import path from 'node:path';
const n=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const stamp=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function newState(tool,file) {
 return {tool,file,offset:0,id:path.basename(file,'.jsonl'),cwd:'',title:'',branch:'',model:'unknown',tier:'standard',started:null,lastActivity:null,events:{},records:{},limits:{},totals:null,malformed:0,contextWindow:null,contextUsed:null,subagent:file.includes('subagents')};
}
function normalized(u,tool) {
 const cache=n(u.cached_input_tokens??u.cache_read_input_tokens), write=n(u.cache_write_input_tokens??u.cache_creation_input_tokens);
 return {input:tool==='codex'?Math.max(0,n(u.input_tokens)-cache):n(u.input_tokens),cache,write,writeHour:Math.min(write,n(u.cache_creation?.ephemeral_1h_input_tokens)),output:n(u.output_tokens),reasoning:n(u.reasoning_output_tokens)};
}
export function ingest(s,x) {
 const p=x.payload||{},t=stamp(x.timestamp); if(!t) return;
 if(!s.started || t<s.started) s.started=t;
 if(!s.lastActivity || t>s.lastActivity) s.lastActivity=t;
 if(x.cwd) s.cwd=x.cwd;
 if(x.gitBranch) s.branch=x.gitBranch;
 if(s.tool==='claude') {
  if(x.sessionId&&!s.subagent) s.id=x.sessionId;
  if(x.type==='ai-title') s.title=String(x.title||x.aiTitle||'').slice(0,180);
  if(x.type==='summary'&&x.summary) s.title=String(x.summary).slice(0,180);
  if(x.type!=='assistant'||!x.message?.usage||x.message.model==='<synthetic>') return;
  const m=x.message; s.model=m.model||'unknown';
  const key=m.id||x.uuid||t;
  const e={id:`claude:${key}`,time:t,model:s.model,tier:m.usage.speed||'standard',geo:m.usage.inference_geo||'',...normalized(m.usage,'claude')};
  // Streaming chunks can repeat message IDs; retain the most complete usage.
  const old=s.events[key]; if(old) for(const k of ['input','cache','write','writeHour','output','reasoning']) e[k]=Math.max(old[k],e[k]);
  s.events[key]=e; return;
 }
 if(x.type==='session_meta') {
  s.id=p.id||p.session_id||s.id; s.cwd=p.cwd||s.cwd;s.branch=p.git?.branch||s.branch;
  s.origin=p.originator||p.source; s.sessionStart=stamp(p.timestamp)||t;
  s.subagent=Boolean(p.source?.subagent||p.thread_source?.subagent||s.subagent);
 }
 if(x.type==='turn_context') {s.model=p.model||s.model;s.cwd=p.cwd||s.cwd;s.tier=p.service_tier||s.tier;s.effort=p.effort||p.reasoning_effort||s.effort;}
 if(p.type==='thread_settings_applied') {const z=p.thread_settings||p.settings||p;s.model=z.model||s.model;s.tier=z.service_tier||'standard';s.cwd=z.cwd||s.cwd;}
 if(p.rate_limits) {
  const list=Array.isArray(p.rate_limits)?p.rate_limits:[p.rate_limits];
  for(const r of list) s.limits[r.limit_id||'codex']={...r,observedAt:t};
 }
 const event=u=>({time:t,model:s.model,tier:s.tier,...normalized(u,'codex')});
 if(x.type==='token_usage_record' && p.usage) {
  // Per-response records avoid cumulative resets and inherited parent histories.
  if(p.thread_id && p.thread_id!==s.id) return;
  if(s.sessionStart&&t<s.sessionStart) return;
  const key=p.response_id||`${p.turn_id}:${x.ordinal??t}`;
  s.records[key]={id:`codex:${key}`,...event(p.usage)}; return;
 }
 if(p.type!=='token_count'||!p.info) return;
 const info=p.info, total=info.total_token_usage;
 s.contextWindow=info.model_context_window||s.contextWindow;
 if(info.last_token_usage) s.contextUsed=n(info.last_token_usage.input_tokens)+n(info.last_token_usage.output_tokens);
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
