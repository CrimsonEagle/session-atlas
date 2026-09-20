import {sortableHeader,sortRows,tipAttr,tipLabel} from './charts.js';

const label=minutes=>minutes===300?'5 Stunden':minutes===10080?'Wöchentlich':`${minutes} Minuten`;
const source=value=>value==='statusline'?'Statusline-Bridge':value==='config'?'Claude-Konfiguration':'Session-Log';
const dayValue=value=>{const date=new Date(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
const localDay=value=>{const parsed=new Date(`${value}T00:00:00`);return Number.isFinite(parsed.getTime())?parsed.getTime():null;};

function selectedRange(period,from,to,now) {
 if(period==='all')return {start:null,end:null};
 if(period==='custom'){
  const first=localDay(from),last=localDay(to);
  if(first===null||last===null)return {start:null,end:null};
  return {start:Math.min(first,last),end:Math.max(first,last)+86400000-1};
 }
 const days=Number(period)||30,current=new Date(now),start=new Date(current.getFullYear(),current.getMonth(),current.getDate()-(days-1)).getTime();
 return {start,end:now};
}

function filterMarkup({period,from,to,mode,aggregation}) {
 const option=(value,text)=>`<option value="${value}"${period===value?' selected':''}>${text}</option>`;
 const aggregationControl=mode==='cost'?`<label class="limit-aggregation-control"><span>Punkte</span><select id="limit-history-aggregation"><option value="window"${aggregation==='window'?' selected':''}>Fenstermittel</option><option value="raw"${aggregation==='raw'?' selected':''}>Einzelmessungen</option></select></label>`:'';
 return `<div class="limit-history-toolbar"><div class="segments limit-history-mode" role="group" aria-label="Limitdarstellung"><button type="button" data-limit-history-mode="cost" class="${mode==='cost'?'active':''}" aria-pressed="${mode==='cost'}">Kostenlimit</button><button type="button" data-limit-history-mode="usage" class="${mode==='usage'?'active':''}" aria-pressed="${mode==='usage'}">Auslastung</button></div>${aggregationControl}<label><span>Zeitraum</span><select id="limit-history-period">${option('7','Letzte 7 Tage')}${option('30','Letzte 30 Tage')}${option('90','Letzte 90 Tage')}${option('all','Gesamter Verlauf')}${option('custom','Eigener Zeitraum')}</select></label><div class="limit-history-custom"${period==='custom'?'':' hidden'}><label><span>Von</span><input id="limit-history-from" type="date" value="${from}"></label><label><span>Bis</span><input id="limit-history-to" type="date" value="${to}"></label></div></div>`;
}

function lowerBound(events,time) {
 let low=0,high=events.length;
 while(low<high){const middle=(low+high)>>1;if(events[middle].time<time)low=middle+1;else high=middle;}
 return low;
}

/**
 * Combine historical utilization samples with locally priced model events. The provider reset is
 * the only reliable window anchor: without it a five-hour or weekly spend cannot be reconstructed.
 */
export function estimateCostLimits(history=[],sessions=[],tool) {
 const events=sessions.filter(session=>session.tool===tool).flatMap(session=>(session.events||[]).map(event=>({time:Date.parse(event.time),cost:event.cost}))).filter(event=>Number.isFinite(event.time)).sort((a,b)=>a.time-b.time);
 const prefixCost=[0],prefixUnknown=[0];
 for(const event of events){prefixCost.push(prefixCost.at(-1)+(Number.isFinite(event.cost)?event.cost:0));prefixUnknown.push(prefixUnknown.at(-1)+Number(event.cost===null));}
 return history.filter(point=>point.tool===tool).map(point=>{
  const observed=Date.parse(point.sourceObservedAt),reset=Date.parse(point.resetsAt),minutes=Number(point.windowMinutes),used=Number(point.usedPercent),start=reset-minutes*60000;
  if(!Number.isFinite(observed)||!Number.isFinite(reset)||!Number.isFinite(minutes)||minutes<=0||reset<=observed||start>observed||!Number.isFinite(used)||used<=0)return {...point,windowCost:null,estimatedLimit:null,unknownCosts:0,requests:0,coverage:null};
  const first=lowerBound(events,start),after=lowerBound(events,observed+1),requests=after-first,unknownCosts=prefixUnknown[after]-prefixUnknown[first],windowCost=prefixCost[after]-prefixCost[first],known=requests-unknownCosts;
  return {...point,windowStart:new Date(start).toISOString(),windowCost,estimatedLimit:known>0&&windowCost>0?windowCost*100/used:null,unknownCosts,requests,coverage:requests?known/requests:null};
 });
}

function usageChart(points,domainPoints,esc,date,range,locale) {
 const width=900,height=274,left=82,right=18,top=20,bottom=38,times=domainPoints.map(point=>Date.parse(point.sourceObservedAt)),dataMin=Math.min(...times),dataMax=Math.max(...times),min=range.start??dataMin,max=range.end??dataMax,span=Math.max(1,max-min),x=time=>left+(Date.parse(time)-min)/span*(width-left-right),y=value=>top+(100-value)/100*(height-top-bottom),base=y(0),groups=new Map();
 for(const point of points){const key=`${point.windowMinutes}:${point.resetsAt||point.sourceObservedAt}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);}
 const traces=[...groups.values()].filter(group=>group.length>1).map(group=>{
  const coordinates=group.map(point=>`${x(point.sourceObservedAt).toFixed(2)},${y(point.usedPercent).toFixed(2)}`),first=coordinates[0].split(',')[0],last=coordinates.at(-1).split(',')[0],window=group[0].windowMinutes,description=`${label(window)} · ${date(group[0].sourceObservedAt)} bis ${date(group.at(-1).sourceObservedAt)}`;
  return `<g class="limit-history-series window-${window}"><path class="limit-history-area" d="M ${coordinates.join(' L ')} L ${last},${base.toFixed(2)} L ${first},${base.toFixed(2)} Z"><title>${esc(description)}</title></path><path class="limit-history-line" d="M ${coordinates.join(' L ')}"/></g>`;
 }).join('');
 const visibleWindows=new Set(points.map(point=>point.windowMinutes)),targets=sample(domainPoints,500).filter(point=>visibleWindows.has(point.windowMinutes)).map(point=>{const payload={title:`${label(point.windowMinutes)} · ${date(point.sourceObservedAt)}`,rows:[['Auslastung',`${point.usedPercent.toLocaleString(locale)} %`],['Verfügbar',`${Math.max(0,100-point.usedPercent).toLocaleString(locale)} %`],['Quelle',source(point.source)]],note:point.resetsAt?`Reset ${date(point.resetsAt)}`:'Kein Reset gemeldet'};return `<g class="limit-history-point window-${point.windowMinutes}" tabindex="0" role="img" aria-label="${esc(tipLabel(payload))}" ${tipAttr(payload)}><circle cx="${x(point.sourceObservedAt).toFixed(2)}" cy="${y(point.usedPercent).toFixed(2)}" r="3.2"/><circle class="limit-history-hit" cx="${x(point.sourceObservedAt).toFixed(2)}" cy="${y(point.usedPercent).toFixed(2)}" r="10"/></g>`;}).join('');
 const grid=[0,50,80,95,100].map(value=>`<g class="limit-history-grid${value===80||value===95?' threshold':''}"><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/>${value===0||value===50||value===100?`<text x="${left-8}" y="${y(value)+3}" text-anchor="end">${value}%</text>`:''}</g>`).join('');
 return `<div class="limit-history-chart-wrap" data-tip-host><svg class="limit-history-chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="Gemessener Limitverlauf" aria-describedby="limit-history-chart-description"><desc id="limit-history-chart-description">Gefüllte Flächen für das 5-Stunden- und Wochenlimit. Die Flächen werden an Resetgrenzen getrennt.</desc>${grid}<defs><clipPath id="limit-history-clip"><rect x="${left}" y="${top}" width="${width-left-right}" height="${height-top-bottom}"/></clipPath></defs><g clip-path="url(#limit-history-clip)">${traces}${targets}</g><text x="${left}" y="${height-10}">${esc(date(min))}</text><text x="${width-right}" y="${height-10}" text-anchor="end">${esc(date(max))}</text></svg></div>`;
}

const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
function sample(points,limit=500){if(points.length<=limit)return points;const stride=Math.ceil(points.length/limit);return points.filter((point,index)=>index%stride===0||index===points.length-1);}

export function averageCostLimitWindows(points=[]) {
 const groups=new Map();
 for(const point of points) {
  if(!Number.isFinite(point.estimatedLimit)||!point.resetsAt)continue;
  const key=`${point.windowMinutes}:${point.resetsAt}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);
 }
 return [...groups.values()].map(group=>{
  group.sort((a,b)=>a.sourceObservedAt.localeCompare(b.sourceObservedAt));
  const mean=key=>group.reduce((sum,point)=>sum+point[key],0)/group.length,coverage=group.map(point=>point.coverage).filter(Number.isFinite),limits=group.map(point=>point.estimatedLimit);
  return {...group.at(-1),sourceObservedAt:group.at(-1).sourceObservedAt,firstObservedAt:group[0].sourceObservedAt,measurements:group.length,estimatedLimit:mean('estimatedLimit'),minEstimatedLimit:Math.min(...limits),maxEstimatedLimit:Math.max(...limits),windowCost:mean('windowCost'),usedPercent:mean('usedPercent'),coverage:coverage.length?coverage.reduce((sum,value)=>sum+value,0)/coverage.length:null,incompleteMeasurements:group.filter(point=>point.unknownCosts>0).length};
 }).sort((a,b)=>a.sourceObservedAt.localeCompare(b.sourceObservedAt));
}

function costChart(points,domainPoints,esc,date,money,range,aggregation,locale) {
 const usable=points.filter(point=>Number.isFinite(point.estimatedLimit));
 const domainUsable=domainPoints.filter(point=>Number.isFinite(point.estimatedLimit));
 if(!domainUsable.length)return '<div class="comparison-empty limit-cost-empty">Für diesen Zeitraum lässt sich noch kein Kostenlimit hochrechnen. Benötigt werden ein positiver Usage-Wert, ein gemeldeter Reset und bepreiste Nutzungsereignisse im selben Fenster.</div>';
 const width=900,height=274,left=82,right=18,top=20,bottom=38,times=domainUsable.map(point=>Date.parse(point.sourceObservedAt)),dataMin=Math.min(...times),dataMax=Math.max(...times),min=range.start??dataMin,max=range.end??dataMax,span=Math.max(1,max-min),maximum=Math.max(...domainUsable.map(point=>point.estimatedLimit),.01),x=value=>left+(Date.parse(value)-min)/span*(width-left-right),y=value=>top+(maximum-value)/maximum*(height-top-bottom),grid=[0,.25,.5,.75,1].map(factor=>{const value=maximum*(1-factor),at=top+(height-top-bottom)*factor;return `<g class="limit-cost-grid"><line x1="${left}" y1="${at}" x2="${width-right}" y2="${at}"/><text x="${left-10}" y="${at+4}" text-anchor="end">${esc(money(value))}</text></g>`;}).join('');
 const traces=[300,10080].map(minutes=>{
  const series=sample(usable.filter(point=>point.windowMinutes===minutes));if(!series.length)return '';
  const path=series.map((point,index)=>`${index?'L':'M'} ${x(point.sourceObservedAt).toFixed(2)} ${y(point.estimatedLimit).toFixed(2)}`).join(' ');
  const targets=series.map(point=>{const averaged=aggregation==='window',spread=averaged&&(point.minEstimatedLimit!==point.maxEstimatedLimit)?`${money(point.minEstimatedLimit)} – ${money(point.maxEstimatedLimit)}`:null,payload=averaged?{title:`${label(minutes)} · Fenster bis ${date(point.resetsAt)}`,rows:[['Fenstermittel',money(point.estimatedLimit)],['Messpunkte',point.measurements.toLocaleString(locale)],...(spread?[['Spannweite',spread]]:[]),['Ø Usage',`${point.usedPercent.toLocaleString(locale,{maximumFractionDigits:1})} %`],['Ø Preisabdeckung',point.coverage===null?'–':`${(point.coverage*100).toLocaleString(locale,{maximumFractionDigits:0})} %`]],note:point.incompleteMeasurements?`${point.incompleteMeasurements} Messpunkte mit unbekannten Preisen`:`Messungen ${date(point.firstObservedAt)} bis ${date(point.sourceObservedAt)}`}:{title:`${label(minutes)} · ${date(point.sourceObservedAt)}`,rows:[['100%-Schätzung',money(point.estimatedLimit)],['Kosten bis Messpunkt',money(point.windowCost)],['Usage',`${point.usedPercent.toLocaleString(locale)} %`],['Preisabdeckung',point.coverage===null?'–':`${(point.coverage*100).toLocaleString(locale,{maximumFractionDigits:0})} %`]],note:point.unknownCosts?`${point.unknownCosts} Antworten ohne Preis · Schätzung ist unvollständig`:`Reset ${date(point.resetsAt)}`},incomplete=averaged?point.incompleteMeasurements:point.unknownCosts;return `<g class="limit-cost-point${incomplete?' incomplete':''}" tabindex="0" role="img" aria-label="${esc(tipLabel(payload))}" ${tipAttr(payload)}><circle cx="${x(point.sourceObservedAt).toFixed(2)}" cy="${y(point.estimatedLimit).toFixed(2)}" r="3.2"/><circle class="limit-cost-hit" cx="${x(point.sourceObservedAt).toFixed(2)}" cy="${y(point.estimatedLimit).toFixed(2)}" r="10"/></g>`;}).join('');
  return `<g class="limit-cost-series window-${minutes}"><path d="${path}"/>${targets}</g>`;
 }).join('');
 return `<div class="limit-history-chart-wrap limit-cost-chart-wrap" data-tip-host><svg class="limit-cost-chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="Geschätzte nutzbare Kostenlimits im Zeitverlauf" aria-describedby="limit-cost-description"><desc id="limit-cost-description">Zwei Linien zeigen die auf einhundert Prozent hochgerechneten Kostenlimits für fünf Stunden und eine Woche.</desc>${grid}<line class="limit-cost-axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"/><g>${traces}</g><text x="${left}" y="${height-10}">${esc(date(min))}</text><text x="${width-right}" y="${height-10}" text-anchor="end">${esc(date(max))}</text></svg></div>`;
}

function legendMarkup(visibleWindows,summary) {
 return `<div class="limit-history-legend" role="group" aria-label="Zeitfenster in Diagramm und Tabelle"><button type="button" data-limit-history-window="300" class="${visibleWindows.has(300)?'':'is-hidden'}" aria-pressed="${visibleWindows.has(300)}" aria-label="5 Stunden in Diagramm und Tabelle ${visibleWindows.has(300)?'ausblenden':'einblenden'}"><i class="window-300"></i>5 Stunden</button><button type="button" data-limit-history-window="10080" class="${visibleWindows.has(10080)?'':'is-hidden'}" aria-pressed="${visibleWindows.has(10080)}" aria-label="Wöchentlich in Diagramm und Tabelle ${visibleWindows.has(10080)?'ausblenden':'einblenden'}"><i class="window-10080"></i>Wöchentlich</button><small>${summary}</small></div>`;
}

function costSummary(points,money,aggregation,locale) {
 const averaged=aggregation==='window';
 return `<div class="limit-cost-kpis">${[300,10080].map(minutes=>{const series=points.filter(point=>point.windowMinutes===minutes),latest=series.at(-1),middle=median(series.map(point=>point.estimatedLimit));return `<article class="window-${minutes}"><span>${label(minutes)}</span><strong>${latest?money(latest.estimatedLimit):'–'}</strong><small>${latest?(averaged?`Jüngstes Fenstermittel · ${latest.measurements.toLocaleString(locale)} Messpunkte`:`Jüngste Hochrechnung · ${latest.usedPercent.toLocaleString(locale)} % Usage`):'Noch nicht berechenbar'}</small><small>${middle===null?'':`${averaged?'Median der Fenstermittel':'Median der Messpunkte'} ${money(middle)}`}</small></article>`;}).join('')}</div>`;
}

function usageView({points,allPoints,chartPoints,toolbar,sortKey,sortDirection,esc,date,range,visibleWindows,locale}) {
 const value=(point,key)=>key==='observed'?Date.parse(point.sourceObservedAt):key==='window'?point.windowMinutes:key==='usage'?point.usedPercent:key==='source'?source(point.source):point.resetsAt?Date.parse(point.resetsAt):null;
 const visiblePoints=points.filter(point=>visibleWindows.has(point.windowMinutes)),visibleChartPoints=chartPoints.filter(point=>visibleWindows.has(point.windowMinutes)),rows=sortRows(visiblePoints,sortKey,sortDirection,value).slice(0,100),head=(text,key,numeric=false)=>sortableHeader(text,key,{activeKey:sortKey,direction:sortDirection,context:'limit-history',numeric});
 return `<div class="detail-body limit-history-detail">${toolbar}${legendMarkup(visibleWindows,'Flächen enden an Resetgrenzen.')}${usageChart(visibleChartPoints,chartPoints,esc,date,range,locale)}<div class="table-wrap"><table><thead><tr>${head('Messzeitpunkt','observed')}${head('Fenster','window')}${head('Auslastung','usage',true)}${head('Quelle','source')}${head('Reset','reset')}</tr></thead><tbody>${rows.map(point=>`<tr><td>${esc(date(point.sourceObservedAt))}</td><td>${label(point.windowMinutes)}</td><td class="numeric"><strong>${point.usedPercent.toLocaleString(locale)} %</strong></td><td>${source(point.source)}</td><td>${point.resetsAt?esc(date(point.resetsAt)):'Nicht gemeldet'}</td></tr>`).join('')||'<tr><td colspan="5" class="limit-history-table-empty">Keine Zeitfenster ausgewählt.</td></tr>'}</tbody></table></div><p class="detail-footnote">${visiblePoints.length} von ${allPoints.length} Messpunkten insgesamt · ${points.length} im gewählten Zeitraum · maximal 100 werden in der Tabelle angezeigt${visibleChartPoints.length<visiblePoints.length?` · Diagramm auf ${visibleChartPoints.length} Punkte verdichtet`:''}.</p></div>`;
}

function costView({points,allPoints,toolbar,sortKey,sortDirection,esc,date,money,range,aggregation,visibleWindows,locale}) {
 const estimatable=points.filter(point=>Number.isFinite(point.estimatedLimit)),averaged=aggregation==='window',displayPoints=averaged?averageCostLimitWindows(points):estimatable,visiblePoints=displayPoints.filter(point=>visibleWindows.has(point.windowMinutes)),value=(point,key)=>key==='observed'?Date.parse(point.sourceObservedAt):key==='window'?point.windowMinutes:key==='measurements'?point.measurements:key==='usage'?point.usedPercent:key==='spent'?point.windowCost:key==='estimate'?point.estimatedLimit:key==='coverage'?point.coverage:null,rows=sortRows(visiblePoints,sortKey,sortDirection,value).slice(0,100),head=(text,key,numeric=false)=>sortableHeader(text,key,{activeKey:sortKey,direction:sortDirection,context:'limit-history',numeric}),unknown=displayPoints.filter(point=>averaged?point.incompleteMeasurements:point.unknownCosts).length;
 const intro=averaged?'Jede Rohmessung wird auf 100 % hochgerechnet; dargestellt wird anschließend genau ein arithmetischer Mittelwert je gemeldetem 5-Stunden- oder 7-Tage-Fenster.':'Jeder Punkt zeigt eine einzelne historische Hochrechnung: bekannte Kosten vom Fensterbeginn bis zum Messpunkt, geteilt durch die gemessene Usage und auf 100 % hochgerechnet.';
 const summary=averaged?`${displayPoints.length} Fenstermittel aus ${estimatable.length} Messpunkten`:`${displayPoints.length} Einzelmessungen`,notice=averaged?`${unknown} Fenstermittel enthalten Messpunkte mit unbekannten Modellpreisen.`:`${unknown} Einzelmessungen enthalten Antworten ohne bekannten Modellpreis.`;
 const empty='<tr><td colspan="6" class="limit-history-table-empty">Keine Zeitfenster ausgewählt.</td></tr>',table=averaged?`<table><thead><tr>${head('Letzter Messpunkt','observed')}${head('Fenster','window')}${head('Messpunkte','measurements',true)}${head('Ø Usage','usage',true)}${head('Fenstermittel','estimate',true)}${head('Ø Preisabdeckung','coverage',true)}</tr></thead><tbody>${rows.map(point=>`<tr><td>${esc(date(point.sourceObservedAt))}</td><td>${label(point.windowMinutes)}<span class="row-subtitle">Reset ${esc(date(point.resetsAt))}</span></td><td class="numeric">${point.measurements.toLocaleString(locale)}</td><td class="numeric">${point.usedPercent.toLocaleString(locale,{maximumFractionDigits:1})} %</td><td class="numeric"><strong>${money(point.estimatedLimit)}</strong><span class="row-subtitle">${money(point.minEstimatedLimit)} – ${money(point.maxEstimatedLimit)}</span></td><td class="numeric${point.incompleteMeasurements?' coverage-partial':''}">${point.coverage===null?'–':`${(point.coverage*100).toLocaleString(locale,{maximumFractionDigits:0})} %`}</td></tr>`).join('')||empty}</tbody></table>`:`<table><thead><tr>${head('Messzeitpunkt','observed')}${head('Fenster','window')}${head('Kosten bis dahin','spent',true)}${head('Usage','usage',true)}${head('100%-Schätzung','estimate',true)}${head('Preisabdeckung','coverage',true)}</tr></thead><tbody>${rows.map(point=>`<tr><td>${esc(date(point.sourceObservedAt))}</td><td>${label(point.windowMinutes)}</td><td class="numeric">${money(point.windowCost)}</td><td class="numeric">${point.usedPercent.toLocaleString(locale)} %</td><td class="numeric"><strong>${money(point.estimatedLimit)}</strong></td><td class="numeric${point.unknownCosts?' coverage-partial':''}">${point.coverage===null?'–':`${(point.coverage*100).toLocaleString(locale,{maximumFractionDigits:0})} %`}</td></tr>`).join('')||empty}</tbody></table>`;
 return `<div class="detail-body limit-history-detail limit-cost-detail">${toolbar}<p class="limit-cost-intro">Geschätzter API-Gegenwert des nutzbaren Kontingents: ${intro}</p>${costSummary(displayPoints,money,aggregation,locale)}${legendMarkup(visibleWindows,summary)}${costChart(visiblePoints,displayPoints,esc,date,money,range,aggregation,locale)}${unknown?`<div class="notice compact-notice">${notice} Diese Werte sind unvollständig und können höher ausfallen.</div>`:''}<div class="table-wrap">${table}</div><p class="detail-footnote">${visiblePoints.length} von ${displayPoints.length} ${averaged?'Fenstermitteln':'Einzelmessungen'} der eingeblendeten Zeitfenster · ${allPoints.length} Messpunkte insgesamt. Die Hochrechnung ist eine lokale Näherung aus API-Preisen, keine Auskunft des Anbieters über ein Geldlimit.</p></div>`;
}

export function limitHistoryView({history,sessions=[],tool,mode='usage',aggregation='window',sortKey='observed',sortDirection='desc',period='30',from='',to='',visibleWindows=[300,10080],now=Date.now(),esc=String,date=String,money=value=>`$${Number(value).toFixed(2)}`,locale='de-DE'}) {
 const allPoints=estimateCostLimits(history,sessions,tool).sort((a,b)=>a.sourceObservedAt.localeCompare(b.sourceObservedAt)),range=selectedRange(period,from,to,now),points=allPoints.filter(point=>{const time=Date.parse(point.sourceObservedAt);return (range.start===null||time>=range.start)&&(range.end===null||time<=range.end);}),stride=Math.max(1,Math.ceil(points.length/1000)),chartPoints=points.filter((point,index)=>index%stride===0||index===points.length-1||point.resetsAt!==points[index-1]?.resetsAt||point.resetsAt!==points[index+1]?.resetsAt),toolbar=filterMarkup({period,from:from||dayValue(now-29*86400000),to:to||dayValue(now),mode,aggregation});
 if(!points.length){const message=allPoints.length?'Im gewählten Zeitraum wurden keine Limitmessungen gespeichert.':'Noch keine Limitmessungen für dieses Tool gespeichert.';return `<div class="detail-body limit-history-detail">${toolbar}<div class="comparison-empty">${message}</div></div>`;}
 const visible=new Set(visibleWindows.map(Number).filter(minutes=>minutes===300||minutes===10080));
 return mode==='usage'?usageView({points,allPoints,chartPoints,toolbar,sortKey,sortDirection,esc,date,range,visibleWindows:visible,locale}):costView({points,allPoints,toolbar,sortKey,sortDirection,esc,date,money,range,aggregation,visibleWindows:visible,locale});
}
