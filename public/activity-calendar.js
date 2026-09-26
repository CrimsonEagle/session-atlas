import {calendarKey,tokenCount,totals} from './analytics-core.js';
import {tipAttr,tipLabel} from './charts.js';
import {TOOL_IDS,toolDefinition} from './tools.js';

const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const midnight=value=>{const date=new Date(value);date.setHours(0,0,0,0);return date;};
const nextDay=value=>{const date=new Date(value);date.setDate(date.getDate()+1);return date;};

export function activityDays(sessions=[],range,now=Date.now()) {
 if(!range||!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.end<range.start)return [];
 const map=new Map(),blank=key=>({key,tokens:0,cost:0,requests:0,unknown:0,sessions:new Set(),tools:Object.fromEntries(TOOL_IDS.map(tool=>[tool,{tokens:0,cost:0,requests:0,unknown:0}]))});
 for(const session of sessions)for(const event of session.events||[]){
  const time=Date.parse(event.time);if(!Number.isFinite(time)||time<range.start||time>range.end)continue;
  const key=calendarKey(time);if(!map.has(key))map.set(key,blank(key));const day=map.get(key),tool=day.tools[session.tool],value=tokenCount(event),count=event.requestCount??1;
  if(!tool)continue;day.tokens+=value;day.requests+=count;day.sessions.add(session.id);tool.tokens+=value;tool.requests+=count;
  if(event.cost===null){day.unknown+=count;tool.unknown+=count;}else{day.cost+=event.cost||0;tool.cost+=event.cost||0;}
 }
 const today=midnight(now),cursor=midnight(range.start),last=midnight(range.end),days=[];
 while(cursor<=last){const key=calendarKey(cursor),day=map.get(key)||blank(key);days.push({...day,date:new Date(cursor),future:cursor>today,sessionCount:day.sessions.size});cursor.setDate(cursor.getDate()+1);}
 return days;
}

export function calendarMetricValue(day,metric='tokens') {
 if(metric==='cost')return day.cost;
 if(metric==='requests')return day.requests;
 return day.tokens;
}

function monthName(date,locale){return date.toLocaleDateString(locale,{month:'short'}).replace('.','');}
function dayName(date,locale){return date.toLocaleDateString(locale,{weekday:'long',day:'2-digit',month:'long',year:'numeric'});}

