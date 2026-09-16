import {sortableHeader,sortRows} from './charts.js';

const label=minutes=>minutes===300?'5 Stunden':minutes===10080?'Wöchentlich':`${minutes} Minuten`;
const source=value=>value==='statusline'?'Statusline-Bridge':value==='config'?'Claude-Konfiguration':'Session-Log';

function chart(points,esc,date) {
 const width=720,height=180,left=38,right=12,top=12,bottom=30,times=points.map(point=>Date.parse(point.sourceObservedAt)),min=Math.min(...times),max=Math.max(...times),span=Math.max(1,max-min),x=time=>left+(Date.parse(time)-min)/span*(width-left-right),y=value=>top+(100-value)/100*(height-top-bottom),groups=new Map();
 for(const point of points){const key=`${point.windowMinutes}:${point.resetsAt||point.sourceObservedAt}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);}
 const traces=[...groups.values()].map(group=>group.length>1?`<polyline class="limit-history-line window-${group[0].windowMinutes}" points="${group.map(point=>`${x(point.sourceObservedAt)},${y(point.usedPercent)}`).join(' ')}"/>`:'').join('');
 const dots=points.map(point=>`<circle class="limit-history-dot window-${point.windowMinutes}" cx="${x(point.sourceObservedAt)}" cy="${y(point.usedPercent)}" r="4"><title>${esc(`${label(point.windowMinutes)} · ${point.usedPercent} % · ${date(point.sourceObservedAt)}`)}</title></circle>`).join('');
 return `<svg class="limit-history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gemessener Limitverlauf"><line x1="${left}" y1="${y(80)}" x2="${width-right}" y2="${y(80)}"/><line x1="${left}" y1="${y(95)}" x2="${width-right}" y2="${y(95)}"/>${[0,50,100].map(value=>`<text x="${left-7}" y="${y(value)+4}" text-anchor="end">${value}%</text>`).join('')}${traces}${dots}<text x="${left}" y="${height-7}">${esc(date(min))}</text><text x="${width-right}" y="${height-7}" text-anchor="end">${esc(date(max))}</text></svg>`;
}

export function limitHistoryView({history,tool,sortKey='observed',sortDirection='desc',esc=String,date=String}) {
 const points=history.filter(point=>point.tool===tool).sort((a,b)=>a.sourceObservedAt.localeCompare(b.sourceObservedAt)),stride=Math.max(1,Math.ceil(points.length/1000)),chartPoints=points.filter((point,index)=>index%stride===0||index===points.length-1||point.resetsAt!==points[index-1]?.resetsAt);
 if(!points.length)return '<div class="comparison-empty">Noch keine Limitmessungen für dieses Tool gespeichert.</div>';
 const value=(point,key)=>key==='observed'?Date.parse(point.sourceObservedAt):key==='window'?point.windowMinutes:key==='usage'?point.usedPercent:key==='source'?source(point.source):point.resetsAt?Date.parse(point.resetsAt):null;
 const rows=sortRows(points,sortKey,sortDirection,value).slice(0,100),head=(text,key,numeric=false)=>sortableHeader(text,key,{activeKey:sortKey,direction:sortDirection,context:'limit-history',numeric});
 return `<div class="detail-body limit-history-detail"><div class="limit-history-legend"><span><i class="window-300"></i>5 Stunden</span><span><i class="window-10080"></i>Wöchentlich</span><small>Linien werden an Resetgrenzen getrennt.</small></div>${chart(chartPoints,esc,date)}<div class="table-wrap"><table><thead><tr>${head('Messzeitpunkt','observed')}${head('Fenster','window')}${head('Auslastung','usage',true)}${head('Quelle','source')}${head('Reset','reset')}</tr></thead><tbody>${rows.map(point=>`<tr><td>${esc(date(point.sourceObservedAt))}</td><td>${label(point.windowMinutes)}</td><td class="numeric"><strong>${point.usedPercent.toLocaleString('de-DE')} %</strong></td><td>${source(point.source)}</td><td>${point.resetsAt?esc(date(point.resetsAt)):'Nicht gemeldet'}</td></tr>`).join('')}</tbody></table></div><p class="detail-footnote">${points.length} Messpunkte gespeichert · maximal 100 werden in der Tabelle angezeigt${chartPoints.length<points.length?` · Diagramm auf ${chartPoints.length} Punkte verdichtet`:''}.</p></div>`;
}
