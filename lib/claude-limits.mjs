import fs from 'node:fs/promises';
import path from 'node:path';
// Claude Code caches its own account limits in .claude.json; the session logs never carry them.
// The optional status line bridge writes a fresher measurement beside it. Only the fields below
// are extracted, so the surrounding configuration stays unread and uncached.
const PLANS={max_5x:'Max 5×',max_20x:'Max 20×',pro:'Pro',free:'Free',team:'Team',enterprise:'Enterprise'};
const WINDOWS=[['five_hour',300],['seven_day',10080]];
const MAX_BYTES=64*1024*1024;
export const BRIDGE_FILE='session-atlas-limits.json';
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
function limitFrom(source,observedAtMs,extra) {
 if(!Number.isFinite(observedAtMs)||observedAtMs<=0)return null;
 const [primary,secondary]=WINDOWS.map(([key,minutes])=>shaped(source?.[key],minutes));
 if(!primary&&!secondary)return null;
 return {limit_id:'claude',plan_type:'',...extra,primary,secondary,observedAt:new Date(observedAtMs).toISOString()};
}
export function normalize(config) {
 const cached=config?.cachedUsageUtilization;
 if(!cached)return null;
 return limitFrom(cached.utilization,Number(cached.fetchedAtMs),{source:'config',plan_type:planLabel(config?.oauthAccount?.userRateLimitTier)});
}
export function normalizeBridge(state) {
 if(state?.version!==1)return null;
 return limitFrom(state.rate_limits,Number(state.observedAtMs),{source:'statusline'});
}
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
 for(const [files,parse] of [[configCandidates(roots),normalize],[bridgeCandidates(roots),normalizeBridge]])
  for(const file of files) {
   const limit=await read(file,warnings,parse);
   if(!limit)continue;
   if(limit.plan_type&&(!named||named.observedAt<limit.observedAt))named=limit;
   if(!best||best.observedAt<limit.observedAt)best=limit;
  }
 // The status line carries no plan name; keep the one the configuration reported.
 return best&&!best.plan_type&&named?{...best,plan_type:named.plan_type}:best;
}
