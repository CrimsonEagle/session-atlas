import {totals} from './analytics-core.js';
import {sortRows,sortableHeader} from './charts.js';
import {sessionLabel,sessionSecondaryId} from './session-label.js';
import {groupSelect} from './group-select.js';

const childRelations=new Set(['subagent','guardian_review']);
const keyFor=session=>`${session.tool}:${session.sessionId}`;
const activity=session=>session.lastActivity||session.started||'';

export function taskForest(sessions,allSessions=sessions) {
 const scoped=new Map(sessions.map(session=>[session.id,session])),all=new Map(allSessions.map(session=>[keyFor(session),session])),included=new Map();
 const include=session=>{if(!included.has(session.id))included.set(session.id,{session:scoped.get(session.id)||{...session,events:[]},contextOnly:!scoped.has(session.id),children:[],reason:''});return included.get(session.id);};
 for(const session of sessions) {
  let current=session,seen=new Set();
  while(current&&!seen.has(current.id)) {
   seen.add(current.id);include(current);
   if(!childRelations.has(current.relationType)||!current.parentId)break;
   current=all.get(`${current.tool}:${current.parentId}`);
  }
 }
 const cycle=new Set();
 for(const start of included.values()) {
  const path=[],positions=new Map();let current=start;
  while(current&&childRelations.has(current.session.relationType)&&current.session.parentId) {
   if(positions.has(current.session.id)){for(const node of path.slice(positions.get(current.session.id)))cycle.add(node.session.id);break;}
   positions.set(current.session.id,path.length);path.push(current);
   current=included.get(`${current.session.tool}:${current.session.parentId}`);
  }
 }
 const roots=[],unassigned=[];
 for(const node of included.values()) {
  const session=node.session,isChild=childRelations.has(session.relationType)&&session.parentId;
  if(session.relationType==='ambiguous'){node.reason='Widersprüchliche Beziehungsnachweise';unassigned.push(node);continue;}
  if(!isChild){roots.push(node);continue;}
  const parent=included.get(`${session.tool}:${session.parentId}`);
  if(session.parentId===session.sessionId||cycle.has(session.id)){node.reason='Zyklische oder selbstreferenzierende Beziehung';unassigned.push(node);}
  else if(!parent){node.reason='Übergeordnete Session ist lokal nicht verfügbar';unassigned.push(node);}
  else parent.children.push(node);
 }
 const sortNodes=nodes=>nodes.sort((a,b)=>activity(b.session).localeCompare(activity(a.session))).forEach(node=>sortNodes(node.children));
 sortNodes(roots);sortNodes(unassigned);
 return {roots,unassigned};
}

function enrich(node) {
 const children=node.children.map(enrich),own=totals(node.session.events),aggregate=[own,...children.map(child=>child.total)].reduce((sum,row)=>{
  for(const key of ['input','cache','write','output','reasoning','tokens','cost','knownCost','unknown','requests'])sum[key]=(sum[key]||0)+(row[key]||0);
  return sum;
 },{});
 const contributing=(node.contextOnly?0:1)+children.reduce((sum,child)=>sum+child.contributing,0);
 const lastActivity=[activity(node.session),...children.map(child=>child.lastActivity)].sort().at(-1)||'';
 return {...node,children,own,total:aggregate,contributing,lastActivity};
}

export function taskRows(sessions,allSessions=sessions) {
 const forest=taskForest(sessions,allSessions);
 return {roots:forest.roots.map(enrich),unassigned:forest.unassigned.map(enrich)};
}

export function flattenTaskNode(node,depth=0) {
 return [{node,depth},...node.children.flatMap(child=>flattenTaskNode(child,depth+1))];
}

export function taskTreeForSession(session,allSessions) {
 const rows=taskRows(allSessions,allSessions),matches=node=>node.session.id===session.id||node.children.some(matches);
 for(const [nodes,unassigned] of [[rows.roots,false],[rows.unassigned,true]]) {
  const root=nodes.find(matches);
  if(root)return {root,nodes:flattenTaskNode(root),unassigned};
 }
 return null;
}

