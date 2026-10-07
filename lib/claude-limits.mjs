import fs from 'node:fs/promises';
import path from 'node:path';
// Claude Code caches its own account limits in .claude.json; the session logs never carry them.
// The optional status line bridge and the headless CLI wrapper write fresher measurements beside
// it. Only the fields below
// are extracted, so the surrounding configuration stays unread and uncached.
const PLANS={max_5x:'Max 5×',max_20x:'Max 20×',pro:'Pro',free:'Free',team:'Team',enterprise:'Enterprise'};
const WINDOWS=[['five_hour',300],['seven_day',10080]];
const MAX_BYTES=64*1024*1024;
const MAX_DATE_MS=8.64e15;
export const BRIDGE_FILE='session-atlas-limits.json';
export const INBOX_DIR='session-atlas-limit-inbox';
export const CLI_FILE='session-atlas-cli-limits.json';
export function planLabel(tier) {
 if(typeof tier!=='string'||!tier)return '';
 const key=tier.replace(/^default_/,'').replace(/^claude_/,'');
 return PLANS[key]||key.replace(/_/g,' ');
}
// The configuration reports `utilization` with an ISO reset, the status line `used_percentage`
// with epoch seconds. Both collapse into the window shape the Codex limits already use.
function shaped(w,minutes) {
 const used=Number(w?.utilization??w?.used_percentage);
 if(!Number.isFinite(used))return null;
 const raw=w?.resets_at,ms=typeof raw==='number'&&Number.isFinite(raw)?raw*1000:Date.parse(raw);
 return {window_minutes:minutes,used_percent:Math.max(0,used),resets_at:Number.isFinite(ms)?Math.floor(ms/1000):null};
}
// A rate_limit_event reports each window's utilization as a fraction and its reset in epoch
// seconds. Only these two numbers are kept, and only when they are real numbers: null, empty,
// boolean or textual values stay unknown instead of turning into 0 %. So do numbers that no
// Date or percentage can represent.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const used=w=>finite(w?.utilization)&&w.utilization>=0&&Number.isFinite(w.utilization*10000);
const reset=w=>finite(w?.resetsAt)&&w.resetsAt>0&&w.resetsAt*1000<=MAX_DATE_MS?w.resetsAt:null;
const fraction=(w,minutes)=>used(w)?{window_minutes:minutes,used_percent:Math.round(w.utilization*10000)/100,resets_at:reset(w)===null?null:Math.floor(reset(w))}:null;
export function rateInfoWindows(info) {
 const out={};
 for(const [key] of WINDOWS) {
  // Older events carry a single window directly on the info object while a warning is active.
  const w=info?.unifiedWindows?info.unifiedWindows[key]:info?.rateLimitType===key?info:null;
  if(used(w))out[key]={utilization:w.utilization,resetsAt:reset(w)};
 }
 return out;
}
export function rateInfoLimit(info,observedAtMs,source) {
 return limitFrom(rateInfoWindows(info),observedAtMs,{source},fraction);
}
function limitFrom(source,observedAtMs,extra,shape=shaped) {
 if(!Number.isFinite(observedAtMs)||observedAtMs<=0||observedAtMs>MAX_DATE_MS)return null;
 const [primary,secondary]=WINDOWS.map(([key,minutes])=>shape(source?.[key],minutes));
 if(!primary&&!secondary)return null;
 return {limit_id:'claude',plan_type:'',...extra,primary,secondary,observedAt:new Date(observedAtMs).toISOString()};
}
export function normalize(config) {
 const cached=config?.cachedUsageUtilization;
 if(!cached)return null;
 return limitFrom(cached.utilization,Number(cached.fetchedAtMs),{source:'config',plan_type:planLabel(config?.oauthAccount?.userRateLimitTier)});
}
export function normalizeBridge(state) {
 if(state?.version!==1||state.source!==undefined)return null;
 return limitFrom(state.rate_limits,Number(state.observedAtMs),{source:'statusline'});
}
// The headless wrapper stores rate_limit_event windows as reported, so the fraction is kept.
export function normalizeCli(state) {
 if(state?.version!==1||state.source!=='claude-cli')return null;
 return limitFrom(state.rate_limits,Number(state.observedAtMs),{source:'claude-cli'},fraction);
}
const normalizeQueued=state=>state?.source==='claude-cli'?normalizeCli(state):normalizeBridge(state);
// Default layout keeps .claude.json beside .claude/projects; CLAUDE_CONFIG_DIR moves it one level in.
function beside(roots,name) {
 const out=new Set();
 for(const root of roots||[]) {
  if(typeof root!=='string'||!root)continue;
  const parent=path.dirname(root);out.add(path.join(parent,name));
  const grand=path.dirname(parent);if(grand!==parent)out.add(path.join(grand,name));
 }
 return [...out];
}
export const configCandidates=roots=>beside(roots,'.claude.json');
export const bridgeCandidates=roots=>beside(roots,BRIDGE_FILE);
export const inboxCandidates=roots=>beside(roots,INBOX_DIR);
export const cliCandidates=roots=>beside(roots,CLI_FILE);
// Both files are small and only read once per scan, so they are parsed every time. Skipping
// unchanged ones by size and mtime would serve a stale percentage whenever a rewrite keeps the
// size and lands in the same millisecond, which a same-width timestamp makes entirely possible.
async function read(file,warnings,parse) {
 try {
  const st=await fs.stat(file);
  if(st.size>MAX_BYTES)throw Error(`${path.basename(file)} überschreitet 64 MB`);
  return parse(JSON.parse(await fs.readFile(file,'utf8')));
 }catch(e) {
  if(e.code!=='ENOENT')warnings.push(`${file}: ${e.code||e.message}`);
  return null;
 }
}
export async function readLimits(roots,warnings=[]) {
 let best=null,named=null;
 for(const [files,parse] of [[configCandidates(roots),normalize],[bridgeCandidates(roots),normalizeBridge],[cliCandidates(roots),normalizeCli]])
  for(const file of files) {
   const limit=await read(file,warnings,parse);
   if(!limit)continue;
   if(limit.plan_type&&(!named||named.observedAt<limit.observedAt))named=limit;
   if(!best||best.observedAt<limit.observedAt)best=limit;
  }
 // Neither the status line nor the CLI carries a plan name; keep the one the configuration reported.
 return best&&!best.plan_type&&named?{...best,plan_type:named.plan_type}:best;
}

// Every inbox entry is immutable. The caller removes only successfully imported entries after
// its own cache has been committed, which makes retries safe across crashes and write failures.
export async function readLimitInbox(roots,warnings=[]) {
 const entries=[];
 for(const dir of inboxCandidates(roots)) {
  let files;try{files=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')warnings.push(`${dir}: ${e.code||e.message}`);continue;}
  for(const entry of files) {
   if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
   const file=path.join(dir,entry.name),limit=await read(file,warnings,normalizeQueued);
   if(limit)entries.push({file,limit});
  }
 }
 entries.sort((a,b)=>a.limit.observedAt.localeCompare(b.limit.observedAt)||a.file.localeCompare(b.file));
 return entries;
}

export async function removeLimitInboxEntries(entries,warnings=[]) {
 for(const {file} of entries)try{await fs.unlink(file);}catch(e){if(e.code!=='ENOENT')warnings.push(`${file}: ${e.code||e.message}`);}
}
