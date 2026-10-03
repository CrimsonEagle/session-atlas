// Derived projection only: raw per-segment cache counters and event IDs stay untouched.
export function hermesConversations(states) {
 const byId=new Map(states.map(state=>[state.id,state])),owners=new Map();
 const owner=id=>{
  if(owners.has(id))return owners.get(id);
  let current=byId.get(id);const seen=new Set();
  while(current?.relationType==='compression'&&byId.has(current.parentId)){
   if(seen.has(current.id)){owners.set(id,id);return id;}
   seen.add(current.id);current=byId.get(current.parentId);
  }
  const result=current?.id||id;owners.set(id,result);return result;
 };
 const groups=new Map();
 for(const state of states){const id=owner(state.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(state);}
 return [...groups].map(([id,segments])=>{
  segments.sort((a,b)=>(a.started||'').localeCompare(b.started||'')||a.id.localeCompare(b.id));
  const root=byId.get(id),tip=segments.at(-1),named=segments.findLast(state=>state.name||state.title)||root,workspace=segments.findLast(state=>state.cwd)||root;
  const isWorker=root.relationType==='subagent',isFork=root.relationType==='fork';
  const parentId=isWorker&&root.parentId?owner(root.parentId):'';
  const relationType=isWorker?'subagent':isFork?'fork':root.relationType==='related'?'related':'';
  const events=Object.fromEntries(segments.flatMap(state=>Object.values(state.events||{})).map(event=>[event.id,event]));
  return {...root,id,name:named.name,title:named.title,nameSource:named.nameSource,namePriority:named.namePriority,cwd:workspace.cwd,repository:workspace.repository,branch:workspace.branch,model:tip.model,origin:tip.origin,
   started:segments.map(state=>state.started).filter(Boolean).sort()[0],lastActivity:segments.map(state=>state.lastActivity).filter(Boolean).sort().at(-1),
   events,segmentIds:segments.map(state=>state.id),parentId,subagent:isWorker,relationType,forkedFromId:isFork&&root.parentId?owner(root.parentId):'',relationEvidence:relationType?root.relationEvidence:'',
  };
 });
}