export function taskView({sessions,allSessions=sessions,taskData=null,sort='activity',sortDirection='desc',expandedTasks=new Set(),page=0,pageSize=12,showToolGroup=true,esc=String,num=String,compact=String,costText=row=>String(row.cost),basename=value=>value,toolTag=value=>value,date=String}) {
 const rows=taskData||taskRows(sessions,allSessions);
 const value=(row,key)=>({name:sessionLabel(row.session),tool:row.session.tool,sessions:row.contributing,tokens:row.total.tokens,cost:row.total.unknown===row.total.requests&&row.total.requests?null:row.total.cost,activity:Date.parse(row.lastActivity||'')||null})[key];
 const ordered=sortRows([...rows.roots,...rows.unassigned],sort,sortDirection,value);
 const pages=Math.max(1,Math.ceil(ordered.length/pageSize)),currentPage=Math.max(0,Math.min(page,pages-1)),shown=ordered.slice(currentPage*pageSize,(currentPage+1)*pageSize);
 const head=(label,key,numeric=false)=>sortableHeader(label,key,{activeKey:sort,direction:sortDirection,context:'main',numeric});
 const chevron='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 const breakdown=root=>{
  const nodes=flattenTaskNode(root),contributing=nodes.filter(({node})=>!node.contextOnly),models=new Map();
  for(const {node} of contributing)for(const event of node.session.events)models.set(event.model,(models.get(event.model)||0)+(event.input||0)+(event.cache||0)+(event.write||0)+(event.output||0));
  const modelRows=[...models].sort((a,b)=>b[1]-a[1]).slice(0,5),agentRows=contributing.sort((a,b)=>b.node.own.tokens-a.node.own.tokens).slice(0,5);
  const ownRows=nodes.map(({node,depth})=>{
   const session=node.session,secondary=sessionSecondaryId(session),relation=node.contextOnly?'Orientierung · außerhalb der Auswahl':session.relationType==='guardian_review'?'Prüf-Agent':session.subagent?'Subagent':'Hauptsession';
   return `<tr class="session-tree-row task-breakdown-row ${node.contextOnly?'context-only':''}" style="--session-depth:${depth+1}"><td><div class="session-cell"><span class="session-tree-connector" aria-hidden="true"></span><span class="session-fold-spacer" aria-hidden="true"></span><span class="session-symbol" aria-hidden="true">▤</span><button class="row-button" data-session="${esc(session.id)}"><span class="row-title" title="${esc(sessionLabel(session))}">${esc(sessionLabel(session))}</span><span class="row-subtitle">${esc([secondary,relation,'Eigen'].filter(Boolean).join(' · '))}</span></button></div></td><td>${toolTag(session.tool)}</td><td class="numeric">${node.contextOnly?'–':'1'}</td><td class="numeric"><strong>${node.contextOnly?'–':compact(node.own.tokens)}</strong>${node.children.length?`<span class="row-subtitle">Mit Kindern: ${compact(node.total.tokens)}</span>`:''}</td><td class="numeric">${node.contextOnly?'–':costText(node.own)}</td><td class="numeric muted">${date(session.lastActivity)}</td></tr>`;
  }).join('');
  const distributions=`<tr class="task-distribution-row"><td colspan="6"><div class="task-distributions"><section><h3>Verteilung auf Agents</h3>${agentRows.map(({node})=>`<button data-session="${esc(node.session.id)}"><span title="${esc(sessionLabel(node.session))}">${esc(sessionLabel(node.session))}</span><strong>${compact(node.own.tokens)}</strong></button>`).join('')||'<p>Keine Nutzungsdaten im Zeitraum.</p>'}</section><section><h3>Verteilung auf Modelle</h3>${modelRows.map(([model,tokens])=>`<div><span>${esc(model)}</span><strong>${compact(tokens)}</strong></div>`).join('')||'<p>Keine Modelle im Zeitraum.</p>'}</section></div></td></tr>`;
  return ownRows+distributions;
 };
 const taskRow=root=>{
  const session=root.session,open=expandedTasks.has(session.id),hasChildren=root.children.length>0,secondary=sessionSecondaryId(session);
  const subtitle=[secondary,basename(session.repository),root.reason||(root.contextOnly?'Parent außerhalb der Auswahl':'')].filter(Boolean).join(' · ');
  const childCount=root.contributing-(root.contextOnly?0:1),childLabel=childCount===1?'Sub-Session':'Sub-Sessions';
  const fold=`<button type="button" class="session-fold" data-task-fold="${esc(session.id)}" aria-expanded="${open}" aria-label="${esc(sessionLabel(session))}: ${open?'Zuklappen':'Aufklappen'}${hasChildren?` (${num(childCount)} ${childLabel})`:''}" title="${open?'Zuklappen':'Aufklappen'}">${chevron}</button>`;
  const badge=hasChildren?`<span class="session-child-count">${num(childCount)} ${childLabel} · Summe</span>`:'';
  const summary=`<tr class="session-tree-row task-summary-row ${open?'is-expanded':'is-collapsed'}" data-task-id="${esc(session.id)}" style="--session-depth:0"><td><div class="session-cell">${fold}<span class="session-symbol" aria-hidden="true">▤</span><button class="row-button" data-session="${esc(session.id)}"><span class="row-title" title="${esc(sessionLabel(session))}">${esc(sessionLabel(session))}</span><span class="row-subtitle">${esc(subtitle)}</span>${badge}</button></div></td><td>${toolTag(session.tool)}</td><td class="numeric"><strong>${num(root.contributing)}</strong><span class="row-subtitle">${root.contributing===1?'Session':'Sessions'}</span></td><td class="numeric"><strong>${compact(root.total.tokens)}</strong><span class="row-subtitle">Summe</span></td><td class="numeric">${costText(root.total)}</td><td class="numeric muted">${date(root.lastActivity)}</td></tr>`;
  return summary+(open?breakdown(root):'');
 };
 const total=ordered.length;
 return `<section class="panel data-table-panel tasks-panel"><div class="panel-head"><div><h2>Aufgaben mit Agents</h2><p>${num(rows.roots.length)} ${rows.roots.length===1?'Aufgabe':'Aufgaben'} · ${num(rows.unassigned.length)} nicht sicher zugeordnet</p></div><div class="table-toolbar">${groupSelect('tasks',showToolGroup)}</div></div>${total?`<div class="table-wrap"><table class="task-table"><thead><tr>${head('Aufgabe','name')}${head('KI-Tool','tool')}${head('Sessions','sessions',true)}${head('Tokens','tokens',true)}${head('API-Kosten','cost',true)}${head('Letzte Aktivität','activity',true)}</tr></thead><tbody>${shown.map(taskRow).join('')}</tbody></table></div><div class="table-footer"><span>${currentPage*pageSize+1}–${Math.min((currentPage+1)*pageSize,total)} von ${total} ${total===1?'Aufgabe':'Aufgaben'}</span><div class="pagination"><button data-page="-1" ${currentPage===0?'disabled':''} aria-label="Vorherige Seite">‹</button><span>Seite ${currentPage+1} / ${pages}</span><button data-page="1" ${currentPage+1>=pages?'disabled':''} aria-label="Nächste Seite">›</button></div></div>`:'<div class="comparison-empty">Keine Aufgaben für diese Auswahl.</div>'}</section>`;
}
