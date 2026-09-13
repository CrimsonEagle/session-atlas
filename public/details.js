import {analytics,bucketSeries,eventRange,grouped,selectDimension,selectGroup,tokenCount,totals} from './analytics-core.js';
import {attachTooltips,axisLabel,seriesChart,tipAttr} from './charts.js';

export function createDetailViews(options) {
 const {dialog,content,getData,getFiltered,getScope,applyFilter,esc,num,compact,money,date,basename,toolName,toolTag,costText}=options;
 const pageSize=12,responsePageSize=20;
 let state={view:null},history=[],searchTimer;

 const percent=value=>(value*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %';
 const labels={repository:'Repository',tool:'KI-Tool',model:'Modell',branch:'Branch',agent:'Sessiontyp',tier:'Service-Tier',effort:'Reasoning-Effort',geo:'Inference-Region'};
 const titleFor=(kind,key)=>kind==='repository'?basename(key):kind==='tool'?toolName(key):key;
 const displayValue=(kind,key)=>kind==='repository'?basename(key):kind==='tool'?toolName(key):key;
 const metricValue=(metric,value)=>metric==='cost'?money(value):metric==='requests'?num(value):compact(value);
 const cacheRatio=summary=>summary.input+summary.cache+summary.write?summary.cache/(summary.input+summary.cache+summary.write):0;
 const copy=value=>({...value,dimension:value.dimension?{...value.dimension}:null});

 function periodLabel(){const period=getScope().period;if(period==='today')return 'Heute';if(period==='7')return 'Letzte 7 Tage';if(period==='30')return 'Letzte 30 Tage';if(period==='custom')return 'Eigener Zeitraum';return 'Gesamter Verlauf';}
 function matchesControls(session,scope,start,end){
  if(scope.tool!=='all'&&session.tool!==scope.tool)return null;if(scope.repository!=='all'&&session.repository!==scope.repository)return null;
  const haystack=[session.title,session.cwd,session.repository,session.branch,session.sessionId,session.subagent?'Subagent':'Hauptsession',...new Set(session.events.map(event=>event.model))].join(' ').toLowerCase();
  if(scope.query&&!haystack.includes(scope.query))return null;
  const events=session.events.filter(event=>{const time=Date.parse(event.time);return time>=start&&time<=end;});
  if(!events.length)return null;return {...session,events,...eventRange(events,session)};
 }
 function previousFiltered(){const scope=getScope(),{start,end}=scope.bounds;if(!start||!Number.isFinite(start)||end<=start)return null;const duration=end-start+1,previousEnd=start-1,previousStart=previousEnd-duration+1;return getData().sessions.map(session=>matchesControls(session,scope,previousStart,previousEnd)).filter(Boolean);}
 function delta(current,previous){if(previous==null)return '';if(previous===0)return current===0?'0 %':'Neu';const value=(current-previous)/previous*100;return `${value>0?'+':''}${value.toLocaleString('de-DE',{maximumFractionDigits:0})} % zur Vorperiode`;}
 function setContent(html){content.innerHTML=html;dialog.classList.add('detail-wide');if(!dialog.open)dialog.showModal();}
 function header(title,context,tag=''){
  return `<div class="detail-header"><div class="detail-heading-row">${history.length?'<button class="detail-back" data-detail-back aria-label="Zur vorherigen Auswertung">‹</button>':''}<div>${tag}<h2${tag?' class="tagged"':''}>${esc(title)}</h2><span class="tiny muted">${esc(context)}</span></div></div><button class="close" id="close-detail" aria-label="Details schließen">✕</button></div>`;
 }
 function kpis(summary,previous,sessionMode=false){
  const p=previous?analytics(previous):null,items=[
   ['Tokens',compact(summary.tokens),delta(summary.tokens,p?.tokens),`Ø ${compact(summary.averagePerRequest)} je Antwort`],
   ['API-Schätzung',costText(summary),delta(summary.cost,p?.cost),`${percent(summary.priceCoverage)} mit Preis`],
   [sessionMode?'Aktive Tage':'Sessions',num(sessionMode?summary.activeDays:summary.sessionCount),delta(sessionMode?summary.activeDays:summary.sessionCount,sessionMode?p?.activeDays:p?.sessionCount),sessionMode?'Tage mit Modellantworten':`Ø ${compact(summary.averagePerSession)} Tokens`],
   ['Modellantworten',num(summary.requests),delta(summary.requests,p?.requests),`${compact(summary.output)} Output-Tokens`],
   ['Cache-Anteil',percent(summary.cacheRatio),p?`${delta(summary.cacheRatio,p.cacheRatio)}`:'',`${compact(summary.cache)} gelesene Tokens`]
  ];
  return `<section class="detail-kpis" aria-label="Kennzahlen">${items.map(([label,value,change,note])=>`<div class="detail-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong>${change?`<small>${esc(change)}</small>`:''}<small>${esc(note)}</small></div>`).join('')}</section>`;
 }
 const tokenParts=[['input','Input','Frisch gesendete Eingabe-Tokens'],['cache','Cache lesen','Wiederverwendete Eingabe-Tokens'],['write','Cache schreiben','Neu in den Prompt-Cache geschriebene Tokens'],['output','Output','Antwort-Tokens inklusive Reasoning']];
 function tokenBreakdown(summary){
  const share=value=>summary.tokens?value/summary.tokens:0;
  const segment=([key,label,note])=>summary[key]?`<i class="${key}" style="width:${share(summary[key])*100}%" ${tipAttr({title:label,rows:[['Tokens',num(summary[key])],['Anteil',percent(share(summary[key]))]],note})}></i>`:'';
  return `<div class="detail-token-block"><h3>Tokenstruktur</h3><div class="breakdown">${tokenParts.map(segment).join('')||'<i class="empty"></i>'}</div><div class="breakdown-labels">${tokenParts.map(([key,label])=>`<span><i class="dot ${key}"></i>${label} ${num(summary[key])}</span>`).join('')}<span>Davon Reasoning ${num(summary.reasoning)}</span></div></div>`;
 }
 // The coordinate width follows the dialog width, so the chart renders close to 1:1 and its labels
 // keep their intended size instead of being scaled by the viewBox fit.
 function chartSize(){const width=Math.round(Math.max(300,Math.min(1240,innerWidth-32)-48));return {width,height:Math.round(Math.min(290,Math.max(190,width*.26)))};}
 function timeline(sessions,metric){
  const {period,rows}=bucketSeries(sessions,metric),{width,height}=chartSize();
  const periodName={day:'Tag',week:'Woche',month:'Monat'}[period],metricName={tokens:'Tokens',cost:'Kosten',requests:'Modellantworten'}[metric];
  const range=rows.length?`${periodName} · ${num(rows.length)} ${rows.length===1?'Abschnitt':'Abschnitte'} · ${axisLabel(rows[0].key,period)} – ${axisLabel(rows.at(-1).key,period)}`:'Keine Nutzungsereignisse im Ausschnitt';
  const head=`<div class="detail-section-head"><div><h3>Verlauf</h3><p>${esc(range)}</p></div><div class="segments" aria-label="Verlaufsmetrik">${[['tokens','Tokens'],['cost','Kosten'],['requests','Antworten']].map(([key,label])=>`<button data-detail-metric="${key}" class="${metric===key?'active':''}">${label}</button>`).join('')}</div></div>`;
  if(!rows.length)return `<section class="detail-section detail-timeline">${head}<div class="detail-empty">Keine Nutzungsereignisse für den Verlauf.</div></section>`;
  const chart=seriesChart({rows,format:value=>metricValue(metric,value),period,width,height,idPrefix:'detail-series',title:`${metricName} je ${periodName}`});
  return `<section class="detail-section detail-timeline">${head}<div class="detail-chart-wrap" data-tip-host>${chart}</div><div class="detail-chart-legend"><span><i class="dot codex"></i>Codex</span><span><i class="dot claude"></i>Claude Code</span></div></section>`;
 }
 function dimensionKinds(kind,sessions){
  const map={repository:['model','tool','branch'],model:['repository','tool','tier'],tool:['model','repository','branch'],branch:['model','tool','agent'],agent:['repository','model','tool']};
  const result=map[kind]||['model','repository','tool'];
  if(sessions.some(session=>session.events.some(event=>event.effort)||session.effort))result.push('effort');
  if(sessions.some(session=>session.events.some(event=>event.geo)))result.push('geo');return result.slice(0,3);
 }
 function breakdownPanel(sessions,kind,interactive=true){
  const all=grouped(sessions,kind).sort((a,b)=>b.tokens-a.tokens),rows=all.slice(0,7),rest=all.length-rows.length;
  const max=Math.max(1,...rows.map(row=>row.tokens)),sum=all.reduce((total,row)=>total+row.tokens,0);
  const bar=row=>{
   const button=interactive?'button':'div',active=state.dimension?.kind===kind&&state.dimension.key===row.name;
   const tip={title:kind==='repository'?row.name:displayValue(kind,row.name),rows:[['Tokens',compact(row.tokens)],['API-Kosten',costText(row)],['Sessions',num(row.sessions.size)],['Modellantworten',num(row.requests)]],total:['Anteil',percent(sum?row.tokens/sum:0)],note:interactive?(active?'Aktive Unterauswahl':'Klicken grenzt die Auswertung ein'):''};
   return `<${button} class="detail-breakdown-row ${active?'active':''}" ${tipAttr(tip)} ${interactive?`data-detail-dimension="${esc(kind)}" data-detail-value="${esc(row.name)}"`:''}><span><strong>${esc(displayValue(kind,row.name))}</strong><small>${num(row.sessions.size)} Sessions · ${compact(row.tokens)}</small></span><i><b style="width:${row.tokens/max*100}%"></b></i></${button}>`;
  };
  return `<section class="detail-breakdown"><h3>${esc(labels[kind]||kind)}</h3>${rows.map(bar).join('')||'<p>Keine Daten</p>'}${rest>0?`<small class="detail-breakdown-rest">+ ${num(rest)} weitere</small>`:''}</section>`;
 }
 function quality(summary,malformed=0){let html='';if(summary.unknown)html+=`<div class="notice">${num(summary.unknown)} Antworten ohne bekannten Preis. Die bekannte Kostensumme ist eine Untergrenze.</div>`;if(malformed)html+=`<div class="notice">${num(malformed)} ungültige Logzeilen wurden übersprungen.</div>`;return html;}
 function scopedAggregate(){let sessions=selectGroup(getFiltered(),state.kind,state.key);if(state.dimension)sessions=selectDimension(sessions,state.dimension.kind,state.dimension.key);return sessions;}
 function aggregateTable(sessions,summary){
  let rows=grouped(sessions,'sessions'),query=(state.search||'').trim().toLowerCase();if(query)rows=rows.filter(session=>[session.title,session.cwd,session.repository,session.branch,session.sessionId,...session.events.map(event=>event.model)].join(' ').toLowerCase().includes(query));
  if(state.agent&&state.agent!=='all')rows=rows.filter(session=>(state.agent==='subagent')===Boolean(session.subagent));
  const cache=session=>cacheRatio(session);rows.sort((a,b)=>state.sessionSort==='cost'?b.cost-a.cost:state.sessionSort==='activity'?(b.lastActivity||'').localeCompare(a.lastActivity||''):state.sessionSort==='cache'?cache(b)-cache(a):b.tokens-a.tokens);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));state.sessionPage=Math.min(state.sessionPage||0,pages-1);const shown=rows.slice(state.sessionPage*pageSize,(state.sessionPage+1)*pageSize);
  return `<section class="detail-section detail-session-list"><div class="detail-section-head"><div><h3>Zugehörige Sessions</h3><p>${num(rows.length)} Treffer${state.dimension?' in der Unterauswahl':''}</p></div><div class="detail-table-tools"><input id="detail-session-search" type="search" value="${esc(state.search||'')}" placeholder="Sessions durchsuchen" aria-label="Sessions durchsuchen"><select id="detail-agent-filter" aria-label="Sessiontyp"><option value="all">Alle Sessiontypen</option><option value="main" ${state.agent==='main'?'selected':''}>Hauptsessions</option><option value="subagent" ${state.agent==='subagent'?'selected':''}>Subagents</option></select><select id="detail-session-sort" aria-label="Sessions sortieren"><option value="tokens" ${state.sessionSort==='tokens'?'selected':''}>Meiste Tokens</option><option value="cost" ${state.sessionSort==='cost'?'selected':''}>Höchste Kosten</option><option value="activity" ${state.sessionSort==='activity'?'selected':''}>Letzte Aktivität</option><option value="cache" ${state.sessionSort==='cache'?'selected':''}>Höchster Cache-Anteil</option></select></div></div><div class="table-wrap"><table><thead><tr><th>Session</th><th>Modell / Branch</th><th class="numeric">Anteil</th><th class="numeric">Antworten</th><th class="numeric">Tokens</th><th class="numeric">API-Kosten</th><th class="numeric">Aktivität</th></tr></thead><tbody>${shown.map(session=>`<tr><td><button class="row-button" data-session="${esc(session.id)}"><span class="row-title">${esc(session.title||basename(session.cwd))}</span><span class="row-subtitle">${esc(basename(session.repository))}${session.subagent?' · Subagent':''}</span></button></td><td>${esc([...new Set(session.events.map(event=>event.model))].join(', ')||'Nicht protokolliert')}<span class="row-subtitle">${esc(session.branch||'Ohne Branch')}</span></td><td class="numeric">${percent(summary.tokens?session.tokens/summary.tokens:0)}</td><td class="numeric">${num(session.requests)}</td><td class="numeric">${compact(session.tokens)}<span class="row-subtitle">${percent(cache(session))} Cache</span></td><td class="numeric">${costText(session)}</td><td class="numeric muted">${date(session.lastActivity)}</td></tr>`).join('')||'<tr><td colspan="7">Keine Sessions für diese Auswahl.</td></tr>'}</tbody></table></div><div class="table-footer"><span>${rows.length?`${state.sessionPage*pageSize+1}–${Math.min((state.sessionPage+1)*pageSize,rows.length)} von ${rows.length}`:'0 Treffer'}</span><div class="pagination"><button data-detail-page="-1" ${state.sessionPage===0?'disabled':''} aria-label="Vorherige Seite">‹</button><span>Seite ${state.sessionPage+1} / ${pages}</span><button data-detail-page="1" ${state.sessionPage+1>=pages?'disabled':''} aria-label="Nächste Seite">›</button></div></div></section>`;
 }
 function renderAggregate(){
  const sessions=scopedAggregate(),summary=analytics(sessions),previousBase=previousFiltered();let previous=null;if(previousBase){previous=selectGroup(previousBase,state.kind,state.key);if(state.dimension)previous=selectDimension(previous,state.dimension.kind,state.dimension.key);}
  const root=selectGroup(getFiltered(),state.kind,state.key),context=`${labels[state.kind]} · ${periodLabel()} · aktuelle Hauptfilter`,filterChip=state.dimension?`<div class="detail-filter-chip"><span>${esc(labels[state.dimension.kind])}: <strong>${esc(displayValue(state.dimension.kind,state.dimension.key))}</strong></span><button data-detail-clear-dimension aria-label="Unterauswahl entfernen">✕</button></div>`:'';
  setContent(`${header(titleFor(state.kind,state.key),context,state.kind==='tool'?toolTag(state.key):'')}<div class="detail-body detail-analysis" data-tip-host>${filterChip}<div class="detail-actions"><button class="button secondary" data-apply-group>Als Hauptfilter übernehmen</button></div>${kpis(summary,previous)}${timeline(sessions,state.metric)}<div class="detail-breakdown-grid">${dimensionKinds(state.kind,root).map(kind=>breakdownPanel(root,kind)).join('')}</div><div class="detail-insights"><span><strong>${percent(summary.top3Share)}</strong> der Tokens stammen aus den drei größten Sessions.</span><span><strong>${num(summary.activeDays)}</strong> aktive Tage im gewählten Ausschnitt.</span><span><strong>${compact(summary.averagePerSession)}</strong> Tokens pro Session im Durchschnitt.</span></div>${tokenBreakdown(summary)}${quality(summary,sessions.reduce((sum,session)=>sum+(session.malformed||0),0))}${aggregateTable(sessions,summary)}</div>`);
 }
 function renderSession(){
  const raw=getData().sessions.find(session=>session.id===state.id);if(!raw)return;const filtered=getFiltered().find(session=>session.id===state.id),session=state.scope==='filtered'&&filtered?{...raw,events:filtered.events}:raw,summary=analytics([session]),range=eventRange(session.events,session),models=[...new Set(session.events.map(event=>event.model))],tiers=[...new Set(session.events.map(event=>event.tier).filter(Boolean))],geos=[...new Set(session.events.map(event=>event.geo).filter(Boolean))];
  let responses=[...session.events];responses.sort((a,b)=>state.responseSort==='tokens'?tokenCount(b)-tokenCount(a):state.responseSort==='cost'?(b.cost||0)-(a.cost||0):(b.time||'').localeCompare(a.time||''));const pages=Math.max(1,Math.ceil(responses.length/responsePageSize));state.responsePage=Math.min(state.responsePage||0,pages-1);const shown=responses.slice(state.responsePage*responsePageSize,(state.responsePage+1)*responsePageSize),contextRatio=raw.contextWindow?raw.contextUsed/raw.contextWindow:0;
  setContent(`${header(raw.title||basename(raw.cwd),`${state.scope==='filtered'?periodLabel():'Gesamte Session'} · ${raw.subagent?'Subagent':'Hauptsession'}`,toolTag(raw.tool))}<div class="detail-body detail-analysis" data-tip-host><div class="detail-scope-row"><div class="segments"><button data-detail-scope="filtered" class="${state.scope==='filtered'?'active':''}" ${!filtered?'disabled':''}>Im gewählten Zeitraum</button><button data-detail-scope="all" class="${state.scope==='all'?'active':''}">Gesamte Session</button></div></div><dl class="detail-meta detail-meta-wide"><div><dt>Session-ID</dt><dd>${esc(raw.sessionId)}</dd></div><div><dt>Repository</dt><dd>${esc(raw.repository)}</dd></div><div><dt>Branch</dt><dd>${esc(raw.branch||'–')}</dd></div><div><dt>Aktivität im Ausschnitt</dt><dd>${date(range.firstActivity)} / ${date(range.lastActivity)}</dd></div><div><dt>Modelle / Service-Tiers</dt><dd>${esc(models.join(', ')||'Nicht protokolliert')} · ${esc(tiers.join(', ')||'Standard')}</dd></div><div><dt>Reasoning / Region</dt><dd>${esc(raw.effort||'Nicht protokolliert')}${geos.length?` · ${esc(geos.join(', '))}`:''}</dd></div><div class="context-meta"><dt>Kontext laut letztem Log</dt><dd>${raw.contextWindow?`${compact(raw.contextUsed)} / ${compact(raw.contextWindow)} Tokens · ${percent(contextRatio)}`:'Nicht verfügbar'}</dd>${raw.contextWindow?`<div class="track" ${tipAttr({title:'Kontextfenster',rows:[['Belegt',compact(raw.contextUsed)],['Frei',compact(Math.max(0,raw.contextWindow-raw.contextUsed))],['Fenster',compact(raw.contextWindow)]],total:['Ausgelastet',percent(contextRatio)],note:'Stand der letzten protokollierten Antwort'})}><i style="width:${Math.min(100,contextRatio*100)}%"></i></div>`:''}</div></dl>${kpis(summary,null,true)}${timeline([session],state.metric)}<div class="detail-breakdown-grid session-breakdowns">${breakdownPanel([session],'model',false)}${breakdownPanel([session],'tier',false)}</div>${tokenBreakdown(summary)}${quality(summary,raw.malformed)}<section class="detail-section"><div class="detail-section-head"><div><h3>Modellantworten</h3><p>Input, Cache, Output und Reasoning je Antwort</p></div><select id="detail-response-sort" aria-label="Antworten sortieren"><option value="activity" ${state.responseSort==='activity'?'selected':''}>Neueste zuerst</option><option value="tokens" ${state.responseSort==='tokens'?'selected':''}>Meiste Tokens</option><option value="cost" ${state.responseSort==='cost'?'selected':''}>Höchste Kosten</option></select></div><div class="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Modell</th><th class="numeric">Input</th><th class="numeric">Cache</th><th class="numeric">Output</th><th class="numeric">Reasoning</th><th class="numeric">Gesamt</th><th class="numeric">API-Kosten</th></tr></thead><tbody>${shown.map(event=>`<tr><td>${date(event.time)}</td><td>${esc(event.model)}<span class="row-subtitle">${esc(event.tier||'standard')}${event.effort?` · ${esc(event.effort)}`:''}</span></td><td class="numeric">${num(event.input)}</td><td class="numeric">${num((event.cache||0)+(event.write||0))}</td><td class="numeric">${num(event.output)}</td><td class="numeric">${num(event.reasoning)}</td><td class="numeric"><strong>${num(tokenCount(event))}</strong></td><td class="numeric">${event.cost===null?'Unbekannt':money(event.cost)}</td></tr>`).join('')||'<tr><td colspan="8">Diese Session enthält keine Nutzungsmetriken im gewählten Zeitraum.</td></tr>'}</tbody></table></div><div class="table-footer"><span>${responses.length?`${state.responsePage*responsePageSize+1}–${Math.min((state.responsePage+1)*responsePageSize,responses.length)} von ${responses.length}`:'0 Antworten'}</span><div class="pagination"><button data-response-page="-1" ${state.responsePage===0?'disabled':''}>‹</button><span>Seite ${state.responsePage+1} / ${pages}</span><button data-response-page="1" ${state.responsePage+1>=pages?'disabled':''}>›</button></div></div></section></div>`);
 }
 function render(){if(state.view==='aggregate')renderAggregate();else if(state.view==='session')renderSession();}
 function open(next,push=false){if(push&&state.view)history.push(copy(state));else if(!dialog.open)history=[];state=next;render();}
 function session(id,push=false){open({view:'session',id,scope:'filtered',metric:'tokens',responseSort:'activity',responsePage:0},push);}
 function aggregate(kind,key){open({view:'aggregate',kind,key,metric:'tokens',dimension:null,search:'',agent:'all',sessionSort:'tokens',sessionPage:0});}
 function close(){dialog.close();history=[];state={view:null};dialog.classList.remove('detail-wide');}
 function handleClick(event){
  const target=event.target;if(target===dialog||target.closest('#close-detail')){event.stopImmediatePropagation();close();return;}
  const back=target.closest('[data-detail-back]');if(back){event.stopImmediatePropagation();state=history.pop();render();return;}
  const sessionButton=target.closest('[data-session]');if(sessionButton&&dialog.open){event.stopImmediatePropagation();session(sessionButton.dataset.session,true);return;}
  const metric=target.closest('[data-detail-metric]');if(metric){state.metric=metric.dataset.detailMetric;render();return;}
  const dimension=target.closest('[data-detail-dimension]');if(dimension){state.dimension={kind:dimension.dataset.detailDimension,key:dimension.dataset.detailValue};state.sessionPage=0;render();return;}
  if(target.closest('[data-detail-clear-dimension]')){state.dimension=null;state.sessionPage=0;render();return;}
  const page=target.closest('[data-detail-page]');if(page){state.sessionPage+=Number(page.dataset.detailPage);render();return;}
  const responsePage=target.closest('[data-response-page]');if(responsePage){state.responsePage+=Number(responsePage.dataset.responsePage);render();return;}
  const scope=target.closest('[data-detail-scope]');if(scope){state.scope=scope.dataset.detailScope;state.responsePage=0;render();return;}
  if(target.closest('[data-apply-group]')){applyFilter(state.kind,state.key);close();}
 }
 function handleChange(event){if(event.target.id==='detail-session-sort'){state.sessionSort=event.target.value;state.sessionPage=0;render();}if(event.target.id==='detail-agent-filter'){state.agent=event.target.value;state.sessionPage=0;render();}if(event.target.id==='detail-response-sort'){state.responseSort=event.target.value;state.responsePage=0;render();}}
 function handleInput(event){if(event.target.id!=='detail-session-search')return;state.search=event.target.value;state.sessionPage=0;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render();const input=content.querySelector('#detail-session-search');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}},120);}
 dialog.addEventListener('click',handleClick);dialog.addEventListener('change',handleChange);dialog.addEventListener('input',handleInput);
 const hideTooltips=attachTooltips(dialog);
 dialog.addEventListener('close',()=>{hideTooltips();history=[];state={view:null};dialog.classList.remove('detail-wide');});
 // Re-render on resize so the chart keeps its roughly 1:1 coordinate width. An open toolbar input
 // keeps its caret: typing beats a redraw that nobody asked for.
 let resizeFrame=0,lastChartWidth=chartSize().width;
 addEventListener('resize',()=>{
  if(!dialog.open||!state.view)return;cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(()=>{
   const width=chartSize().width;if(Math.abs(width-lastChartWidth)<40)return;lastChartWidth=width;
   if(content.contains(document.activeElement)&&document.activeElement.tagName==='INPUT')return;
   hideTooltips();render();
  });
 });
 return {session,aggregate,close,render};
}
