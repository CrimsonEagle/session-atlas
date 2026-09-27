// Billing providers belong to usage events, not to the client that created the session.
// Subscription-included Codex usage is not an external account expense.
const CORE_LIMIT_TOOLS=new Set(['claude','codex','hermes']);
export function prioritizeUsageTools(tools) {
 return [...tools.filter(tool=>CORE_LIMIT_TOOLS.has(tool)),...tools.filter(tool=>!CORE_LIMIT_TOOLS.has(tool))];
}

export function placeProviderCards(limitCards=[],billingCards=[],sideCount=2) {
 const cards=[...limitCards,...billingCards];
 return {beside:cards.slice(0,sideCount),below:cards.slice(sideCount)};
}

export function visibleBillingRows(rows=[],hiddenProviders=[]) {
 const hidden=new Set(hiddenProviders);
 return rows.filter(row=>!hidden.has(row.provider));
}

export function billingCostOrigin(row) {
 if(!row.reported)return 'geschätzt';
 return row.reported>=row.requests-row.unknown?'gemeldet':'teils gemeldet, teils geschätzt';
}

export function formatBillingCost(value,locale='de-DE') {
 return new Intl.NumberFormat(locale,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:value>0&&value<.01?4:2}).format(value);
}

export function usageWindow(window,{now=Date.now(),serviceFresh=true}={}) {
 const reset=window?.resets_at?Number(window.resets_at)*1000:null;
 const expired=reset!==null&&reset<=now;
 const used=window?.used_percent;
 return {known:Number.isFinite(used)&&!expired&&serviceFresh,used,reset,expired};
}

export function billingProviderSessions(sessions=[],provider='') {
 return sessions.flatMap(session=>{
  const events=(session.events||[]).filter(event=>event.provider===provider);
  return events.length?[{...session,events}]:[];
 });
}

export function billingProviderRows(sessions=[]) {
 const groups=new Map();
 for(const session of sessions)for(const event of session.events||[]) {
  const provider=event.provider;
  if(!provider||provider==='openai-codex')continue;
  let row=groups.get(provider);
  if(!row){row={provider,cost:0,unknown:0,requests:0,reported:0,tools:[]};groups.set(provider,row);}
  if(!row.tools.includes(session.tool))row.tools.push(session.tool);
  const count=Number.isFinite(event.requestCount)?Math.max(0,event.requestCount):1;
  row.requests+=count;
  if(event.cost===null)row.unknown+=count;
  else if(Number.isFinite(event.cost))row.cost+=event.cost;
  if(Number.isFinite(event.reportedCost))row.reported+=count;
 }
 return [...groups.values()].sort((a,b)=>a.provider==='openrouter'?-1:b.provider==='openrouter'?1:a.provider.localeCompare(b.provider));
}
