const windows=limit=>[limit?.primary,limit?.secondary].filter(window=>window&&Number.isFinite(Number(window.used_percent))&&Number.isFinite(Number(window.window_minutes)));
const iso=value=>{const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;};

export function updateLimitHistory(sources,history=[],notified={},options={}) {
 const now=options.now??Date.now(),retentionDays=Number.isFinite(options.retentionDays)?options.retentionDays:90,known=new Set(history.map(point=>point.id)),added=[];
 for(const limit of sources.filter(Boolean)) {
  const tool=limit.limit_id==='claude'||limit.source==='statusline'||limit.source==='claude-config'?'claude':'codex',sourceObservedAt=iso(limit.observedAt)||new Date(now).toISOString();
  for(const window of windows(limit)) {
   const resetsAt=Number.isFinite(Number(window.resets_at))?new Date(Number(window.resets_at)*1000).toISOString():null,usedPercent=Number(window.used_percent),windowMinutes=Number(window.window_minutes),measurementWindow=resetsAt||`inferred-${Math.floor(Date.parse(sourceObservedAt)/(windowMinutes*60000))}`;
   const id=[tool,windowMinutes,measurementWindow,usedPercent,limit.source||'log'].join('|');
   if(known.has(id))continue;known.add(id);added.push({id,tool,windowMinutes,resetsAt,usedPercent,sourceObservedAt,capturedAt:new Date(now).toISOString(),source:limit.source||'session-log'});
  }
 }
 const cutoff=now-retentionDays*86400000,nextHistory=[...history,...added].filter(point=>Date.parse(point.capturedAt||point.sourceObservedAt)>=cutoff).sort((a,b)=>a.sourceObservedAt.localeCompare(b.sourceObservedAt));
 const nextNotified={...notified},alerts=[];
 for(const point of added) {
  const configured=options.thresholds?.[point.tool]?.[point.windowMinutes],thresholds=[...(Array.isArray(configured)?configured:[80,95])].filter(Number.isFinite).sort((a,b)=>a-b);
  const reset=Date.parse(point.resetsAt),observed=Date.parse(point.sourceObservedAt),fresh=Number.isFinite(observed)&&now-observed<=point.windowMinutes*60000;
  if((Number.isFinite(reset)&&reset<=now)||!fresh)continue;
  const crossed=thresholds.filter(threshold=>point.usedPercent>=threshold),windowKey=point.resetsAt||`inferred-${Math.floor(observed/(point.windowMinutes*60000))}`,newly=crossed.filter(threshold=>!nextNotified[`${point.tool}:${point.windowMinutes}:${windowKey}:${threshold}`]);
  for(const threshold of crossed)nextNotified[`${point.tool}:${point.windowMinutes}:${windowKey}:${threshold}`]=point.capturedAt;
  if(newly.length)alerts.push({...point,threshold:Math.max(...newly)});
 }
 const notifiedCutoff=now-(retentionDays+14)*86400000;for(const [key,value] of Object.entries(nextNotified))if(Date.parse(value)<notifiedCutoff)delete nextNotified[key];
 return {history:nextHistory,notified:nextNotified,alerts,changed:added.length>0||nextHistory.length!==history.length||Object.keys(nextNotified).length!==Object.keys(notified).length};
}