export function activityCalendarView({sessions,range,metric='tokens',selectedKey=null,rangeMode='rolling',years=[],now=Date.now(),num,compact,money,tools=TOOL_IDS,locale='de-DE'}) {
 const visibleTools=tools.filter(tool=>TOOL_IDS.includes(tool));
 const days=activityDays(sessions,range,now),metricLabel={tokens:'Tokens',cost:'API-Schätzung',requests:'Modellantworten'}[metric],format=value=>metric==='cost'?money(value):metric==='requests'?num(value):compact(value);
 const metricForTool=(tool,day)=>metric==='cost'?day.tools[tool].cost:metric==='requests'?day.tools[tool].requests:day.tools[tool].tokens;
 const rangeControls=`<select id="calendar-range" aria-label="Kalenderzeitraum"><option value="rolling" ${rangeMode==='rolling'?'selected':''}>Letzte 12 Monate</option>${years.map(year=>`<option value="${year}" ${rangeMode===String(year)?'selected':''}>Kalenderjahr ${year}</option>`).join('')}${rangeMode==='selection'?'<option value="selection" selected>Aktueller Zeitraumfilter</option>':''}</select>`;
 const viewControls='<div class="segments overview-view-switch" aria-label="Übersichtsdarstellung"><button data-overview-visual="chart">Verlauf</button><button data-overview-visual="calendar" class="active">Kalender</button></div>';
 const metricControls=`<div class="segments" aria-label="Kalendermetrik">${[['tokens','Tokens'],['cost','Kosten'],['requests','Antworten']].map(([key,label])=>`<button data-calendar-metric="${key}" class="${metric===key?'active':''}">${label}</button>`).join('')}</div>`;
 const head=`<div class="panel-head activity-head"><div><h2>Aktivitätskalender</h2><p>Lokale Kalendertage · Montag bis Sonntag</p></div><div class="panel-controls">${viewControls}${metricControls}</div></div>`;
 if(!days.length)return `<section class="panel activity-panel">${head}<div class="calendar-toolbar">${rangeControls}</div><div class="comparison-empty">Wähle einen gültigen, begrenzten Zeitraum.</div></section>`;
 if(days.length>370)return `<section class="panel activity-panel">${head}<div class="calendar-toolbar">${rangeControls}</div><div class="notice calendar-range-notice">Der Kalender zeigt höchstens 12 Monate beziehungsweise ein Kalenderjahr. Wähle oben einen passenden Zeitraum.</div></section>`;
 const max=Math.max(0,...days.filter(day=>!day.future).map(day=>calendarMetricValue(day,metric))),level=day=>{const value=calendarMetricValue(day,metric);return value>0&&max>0?Math.max(1,Math.min(4,Math.ceil(value/max*4))):0;};
 const dayMap=new Map(days.map(day=>[day.key,day])),first=midnight(days[0].date),last=midnight(days.at(-1).date);first.setDate(first.getDate()-((first.getDay()+6)%7));last.setDate(last.getDate()+(7-last.getDay())%7);
 const weeks=[];let cursor=new Date(first),weekIndex=0;
 while(cursor<=last){const week=[];for(let row=0;row<7;row++){const key=calendarKey(cursor),day=dayMap.get(key);week.push(day||null);cursor=nextDay(cursor);}const monthDay=week.find(day=>day&&day.date.getDate()===1)||weekIndex===0&&week.find(Boolean);weeks.push({label:monthDay?monthName(monthDay.date,locale):'',days:week});weekIndex++;}
 const button=day=>{
  if(!day)return '<span class="calendar-day outside" aria-hidden="true"></span>';
  const value=calendarMetricValue(day,metric),unknownCost=metric==='cost'&&day.unknown>0,selected=day.key===selectedKey;
  const payload={title:dayName(day.date,locale),rows:[[metricLabel,format(value)],['Sessions',num(day.sessionCount)],...visibleTools.map(tool=>[toolDefinition(tool).name,format(metricForTool(tool,day)),tool])],note:day.future?'Liegt in der Zukunft':day.unknown?`${num(day.unknown)} Antworten ohne bekannten Preis`:value?'Anklicken, um diesen Tag auszuwählen':'Keine Aktivität protokolliert'};
  return `<button type="button" class="calendar-day level-${level(day)}${unknownCost?' unknown-cost':''}${selected?' selected':''}${day.future?' future':''}" ${day.future?'disabled':`data-chart-bucket="${day.key}" data-chart-period="day" aria-pressed="${selected}"`} aria-label="${html(tipLabel(payload))}" ${tipAttr(payload)}><span>${day.date.getDate()}</span></button>`;
 };
 const total=totals(sessions.flatMap(session=>session.events)),active=days.filter(day=>!day.future&&day.requests).length,unknown=days.reduce((sum,day)=>sum+day.unknown,0);
 const legend=`<div class="calendar-legend" aria-label="Farbskala"><span>Keine</span>${[0,1,2,3,4].map(value=>`<i class="calendar-swatch level-${value}"></i>`).join('')}<span>Mehr</span><strong>Maximum ${format(max)}</strong></div>`;
 const grid=`<div class="calendar-scroll"><div class="calendar-grid"><div class="calendar-weekdays"><span></span>${['Mo','','Mi','','Fr','','So'].map(label=>`<span>${label}</span>`).join('')}</div>${weeks.map(week=>`<div class="calendar-week"><span class="calendar-month">${week.label}</span>${week.days.map(button).join('')}</div>`).join('')}</div></div>`;
 return `<section class="panel activity-panel" data-tip-host>${head}<div class="calendar-toolbar">${rangeControls}<span>${num(active)} aktive Tage · ${num(total.requests)} Antworten${metric==='cost'&&unknown?` · ${num(unknown)} ohne Preis`:''}</span></div>${grid}<div class="calendar-footer">${legend}<span>Jede Zelle zeigt zusätzlich den Kalendertag als Zahl.</span></div></section>`;
}
