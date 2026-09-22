export const tokenCount=event=>(event?.input||0)+(event?.cache||0)+(event?.write||0)+(event?.output||0);

const validTime=value=>{const time=value instanceof Date?value.getTime():Date.parse(value);return Number.isFinite(time)?time:null;};
const localMidnight=value=>{const date=new Date(value);date.setHours(0,0,0,0);return date;};
const localEndOfDay=value=>{const date=localMidnight(value);date.setDate(date.getDate()+1);return date.getTime()-1;};
const shiftDays=(value,days)=>{const date=new Date(value);date.setDate(date.getDate()+days);return date.getTime();};
const startOfWeek=value=>{const date=localMidnight(value);date.setDate(date.getDate()-((date.getDay()+6)%7));return date;};
const startOfMonth=value=>{const date=localMidnight(value);date.setDate(1);return date;};

export function calendarKey(value) {
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function rangeForPeriod(period='30',{now=Date.now(),from='',to=''}={}) {
 const current=new Date(now);let start=0,end=current.getTime();
 if(period==='today')start=localMidnight(current).getTime();
 else if(['7','30'].includes(String(period))){const date=localMidnight(current);date.setDate(date.getDate()-Number(period)+1);start=date.getTime();}
 else if(period==='12months'){const date=localMidnight(current);date.setFullYear(date.getFullYear()-1);date.setDate(date.getDate()+1);start=date.getTime();}
 else if(period==='week')start=startOfWeek(current).getTime();
 else if(period==='month')start=startOfMonth(current).getTime();
 else if(period==='custom'){
  const parsedFrom=validTime(from?`${from}T00:00:00`:null),parsedTo=validTime(to?`${to}T00:00:00`:null);
  if(parsedFrom!==null)start=parsedFrom;if(parsedTo!==null)end=localEndOfDay(parsedTo);
 }
 return {start,end,period};
}

export function rangeForLimitWindow(window,{now=Date.now()}={}) {
 const minutes=Number(window?.window_minutes),reset=Number(window?.resets_at)*1000;
 if(!Number.isFinite(minutes)||minutes<=0||!Number.isFinite(reset)||reset<=now)return null;
 const start=reset-minutes*60000;
 if(!Number.isFinite(start)||start>now)return null;
 return {start,end:now,reset,windowMinutes:minutes};
}

export function comparisonRange(current,mode='previous',{from='',to=''}={}) {
 if(!current||!Number.isFinite(current.start)||!Number.isFinite(current.end)||current.start<=0||current.end<current.start)return null;
 if(mode==='previous'&&current.period==='month')return comparisonRange(current,'month');
 if(mode==='custom'){
  const start=validTime(from?`${from}T00:00:00`:null),day=validTime(to?`${to}T00:00:00`:null);
  return start===null||day===null||day<start?null:{start,end:localEndOfDay(day),period:'custom'};
 }
 if(mode==='week'){
  const thisWeek=startOfWeek(current.end),start=shiftDays(thisWeek,-7);
  const matching=current.period==='week';return {start,end:matching?shiftDays(current.end,-7):shiftDays(thisWeek,-1),period:'week'};
 }
 if(mode==='month'){
  const thisMonth=startOfMonth(current.end),previous=new Date(thisMonth);previous.setMonth(previous.getMonth()-1);
  if(current.period!=='month')return {start:previous.getTime(),end:thisMonth.getTime()-1,period:'month'};
  const elapsedDay=new Date(current.end).getDate(),elapsedTime=new Date(current.end),lastDay=new Date(thisMonth);lastDay.setDate(0);
  const end=new Date(previous);end.setDate(Math.min(elapsedDay,lastDay.getDate()));end.setHours(elapsedTime.getHours(),elapsedTime.getMinutes(),elapsedTime.getSeconds(),elapsedTime.getMilliseconds());
  return {start:previous.getTime(),end:end.getTime(),period:'month'};
 }
 const days=Math.round((Date.UTC(new Date(current.end).getFullYear(),new Date(current.end).getMonth(),new Date(current.end).getDate())-Date.UTC(new Date(current.start).getFullYear(),new Date(current.start).getMonth(),new Date(current.start).getDate()))/86400000)+1;
 return {start:shiftDays(current.start,-days),end:shiftDays(current.end,-days),period:current.period};
}

export function filterSessions(sessions=[],scope={},range=scope.bounds) {
 const start=range?.start??0,end=range?.end??Date.now(),tool=scope.tool||'all',repository=scope.repository||'all',model=scope.model||'all',query=String(scope.query||'').trim().toLowerCase();
 return sessions.flatMap(session=>{
  if(tool!=='all'&&session.tool!==tool)return [];
  if(repository!=='all'&&session.repository!==repository)return [];
  const haystack=[session.name,session.title,session.cwd,session.repository,session.branch||'Ohne Branch',session.sessionId,session.subagent?'Subagent':'Hauptsession',...new Set((session.events||[]).map(event=>event.model))].join(' ').toLowerCase();
  if(query&&!haystack.includes(query))return [];
  const events=(session.events||[]).filter(event=>{const time=validTime(event.time);return time!==null&&time>=start&&time<=end&&(model==='all'||event.model===model);});
  if(events.length)return [{...session,events,...eventRange(events,session)}];
  if(model!=='all'||(session.events||[]).length)return [];
  const activity=validTime(session.lastActivity);return activity!==null&&activity>=start&&activity<=end?[{...session,events:[]}]:[];
 });
}

export function totals(events=[]) {
 return events.reduce((summary,event)=>{
  for(const key of ['input','cache','write','output','reasoning'])summary[key]+=event?.[key]||0;
  summary.tokens+=tokenCount(event);summary.cost+=event?.cost||0;
  summary.unknown+=Number(event?.cost===null);summary.requests++;
  return summary;
 },{input:0,cache:0,write:0,output:0,reasoning:0,tokens:0,cost:0,unknown:0,requests:0});
}

export function eventRange(events=[],fallback={}) {
 const times=events.map(event=>event.time).filter(Boolean).sort();
 return {firstActivity:times[0]||fallback.started||fallback.lastActivity||null,lastActivity:times.at(-1)||fallback.lastActivity||fallback.started||null};
}

function groupKeys(session,kind) {
 if(kind==='model')return [...new Set(session.events.map(event=>event.model||'unknown'))];
 if(kind==='tier')return [...new Set(session.events.map(event=>event.tier||'standard'))];
 if(kind==='effort')return [...new Set(session.events.map(event=>event.effort||session.effort||'Nicht protokolliert'))];
 if(kind==='geo')return [...new Set(session.events.map(event=>event.geo||'Nicht protokolliert'))];
 if(kind==='tool')return [session.tool];
 if(kind==='branch')return [session.branch||'Ohne Branch'];
 if(kind==='agent')return [session.subagent?'Subagent':'Hauptsession'];
 return [session.repository];
}

function eventsForKey(session,kind,key) {
 if(kind==='model')return session.events.filter(event=>(event.model||'unknown')===key);
 if(kind==='tier')return session.events.filter(event=>(event.tier||'standard')===key);
 if(kind==='effort')return session.events.filter(event=>(event.effort||session.effort||'Nicht protokolliert')===key);
 if(kind==='geo')return session.events.filter(event=>(event.geo||'Nicht protokolliert')===key);
 return session.events;
}

export function grouped(sessions=[],kind='sessions') {
 if(kind==='sessions')return sessions.map(session=>({...session,...eventRange(session.events,session),...totals(session.events)}));
 const groups=new Map();
 for(const session of sessions)for(const key of groupKeys(session,kind)) {
  const events=eventsForKey(session,kind,key);if(!events.length&&['model','tier','effort','geo'].includes(kind))continue;
  const range=eventRange(events,session);let group=groups.get(key);
  if(!group){group={id:key,name:key,events:[],sessions:new Set(),tools:new Set(),repositories:new Set(),branches:new Set(),firstActivity:range.firstActivity,lastActivity:range.lastActivity};groups.set(key,group);}
  group.events.push(...events);group.sessions.add(session.id);group.tools.add(session.tool);group.repositories.add(session.repository);group.branches.add(session.branch||'Ohne Branch');
  if(range.firstActivity&&(!group.firstActivity||range.firstActivity<group.firstActivity))group.firstActivity=range.firstActivity;
  if(range.lastActivity&&(!group.lastActivity||range.lastActivity>group.lastActivity))group.lastActivity=range.lastActivity;
 }
 return [...groups.values()].map(group=>({...group,...totals(group.events)}));
}

export function selectGroup(sessions,kind,key) {
 return sessions.flatMap(session=>{
  if(kind==='repository'&&session.repository!==key)return [];
  if(kind==='tool'&&session.tool!==key)return [];
  if(kind==='branch'&&(session.branch||'Ohne Branch')!==key)return [];
  if(kind==='agent'&&(session.subagent?'Subagent':'Hauptsession')!==key)return [];
  const events=eventsForKey(session,kind,key);
  if(['model','tier','effort','geo'].includes(kind)&&!events.length)return [];
  return [{...session,events,...eventRange(events,session)}];
 });
}

export function selectDimension(sessions,kind,key) {return key==null?sessions:selectGroup(sessions,kind,key);}

export function periodKey(value,period='day') {
 const date=new Date(value);date.setHours(0,0,0,0);
 if(period==='week')date.setDate(date.getDate()-((date.getDay()+6)%7));
 if(period==='month')date.setDate(1);
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function selectPeriod(sessions=[],key,period='day') {
 if(!key)return sessions;
 return sessions.flatMap(session=>{
  const events=session.events.filter(event=>periodKey(event.time,period)===key);
  return events.length?[{...session,events,...eventRange(events,session)}]:[];
 });
}

export function chartScopedSessions(sessions=[],view,key,period='day') {
 return view==='overview'&&key?selectPeriod(sessions,key,period):sessions;
}

export function analytics(sessions=[]) {
 const summary=totals(sessions.flatMap(session=>session.events));
 const sessionRows=grouped(sessions,'sessions'),priced=summary.requests-summary.unknown,inputBase=summary.input+summary.cache+summary.write;
 const activeDays=new Set(sessions.flatMap(session=>session.events.map(event=>calendarKey(event.time))).filter(Boolean)).size;
 const top3=sessionRows.map(session=>session.tokens).sort((a,b)=>b-a).slice(0,3).reduce((sum,value)=>sum+value,0);
 return {...summary,sessionCount:sessions.length,activeDays,cacheRatio:inputBase?summary.cache/inputBase:0,priceCoverage:summary.requests?priced/summary.requests:0,averagePerSession:sessions.length?summary.tokens/sessions.length:0,averagePerRequest:summary.requests?summary.tokens/summary.requests:0,top3Share:summary.tokens?top3/summary.tokens:0};
}

export function bucketSeries(sessions=[],metric='tokens',maxBuckets=60) {
 const events=sessions.flatMap(session=>session.events.map(event=>({...event,tool:session.tool}))).filter(event=>Number.isFinite(Date.parse(event.time)));
 if(!events.length)return {period:'day',rows:[]};
 const times=events.map(event=>Date.parse(event.time)).sort((a,b)=>a-b),limit=Math.max(1,Math.floor(Number(maxBuckets)||60));
 const bucketCount=period=>{
  const first=new Date(periodKey(times[0],period)+'T00:00:00'),last=new Date(periodKey(times.at(-1),period)+'T00:00:00');
  if(period==='month')return (last.getFullYear()-first.getFullYear())*12+last.getMonth()-first.getMonth()+1;
  const serial=date=>Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000;
  return Math.floor((serial(last)-serial(first))/(period==='week'?7:1))+1;
 };
 // Choose by touched local calendar buckets, not elapsed milliseconds. This stays correct across
 // partial weeks/months and daylight-saving transitions.
 const period=bucketCount('day')<=limit?'day':bucketCount('week')<=limit?'week':'month';
 const keyFor=value=>periodKey(value,period);
 const map=new Map();
 for(const event of events){const key=keyFor(event.time);if(!map.has(key))map.set(key,{key,codex:0,claude:0});const value=metric==='cost'?(event.cost||0):metric==='requests'?1:tokenCount(event);map.get(key)[event.tool]+=value;}
 // Idle periods become explicit zero buckets: a chart axis must not skip time, and the hover zones
 // of the rendered chart have to tile the plot without gaps.
 const keys=[...map.keys()].sort(),cursor=new Date(keys[0]+'T00:00:00'),count=bucketCount(period),rows=[];
 for(let index=0;index<count;index++) {
  const key=keyFor(cursor);rows.push(map.get(key)||{key,codex:0,claude:0});
  if(period==='month')cursor.setMonth(cursor.getMonth()+1);else cursor.setDate(cursor.getDate()+(period==='week'?7:1));
 }
 return {period,rows};
}

export function metricValue(summary,metric='tokens') {
 if(metric==='cost')return summary.cost;
 if(metric==='requests')return summary.requests;
 if(metric==='sessions')return summary.sessionCount??0;
 if(metric==='cacheRatio')return summary.cacheRatio??0;
 return summary.tokens;
}

export function comparisonRows(currentSessions=[],previousSessions=[],kind='repository',metric='tokens') {
 const current=new Map(grouped(currentSessions,kind).map(row=>[row.name,row]));
 const previous=new Map(grouped(previousSessions,kind).map(row=>[row.name,row]));
 return [...new Set([...current.keys(),...previous.keys()])].map(name=>{
  const currentSummary=current.get(name)||totals([]),previousSummary=previous.get(name)||totals([]);
  const currentValue=metricValue({...currentSummary,sessionCount:currentSummary.sessions?.size||0},metric);
  const previousValue=metricValue({...previousSummary,sessionCount:previousSummary.sessions?.size||0},metric);
  return {name,current:currentValue,previous:previousValue,delta:currentValue-previousValue,currentSummary,previousSummary};
 }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||String(a.name).localeCompare(String(b.name)));
}

export function relativeSeries(sessions=[],range,metric='tokens') {
 if(!range||range.end<range.start)return [];
 const byDay=new Map();
 for(const session of sessions)for(const event of session.events||[]){const key=calendarKey(event.time);if(!key)continue;const value=metric==='cost'?(event.cost||0):metric==='requests'?1:tokenCount(event);byDay.set(key,(byDay.get(key)||0)+value);}
 const result=[],cursor=localMidnight(range.start),last=localMidnight(range.end);let index=0;
 while(cursor<=last&&index<370){const key=calendarKey(cursor);result.push({index,key,value:byDay.get(key)||0});cursor.setDate(cursor.getDate()+1);index++;}
 return result;
}
