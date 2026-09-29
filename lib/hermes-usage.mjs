const fields=['input','cache','write','output','reasoning','calls'];
const tokens=fields.filter(field=>field!=='calls');
const eventField=field=>field==='calls'?'requestCount':field;
const sums=usages=>Object.fromEntries(fields.map(field=>[field,usages.reduce((sum,item)=>sum+(item.counters[field]||0),0)]));

// Attribution can move between model buckets without any new account usage.
// Reduce the old bucket before adding the new one. Keep previous counter epochs
// intact when the session counters really reset.
function trim(events,key,epoch,target) {
 const rows=Object.values(events).filter(event=>event.usageKey===key&&(event.usageEpoch||0)===epoch);
 const excess=Object.fromEntries(fields.map(field=>[field,Math.max(0,rows.reduce((sum,event)=>sum+(event[eventField(field)]||0),0)-(target?.counters[field]||0))]));
 let cost=target?.reportedCost===null?0:Math.max(0,rows.reduce((sum,event)=>sum+(event.reportedCost||0),0)-(target?.reportedCost||0)),changed=false;
 for(const original of rows.reverse()) {
  const event={...original};let reduced=false;
  for(const field of fields) {
   const name=eventField(field),amount=Math.min(event[name]||0,excess[field]);
   if(amount){event[name]-=amount;excess[field]-=amount;reduced=true;}
  }
  if(cost>0&&Number.isFinite(event.reportedCost)){const amount=Math.min(event.reportedCost,cost);event.reportedCost-=amount;cost-=amount;reduced||=amount>0;}
  if(!reduced)continue;
  changed=true;
  if(!fields.some(field=>event[eventField(field)]>0)&&!(event.reportedCost>0))delete events[event.id];
  else events[event.id]=event;
 }
 return changed;
}

export function reconcileHermesUsage(usages,old={},sessionId) {
 const events={...(old.events||{})},lastUsages={...(old.lastUsages||{})};
 let ordinal=old.ordinal||0,changed=false;
 const previousTotals=sums(Object.values(lastUsages)),currentTotals=sums(usages);
 const sessionReset=tokens.some(field=>currentTotals[field]<previousTotals[field]);
 const current=new Map(usages.map(item=>[item.key,item]));
 for(const [key,prior] of Object.entries(lastUsages)) {
  const item=current.get(key);
  if(!item&&prior.retired)continue;
  if(!sessionReset&&(!item||fields.some(field=>item.counters[field]<(prior.counters[field]||0))))changed=trim(events,key,prior.epoch||0,item)||changed;
  // Keep the next epoch for a model that may return later. Its old history must
  // never be mistaken for the cumulative counters of the new attribution.
  if(!item)lastUsages[key]={counters:Object.fromEntries(fields.map(field=>[field,0])),reportedCost:null,epoch:(prior.epoch||0)+1,retired:true};
 }
 for(const original of Object.values(events))if(!original.aggregateUsage){events[original.id]={...original,aggregateUsage:true};changed=true;}
 for(const item of usages) {
  const prior=lastUsages[item.key],before=prior?.counters||{};
  const reset=sessionReset&&tokens.some(field=>item.counters[field]<(before[field]||0));
  const epoch=(prior?.epoch||0)+(reset?1:0);
  const delta=Object.fromEntries(fields.map(field=>[field,Math.max(0,item.counters[field]-(reset?0:(before[field]||0)))]));
  const oldCost=prior?.reportedCost;
  if(item.reportedCost===null&&oldCost===0)for(const original of Object.values(events))if(original.usageKey===item.key&&original.reportedCost===0){const repaired={...original};delete repaired.reportedCost;events[original.id]=repaired;changed=true;}
  if(item.reportedCost!==null&&(oldCost===null||oldCost===undefined))for(const original of Object.values(events))if(original.usageKey===item.key&&(original.usageEpoch||0)===epoch&&!Number.isFinite(original.reportedCost)){events[original.id]={...original,reportedCost:0};changed=true;}
  if(!reset&&item.reportedCost!==null&&oldCost!==null&&oldCost!==undefined&&item.reportedCost<oldCost)changed=trim(events,item.key,epoch,item)||changed;
  const reportedCost=item.reportedCost===null?null:Math.max(0,item.reportedCost-(reset||oldCost===null||oldCost===undefined?0:oldCost));
  if(Object.values(delta).some(Boolean)||(reportedCost!==null&&reportedCost>0)) {
   ordinal++;
   const event={id:`hermes:${sessionId}:${item.key}:${ordinal}`,usageKey:item.key,usageEpoch:epoch,time:item.time,model:item.model,priceModel:item.priceModel,task:item.task,provider:item.provider,tier:'standard',effort:'',geo:'',aggregateUsage:true,input:delta.input,cache:delta.cache,write:delta.write,writeHour:0,output:delta.output,reasoning:delta.reasoning,requestCount:item.callsKnown===false?(delta.calls||(tokens.some(field=>delta[field]>0)?1:0)):delta.calls};
   if(reportedCost!==null)event.reportedCost=reportedCost;
   events[event.id]=event;changed=true;
  }
  lastUsages[item.key]={counters:item.counters,reportedCost:item.reportedCost,epoch};
 }
 return {events,lastUsages,ordinal,changed};
}
