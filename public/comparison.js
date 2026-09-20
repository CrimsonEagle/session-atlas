import {analytics,comparisonRows,metricValue,relativeSeries} from './analytics-core.js';
import {sortableHeader,sortRows,tipAttr,tipLabel} from './charts.js';

const localDate=(value,locale)=>new Date(value).toLocaleDateString(locale,{day:'2-digit',month:'short',year:'numeric'});

function changeText(current,previous,{points=false,locale='de-DE'}={}) {
 if(points){const delta=(current-previous)*100;return `${delta>0?'+':''}${delta.toLocaleString(locale,{maximumFractionDigits:1})} Prozentpunkte`;}
 if(previous===0)return current===0?'Keine Änderung':'Neu';
 const delta=(current-previous)/previous*100;return `${delta>0?'+':''}${delta.toLocaleString(locale,{maximumFractionDigits:0})} %`;
}

function lineChart(currentSessions,previousSessions,currentRange,previousRange,metric,format,locale) {
 const current=relativeSeries(currentSessions,currentRange,metric),previous=relativeSeries(previousSessions,previousRange,metric),all=[...current,...previous];
 if(!all.length)return '<div class="comparison-empty">Keine Zeitreihendaten für diesen Vergleich.</div>';
 const width=760,height=245,left=64,right=18,top=20,bottom=42,plotW=width-left-right,plotH=height-top-bottom,max=Math.max(1,...all.map(point=>point.value));
 const x=(index,length)=>left+(length<=1?.5:index/(length-1))*plotW,y=value=>top+plotH-value/max*plotH;
 const path=series=>series.map((point,index)=>`${index?'L':'M'} ${x(index,series.length).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
 let svg=`<line class="comparison-axis" x1="${left}" y1="${top+plotH}" x2="${width-right}" y2="${top+plotH}"/><line class="grid-line" x1="${left}" y1="${top}" x2="${width-right}" y2="${top}"/><line class="grid-line" x1="${left}" y1="${top+plotH/2}" x2="${width-right}" y2="${top+plotH/2}"/><text x="${left-9}" y="${top+4}" text-anchor="end">${format(max)}</text><text x="${left-9}" y="${top+plotH/2+4}" text-anchor="end">${format(max/2)}</text><text x="${left-9}" y="${top+plotH+4}" text-anchor="end">0</text>`;
 if(previous.length)svg+=`<path class="comparison-line previous" d="${path(previous)}"/>`;
 if(current.length)svg+=`<path class="comparison-line current" d="${path(current)}"/>`;
 const points=(series,kind,label)=>series.map((point,index)=>{
  const payload={title:`${label} · ${localDate(`${point.key}T00:00:00`,locale)}`,rows:[[metric==='cost'?'API-Schätzung':metric==='requests'?'Modellantworten':'Tokens',format(point.value),kind]],note:`Tag ${index+1} im Zeitraum`};
  return `<circle class="comparison-point ${kind}" cx="${x(index,series.length)}" cy="${y(point.value)}" r="5" tabindex="0" role="img" aria-label="${tipLabel(payload)}" ${tipAttr(payload)}/>`;
 }).join('');
 svg+=points(previous,'previous','Vergleich')+points(current,'current','Aktuell');
 svg+=`<text x="${left}" y="${height-12}">Beginn</text><text x="${width-right}" y="${height-12}" text-anchor="end">Ende</text>`;
 return `<div class="comparison-chart" data-tip-host><svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Aktueller und vorheriger Zeitraum auf gemeinsamer relativer Zeitachse">${svg}</svg></div>`;
}

export function comparisonView({currentSessions,previousSessions,currentRange,previousRange,metric='tokens',dimension='repository',sortKey='delta',sortDirection='desc',esc,num,compact,money,basename,toolName,locale='de-DE'}) {
 const current=analytics(currentSessions),previous=analytics(previousSessions),format=value=>metric==='cost'?money(value):metric==='requests'?num(value):compact(value);
 const kpis=[
  ['Tokens',compact(current.tokens),compact(previous.tokens),changeText(current.tokens,previous.tokens,{locale})],
  ['API-Schätzung',current.unknown===current.requests&&current.requests?'–':money(current.cost),previous.unknown===previous.requests&&previous.requests?'–':money(previous.cost),changeText(current.cost,previous.cost,{locale})],
  ['Modellantworten',num(current.requests),num(previous.requests),changeText(current.requests,previous.requests,{locale})],
  ['Sessions',num(current.sessionCount),num(previous.sessionCount),changeText(current.sessionCount,previous.sessionCount,{locale})],
  ['Cache-Anteil',(current.cacheRatio*100).toLocaleString(locale,{maximumFractionDigits:1})+' %',(previous.cacheRatio*100).toLocaleString(locale,{maximumFractionDigits:1})+' %',changeText(current.cacheRatio,previous.cacheRatio,{points:true,locale})]
 ];
 const rawRows=comparisonRows(currentSessions,previousSessions,dimension,metric),dimensionLabel={repository:'Projekte',model:'Modelle',tool:'KI-Tools'}[dimension];
 const name=row=>dimension==='repository'?basename(row.name):dimension==='tool'?toolName(row.name):row.name;
 const delta=row=>row.previous===0?(row.current===0?'–':'Neu'):changeText(row.current,row.previous,{locale});
 const relative=row=>row.previous===0?(row.current===0?0:Number.POSITIVE_INFINITY):(row.current-row.previous)/row.previous;
 const rows=sortRows(rawRows,sortKey,sortDirection,(row,key)=>key==='name'?name(row):key==='relative'?relative(row):row[key]);
 const head=(label,key,numeric=false)=>sortableHeader(label,key,{activeKey:sortKey,direction:sortDirection,context:'comparison',numeric});
 const costWarning=metric==='cost'&&(current.unknown||previous.unknown)?`<div class="notice comparison-notice">Kosten nur eingeschränkt vergleichbar: aktuell ${num(current.unknown)}, im Vergleich ${num(previous.unknown)} Antworten ohne bekannten Preis.</div>`:'';
 return `<section class="panel comparison-panel"><div class="panel-head comparison-head"><div><h2>Zeiträume vergleichen</h2><p><span class="comparison-key current"></span>${esc(localDate(currentRange.start,locale))} – ${esc(localDate(currentRange.end,locale))}<span class="comparison-key previous"></span>${esc(localDate(previousRange.start,locale))} – ${esc(localDate(previousRange.end,locale))}</p></div><div class="segments" aria-label="Vergleichsmetrik">${[['tokens','Tokens'],['cost','Kosten'],['requests','Antworten']].map(([key,label])=>`<button data-comparison-metric="${key}" class="${metric===key?'active':''}">${label}</button>`).join('')}</div></div><div class="comparison-kpis">${kpis.map(([label,currentValue,previousValue,deltaValue])=>`<div><span>${esc(label)}</span><strong>${esc(currentValue)}</strong><small>Vergleich ${esc(previousValue)}</small><em>${esc(deltaValue)}</em></div>`).join('')}</div>${lineChart(currentSessions,previousSessions,currentRange,previousRange,metric,format,locale)}${costWarning}<div class="comparison-table-head"><div><h3>Was hat sich verändert?</h3></div><div class="segments" aria-label="Vergleichsdimension">${[['repository','Projekte'],['model','Modelle'],['tool','KI-Tools']].map(([key,label])=>`<button data-comparison-dimension="${key}" class="${dimension===key?'active':''}">${label}</button>`).join('')}</div></div><div class="table-wrap"><table><thead><tr>${head(dimensionLabel,'name')}${head('Vergleich','previous',true)}${head('Aktuell','current',true)}${head('Absolut','delta',true)}${head('Relativ','relative',true)}</tr></thead><tbody>${rows.map(row=>`<tr><td><button class="row-button comparison-row" data-comparison-filter="${dimension}" data-comparison-value="${esc(row.name)}"><span class="row-title">${esc(name(row))}</span></button></td><td class="numeric">${format(row.previous)}</td><td class="numeric">${format(row.current)}</td><td class="numeric comparison-delta ${row.delta>0?'positive':row.delta<0?'negative':''}">${row.delta>0?'+':''}${format(row.delta)}</td><td class="numeric">${esc(delta(row))}</td></tr>`).join('')||'<tr><td colspan="5">Keine Aktivitäten in beiden Zeiträumen.</td></tr>'}</tbody></table></div></section>`;
}
