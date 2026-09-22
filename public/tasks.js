import {totals} from './analytics-core.js';
import {sessionLabel,sessionSecondaryId} from './session-label.js';

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

export function taskView({sessions,allSessions=sessions,sort='activity',expandedTasks=new Set(),esc=String,num=String,compact=String,costText=row=>String(row.cost),basename=value=>value,toolTag=value=>value,date=String}) {
 const rows=taskRows(sessions,allSessions),order=list=>list.sort((a,b)=>sort==='cost'?b.total.cost-a.total.cost:sort==='tokens'?b.total.tokens-a.total.tokens:b.lastActivity.localeCompare(a.lastActivity));
 order(rows.roots);order(rows.unassigned);
 const card=(root,unassigned=false)=>{
  const nodes=flattenTaskNode(root),contributing=nodes.filter(({node})=>!node.contextOnly),models=new Map();
  for(const {node} of contributing)for(const event of node.session.events)models.set(event.model,(models.get(event.model)||0)+(event.input||0)+(event.cache||0)+(event.write||0)+(event.output||0));
  const modelRows=[...models].sort((a,b)=>b[1]-a[1]).slice(0,5),agentRows=contributing.sort((a,b)=>b.node.own.tokens-a.node.own.tokens).slice(0,5);
  const rootSecondary=sessionSecondaryId(root.session),rootSubtitle=[rootSecondary,basename(root.session.repository),unassigned?root.reason:root.contextOnly?'Parent außerhalb der Auswahl':''].filter(Boolean).join(' · ');
  return `<details class="task-card" data-task-id="${esc(root.session.id)}" ${expandedTasks.has(root.session.id)?'open':''}><summary><span class="task-caret" aria-hidden="true">›</span><span class="task-title"><strong title="${esc(sessionLabel(root.session))}">${esc(sessionLabel(root.session))}</strong><small>${esc(rootSubtitle)}</small></span><span>${toolTag(root.session.tool)}</span><span class="numeric"><strong>${num(root.contributing)}</strong><small>${root.contributing===1?'Session':'Sessions'}</small></span><span class="numeric"><strong>${compact(root.total.tokens)}</strong><small>Tokens</small></span><span class="numeric"><strong>${costText(root.total)}</strong><small>API-Kosten</small></span><span class="numeric task-activity">${date(root.lastActivity)}</span></summary><div class="task-body"><div class="task-tree" role="tree" aria-label="Aufgabenbaum">${nodes.map(({node,depth})=>{const secondary=sessionSecondaryId(node.session),relation=node.contextOnly?'Orientierung · außerhalb der Auswahl':node.session.relationType==='guardian_review'?'Prüf-Agent':node.session.subagent?'Subagent':'Hauptsession';return `<div class="task-node ${node.contextOnly?'context-only':''}" role="treeitem" aria-level="${depth+1}" style="--task-depth:${depth}"><span class="task-connector" aria-hidden="true"></span><button class="row-button" data-session="${esc(node.session.id)}"><span class="row-title" title="${esc(sessionLabel(node.session))}">${esc(sessionLabel(node.session))}</span><span class="row-subtitle">${esc([secondary,relation].filter(Boolean).join(' · '))}</span></button><span class="numeric"><small>Eigen</small><strong>${node.contextOnly?'–':compact(node.own.tokens)}</strong></span><span class="numeric"><small>Mit Kindern</small><strong>${compact(node.total.tokens)}</strong></span><span class="numeric"><small>Kosten</small><strong>${node.contextOnly?'–':costText(node.own)}</strong></span></div>`;}).join('')}</div><div class="task-distributions"><section><h3>Verteilung auf Agents</h3>${agentRows.map(({node})=>`<button data-session="${esc(node.session.id)}"><span title="${esc(sessionLabel(node.session))}">${esc(sessionLabel(node.session))}</span><strong>${compact(node.own.tokens)}</strong></button>`).join('')||'<p>Keine Nutzungsdaten im Zeitraum.</p>'}</section><section><h3>Verteilung auf Modelle</h3>${modelRows.map(([model,tokens])=>`<div><span>${esc(model)}</span><strong>${compact(tokens)}</strong></div>`).join('')||'<p>Keine Modelle im Zeitraum.</p>'}</section></div></div></details>`;
 };
 const total=rows.roots.length+rows.unassigned.length;
 return `<section class="panel tasks-panel"><div class="panel-head"><div><h2>Aufgaben mit Agents</h2><p>${num(rows.roots.length)} ${rows.roots.length===1?'Aufgabe':'Aufgaben'} · ${num(rows.unassigned.length)} nicht sicher zugeordnet</p></div><div class="table-toolbar"><select id="group" aria-label="Ansicht"><option value="sessions">Einzelne Sessions</option><option value="tasks" selected>Aufgaben</option><option value="repository">Nach Repository</option><option value="tool">Nach KI-Tool</option><option value="model">Nach Modell</option><option value="branch">Nach Branch</option><option value="agent">Hauptsessions / Subagents</option></select><select id="sort" aria-label="Sortierung"><option value="activity" ${sort==='activity'?'selected':''}>Letzte Aktivität</option><option value="tokens" ${sort==='tokens'?'selected':''}>Meiste Tokens</option><option value="cost" ${sort==='cost'?'selected':''}>Höchste Kosten</option></select></div></div>${total?`<div class="task-list">${rows.roots.map(row=>card(row)).join('')}${rows.unassigned.length?`<div class="task-unassigned-heading"><h3>Nicht zugeordnet</h3><p>Beziehung vorhanden, aber Parent fehlt oder ist widersprüchlich.</p></div>${rows.unassigned.map(row=>card(row,true)).join('')}`:''}</div>`:'<div class="comparison-empty">Keine Aufgaben für diese Auswahl.</div>'}</section>`;
}
