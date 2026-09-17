import {sortableHeader,sortRows} from './charts.js';

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

function filterMarkup({period,from,to}) {
 const option=(value,text)=>`<option value="${value}"${period===value?' selected':''}>${text}</option>`;
 return `<div class="limit-history-toolbar"><label><span>Zeitraum</span><select id="limit-history-period">${option('7','Letzte 7 Tage')}${option('30','Letzte 30 Tage')}${option('90','Letzte 90 Tage')}${option('all','Gesamter Verlauf')}${option('custom','Eigener Zeitraum')}</select></label><div class="limit-history-custom"${period==='custom'?'':' hidden'}><label><span>Von</span><input id="limit-history-from" type="date" value="${from}"></label><label><span>Bis</span><input id="limit-history-to" type="date" value="${to}"></label></div></div>`;
}

function chart(points,esc,date,range) {
 const width=720,height=190,left=42,right=12,top=12,bottom=31,times=points.map(point=>Date.parse(point.sourceObservedAt)),dataMin=Math.min(...times),dataMax=Math.max(...times),min=range.start??dataMin,max=range.end??dataMax,span=Math.max(1,max-min),x=time=>left+(Date.parse(time)-min)/span*(width-left-right),y=value=>top+(100-value)/100*(height-top-bottom),base=y(0),groups=new Map();
 for(const point of points){const key=`${point.windowMinutes}:${point.resetsAt||point.sourceObservedAt}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);}
 const traces=[...groups.values()].filter(group=>group.length>1).map(group=>{
  const coordinates=group.map(point=>`${x(point.sourceObservedAt).toFixed(2)},${y(point.usedPercent).toFixed(2)}`),first=coordinates[0].split(',')[0],last=coordinates.at(-1).split(',')[0],window=group[0].windowMinutes,description=`${label(window)} · ${date(group[0].sourceObservedAt)} bis ${date(group.at(-1).sourceObservedAt)}`;
  return `<g class="limit-history-series window-${window}"><path class="limit-history-area" d="M ${coordinates.join(' L ')} L ${last},${base.toFixed(2)} L ${first},${base.toFixed(2)} Z"><title>${esc(description)}</title></path><path class="limit-history-line" d="M ${coordinates.join(' L ')}"/></g>`;
 }).join('');
 const grid=[0,50,80,95,100].map(value=>`<g class="limit-history-grid${value===80||value===95?' threshold':''}"><line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"/>${value===0||value===50||value===100?`<text x="${left-8}" y="${y(value)+3}" text-anchor="end">${value}%</text>`:''}</g>`).join('');
 return `<svg class="limit-history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="limit-history-chart-title limit-history-chart-description"><title id="limit-history-chart-title">Gemessener Limitverlauf</title><desc id="limit-history-chart-description">Gefüllte Flächen für das 5-Stunden- und Wochenlimit. Die Flächen werden an Resetgrenzen getrennt.</desc>${grid}<defs><clipPath id="limit-history-clip"><rect x="${left}" y="${top}" width="${width-left-right}" height="${height-top-bottom}"/></clipPath></defs><g clip-path="url(#limit-history-clip)">${traces}</g><text x="${left}" y="${height-7}">${esc(date(min))}</text><text x="${width-right}" y="${height-7}" text-anchor="end">${esc(date(max))}</text></svg>`;
}

export function limitHistoryView({history,tool,sortKey='observed',sortDirection='desc',period='30',from='',to='',now=Date.now(),esc=String,date=String}) {
 const allPoints=history.filter(point=>point.tool===tool).sort((a,b)=>a.sourceObservedAt.localeCompare(b.sourceObservedAt)),range=selectedRange(period,from,to,now),points=allPoints.filter(point=>{const time=Date.parse(point.sourceObservedAt);return (range.start===null||time>=range.start)&&(range.end===null||time<=range.end);}),stride=Math.max(1,Math.ceil(points.length/1000)),chartPoints=points.filter((point,index)=>index%stride===0||index===points.length-1||point.resetsAt!==points[index-1]?.resetsAt||point.resetsAt!==points[index+1]?.resetsAt),toolbar=filterMarkup({period,from:from||dayValue(now-29*86400000),to:to||dayValue(now)});
 if(!points.length){const message=allPoints.length?'Im gewählten Zeitraum wurden keine Limitmessungen gespeichert.':'Noch keine Limitmessungen für dieses Tool gespeichert.';return `<div class="detail-body limit-history-detail">${toolbar}<div class="comparison-empty">${message}</div></div>`;}
 const value=(point,key)=>key==='observed'?Date.parse(point.sourceObservedAt):key==='window'?point.windowMinutes:key==='usage'?point.usedPercent:key==='source'?source(point.source):point.resetsAt?Date.parse(point.resetsAt):null;
 const rows=sortRows(points,sortKey,sortDirection,value).slice(0,100),head=(text,key,numeric=false)=>sortableHeader(text,key,{activeKey:sortKey,direction:sortDirection,context:'limit-history',numeric});
 return `<div class="detail-body limit-history-detail">${toolbar}<div class="limit-history-legend"><span><i class="window-300"></i>5 Stunden</span><span><i class="window-10080"></i>Wöchentlich</span><small>Flächen enden an Resetgrenzen.</small></div>${chart(chartPoints,esc,date,range)}<div class="table-wrap"><table><thead><tr>${head('Messzeitpunkt','observed')}${head('Fenster','window')}${head('Auslastung','usage',true)}${head('Quelle','source')}${head('Reset','reset')}</tr></thead><tbody>${rows.map(point=>`<tr><td>${esc(date(point.sourceObservedAt))}</td><td>${label(point.windowMinutes)}</td><td class="numeric"><strong>${point.usedPercent.toLocaleString('de-DE')} %</strong></td><td>${source(point.source)}</td><td>${point.resetsAt?esc(date(point.resetsAt)):'Nicht gemeldet'}</td></tr>`).join('')}</tbody></table></div><p class="detail-footnote">${points.length} von ${allPoints.length} Messpunkten im gewählten Zeitraum · maximal 100 werden in der Tabelle angezeigt${chartPoints.length<points.length?` · Diagramm auf ${chartPoints.length} Punkte verdichtet`:''}.</p></div>`;
}
