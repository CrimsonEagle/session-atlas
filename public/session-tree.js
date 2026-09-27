import {taskRows} from './tasks.js';
import {sortRows} from './charts.js';
import {sessionLabel} from './session-label.js';

// Sort siblings by their inclusive values, independent of which branches are open.
export function sessionTreeRows(sessions,allSessions,expanded=new Set(),sort='activity',direction='desc') {
 const forest=taskRows(sessions,allSessions);
 const value=(node,key)=>{
  const session=node.session,shown=node.total;
  if(key==='name')return sessionLabel(session);
  if(key==='tool')return session.tool;
  if(key==='context')return `${String(session.repository||'').split(/[\\/]/).filter(Boolean).at(-1)||''} ${session.branch||''} ${session.events.map(event=>event.model).join(' ')}`;
  if(key==='tokens')return shown.requests?shown.tokens:null;
  if(key==='cost')return shown.requests&&shown.unknown!==shown.requests?shown.cost:null;
  return Date.parse(node.lastActivity||'')||null;
 };
 const order=nodes=>sortRows(nodes,sort,direction,value).map(node=>({...node,children:order(node.children)}));
 const roots=order([...forest.roots,...forest.unassigned]);
 const visible=[];
 const visit=(node,depth)=>{
  const hasChildren=node.children.length>0,isCollapsed=hasChildren&&!expanded.has(node.session.id);
  visible.push({...node.session,...node.own,treeDepth:depth,contextOnly:node.contextOnly,
   hasChildren,collapsed:isCollapsed,descendantCount:node.contributing-(node.contextOnly?0:1),
   displayTotals:node.total,ownTotals:node.own,displayActivity:node.lastActivity});
  if(!isCollapsed)for(const child of node.children)visit(child,depth+1);
 };
 for(const node of roots)visit(node,0);
 return visible;
}
