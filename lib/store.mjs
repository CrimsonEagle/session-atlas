import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parserVersionFor,newState,ingest} from './parser.mjs';
import {readLimits,readLimitInbox,removeLimitInboxEntries,bridgeCandidates} from './claude-limits.mjs';
import {costForRates,effectiveRates,priceDate,PRICING_RULE_VERSION} from './pricing.mjs';
import {updateLimitHistory} from './limit-history.mjs';
import {readCodexSessionNames} from './session-names.mjs';
import {readHermesLocal,validateHermesRoots} from './hermes-local.mjs';
import {reconcileHermesUsage} from './hermes-usage.mjs';
import {hermesConversations} from './hermes-conversations.mjs';
import {readHermesLimits,readHermesLimitInbox,removeHermesLimitInbox} from './hermes-limits.mjs';
import {COWORK_AUDIT_TOOL,discoverCowork,readCoworkMetadata} from './cowork.mjs';

// Bound file descriptors and in-flight buffers while letting filesystem requests overlap.
// Results retain discovery order so duplicate-session precedence stays deterministic.
async function mapLimit(items,limit,visit) {
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(next<items.length) {const index=next++;results[index]=await visit(items[index]);}
 }));
 return results;
}
const UNKNOWN_REPOSITORY='Unbekannter Ordner',COWORK_REPOSITORY='Claude Cowork';
const inside=(roots,file)=>(roots||[]).some(root=>{const rel=path.relative(root,file);return !rel.startsWith('..')&&!path.isAbsolute(rel);});
// Claude transcripts come from Claude Code and Claude Desktop Cowork folders alike.
const rootsFor=(tool,settings)=>tool==='codex'?settings.codexRoots:tool===COWORK_AUDIT_TOOL?settings.coworkRoots||[]:[...settings.claudeRoots,...(settings.coworkRoots||[])];
const hasKeys=object=>{for(const key in object)return true;return false;};
// Codex response records replace the cumulative token_count deltas entirely, and every limit
// observation is already merged into the limit history; persisting either again only inflates
// the cache that each refresh with new log data rewrites.
function compactState(state) {
 delete state.limitObservations;
 if(state.tool==='codex'&&hasKeys(state.records)&&hasKeys(state.events))state.events={};
 return state;
}
function unchanged(cached,st,tool) {
 return cached?.parserVersion===parserVersionFor(tool)&&cached.prefixHash&&cached.tool===tool&&cached.size===st.size&&cached.mtime===st.mtimeMs
  &&(cached.ctime===undefined||cached.ctime===st.ctimeMs)
  &&(cached.ino===undefined||cached.ino===st.ino)&&(cached.dev===undefined||cached.dev===st.dev);
}

async function discover(root,warnings) {
 const result=[];
 async function walk(dir) {try {for(const e of await fs.readdir(dir,{withFileTypes:true})) {
  if(e.isSymbolicLink()) continue;
  const p=path.join(dir,e.name); if(e.isDirectory()) await walk(p);else if(e.name.endsWith('.jsonl')) result.push(p);
 }}catch(e){if(e.code!=='ENOENT') warnings.push(`${dir}: ${e.code}`);}}
 await walk(root);return result;
}
export class Store {
 constructor(cacheFile,priceHistory=null,{hermesReader=readHermesLocal,persistIntervalMs=0}={}) {this.cacheFile=cacheFile;this.priceHistory=priceHistory;this.hermesReader=hermesReader;this.persistIntervalMs=persistIntervalMs;this.lastPersist=0;this.files={};this.hermesSources={};this.limitHistory=[];this.limitHistoryIds=new Set();this.limitHistoryNextPrune=0;this.limitRetentionDays=null;this.limitNotified={};this.limitAlerts=[];this.cacheVersion=null;this.cacheNeedsBackup=false;this.cacheDirty=false;this.repos=new Map();this.repoPending=new Map();this.codexNamesCache=new Map();this.claudeLimits=null;this.hermesLimits=null;this.dataRevision=0;this.scanCount=0;this.lastScan=null;this.claudeEventFiles=new Map();this.claudeDuplicates=new Set();this.coworkMetadataCache=new Map();}
 async load() {try {const x=JSON.parse(await fs.readFile(this.cacheFile,'utf8'));if([2,3,4,5,6,7].includes(x.version)){this.files=x.files||{};for(const state of Object.values(this.files))compactState(state);this.hermesSources=x.hermesSources||{};this.limitHistory=Array.isArray(x.limitHistory)?x.limitHistory:[];this.limitHistoryIds=new Set(this.limitHistory.map(point=>point.id));this.limitNotified=x.limitNotified&&typeof x.limitNotified==='object'?x.limitNotified:{};this.cacheVersion=x.version;this.cacheNeedsBackup=x.version<7;}}catch{}
  this.claudeEventFiles=new Map();this.claudeDuplicates=new Set();for(const state of Object.values(this.files))this.reindexClaudeFile(null,state);
 }
 // Claude response IDs are globally unique, but a forked or copied transcript can repeat earlier
 // responses in another session file. The index tracks which files hold each response and is
 // updated per changed file, so refreshes never have to walk every Claude event.
 indexClaudeEvent(id,file,add) {
  let files=this.claudeEventFiles.get(id);
  if(add){if(!files)this.claudeEventFiles.set(id,files=new Set());files.add(file);if(files.size>1)this.claudeDuplicates.add(id);}
  else if(files){files.delete(file);if(files.size<2)this.claudeDuplicates.delete(id);if(!files.size)this.claudeEventFiles.delete(id);}
 }
 // An append keeps every earlier response key, so only keys that appeared or vanished are touched.
 reindexClaudeFile(previous,next) {
  const before=previous?.tool==='claude'?previous.events:{},after=next?.tool==='claude'?next.events:{},file=(next||previous).file;
  for(const key in before)if(!(key in after))this.indexClaudeEvent(before[key].id,file,false);
  for(const key in after)if(!(key in before))this.indexClaudeEvent(after[key].id,file,true);
 }
 // The earliest session keeps a repeated response; later copies are context, not new usage.
 claudeDuplicateOwners(included) {
  const owners=new Map();
  for(const id of this.claudeDuplicates) {
   let owner=null;
   for(const file of this.claudeEventFiles.get(id)||[]) {
    const state=included.has(file)?this.files[file]:null;if(!state)continue;
    // Copies usually keep the original timestamps; file creation time then identifies the original.
    const key=`claude:${state.id}`,started=state.started||'9999',created=state.created||Infinity;
    if(!owner||started<owner.started||(started===owner.started&&(created<owner.created||(created===owner.created&&key<owner.key))))owner={key,started,created};
   }
   if(owner)owners.set(id,owner.key);
  }
  return owners;
 }
 async repository(cwd) {
  if(!cwd)return UNKNOWN_REPOSITORY;if(this.repos.has(cwd))return this.repos.get(cwd);
  if(this.repoPending.has(cwd))return this.repoPending.get(cwd);
  const pending=this.resolveRepository(cwd).finally(()=>this.repoPending.delete(cwd));
  this.repoPending.set(cwd,pending);return pending;
 }
 async resolveRepository(cwd) {
  let dir=cwd,result=cwd;
  for(let i=0;i<30;i++) {try {
   const git=path.join(dir,'.git'), st=await fs.stat(git);result=dir;
   if(st.isFile()) {const text=await fs.readFile(git,'utf8');const gd=path.resolve(dir,text.replace(/^gitdir:\s*/,'').trim());try {const common=path.resolve(gd,(await fs.readFile(path.join(gd,'commondir'),'utf8')).trim());if(path.basename(common)==='.git')result=path.dirname(common);}catch{}}
   break;
  }catch{}const up=path.dirname(dir);if(up===dir)break;dir=up;}
  try {result=await fs.realpath(result);}catch{}
  this.repos.set(cwd,result);return result;
 }
 async scan(settings,options={}) {
  if(this.pending)return this.pending;
  this.pending=this.performScan(settings,options).finally(()=>{this.pending=null;});return this.pending;
 }
 takeLimitAlerts(){const alerts=this.limitAlerts;this.limitAlerts=[];return alerts;}
 async persist(){await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});await fs.writeFile(this.cacheFile+'.tmp',JSON.stringify({version:7,files:this.files,hermesSources:this.hermesSources,limitHistory:this.limitHistory,limitNotified:this.limitNotified}));await fs.rename(this.cacheFile+'.tmp',this.cacheFile);this.cacheVersion=7;this.cacheNeedsBackup=false;this.cacheDirty=false;this.lastPersist=Date.now();}
 // Writes parse progress that was held back by the persistence interval, e.g. before shutdown.
 async flush(){if(this.pending)await this.pending.catch(()=>{});if(this.cacheDirty)await this.persist();}
 async scanHermes(roots,warnings) {
  let result;try{result=await this.hermesReader(roots);}catch(error){warnings.push(`Hermes: ${error.message}`);return 0;}
  const rows=Array.isArray(result)?result:result.rows;
  for(const warning of result.warnings||[])warnings.push(warning);
  if(!Array.isArray(rows)){warnings.push('Hermes: Ungültige Session-Liste.');return 0;}
  const byRoot=new Map(roots.map(root=>[root,[]]));
  for(const row of rows)if(byRoot.has(row.root))byRoot.get(row.root).push(row);
  let changed=0;
  for(const [root,sourceRows] of byRoot){
   const previous=this.hermesSources[root]?.sessions||{},sessions={...previous};
   for(const row of sourceRows){
    const old=previous[row.id],usage=reconcileHermesUsage(row.usages,old,row.id);
    const {events,lastUsages,ordinal}=usage,eventUpdated=usage.changed;
    const relationType=row.relationType??(row.parentId?(row.source==='subagent'?'subagent':'related'):'');
    const state={tool:'hermes',file:row.dbFile,id:row.id,cwd:row.cwd,name:row.name,nameSource:row.name?'hermes.sessions.title':'',namePriority:row.name?3:0,title:row.name,branch:row.branch,model:row.model,started:row.started,lastActivity:row.lastActivity,events,records:{},contextSamples:{},contextMarkers:{},limits:{},malformed:0,contextWindow:null,contextUsed:null,subagent:relationType==='subagent',parentId:row.parentId,relationType,relationEvidence:row.relationEvidence||(row.parentId?'hermes.sessions.parent_session_id':''),forkedFromId:'',origin:row.source,repository:row.cwd?await this.repository(row.cwd):UNKNOWN_REPOSITORY,lastUsages,ordinal};
    if(!old||eventUpdated||JSON.stringify({...old,events:undefined})!==JSON.stringify({...state,events:undefined})||Object.keys(events).length!==Object.keys(old.events||{}).length)changed++;
    sessions[row.id]=state;
   }
   this.hermesSources[root]={sessions,lastRead:new Date().toISOString()};
  }
  return changed;
 }
 async performScan(settings,options={}) {
  const begun=Date.now(), warnings=[];let changed=0,metadataChanges=0,bytes=0;
  const roots=[...settings.claudeRoots.map(root=>({tool:'claude',root})),...settings.codexRoots.map(root=>({tool:'codex',root})),...(settings.coworkRoots||[]).map(root=>({tool:'cowork',root}))],coworkMetadata=[];
  const discovered=await mapLimit(roots,4,async({tool,root})=>{
   if(tool!=='cowork')return (await discover(root,warnings)).map(file=>({tool,file}));
   const found=await discoverCowork(root,warnings);coworkMetadata.push(...found.metadata);
   return [...found.transcripts.map(file=>({tool:'claude',file})),...found.audits.map(file=>({tool:COWORK_AUDIT_TOOL,file}))];
  });
  const seen=new Set(),files=discovered.flat().filter(({file})=>{
   // Preserve case: Windows/WSL sources can contain distinct case-sensitive paths.
   const key=path.resolve(file);
   if(seen.has(key))return false;seen.add(key);return true;
  });
  const results=await mapLimit(files,4,async({tool,file})=>{
    let handle;
    try {
     const cached=this.files[file];
     // Most refreshes only need stat: opening and closing every unchanged log triples I/O.
     if(cached&&unchanged(cached,await fs.stat(file),tool))return;
     handle=await fs.open(file,'r');const st=await handle.stat();
     // Use this handle for both verification and parsing, including after a path replacement.
     let prefix=createHash('sha256'),restart=!cached||cached.parserVersion!==parserVersionFor(tool)||cached.tool!==tool||!cached.prefixHash||st.size<cached.offset||(cached.size===st.size&&cached.mtime!==st.mtimeMs);
     if(!restart) {
      if(cached.offset)for await (const chunk of handle.createReadStream({start:0,end:cached.offset-1,autoClose:false,highWaterMark:512*1024})) {bytes+=chunk.length;prefix.update(chunk);}
      if(prefix.copy().digest('hex')!==cached.prefixHash)restart=true;
     }
     if(restart)prefix=createHash('sha256');
     // ingest replaces map entries; copying their containers isolates failures without
     // deep-cloning every historical event, even when only one new response was appended.
     const s=restart?newState(tool,file):{...cached,events:{...cached.events},records:{...cached.records},contextSamples:{...cached.contextSamples},contextMarkers:{...cached.contextMarkers},limits:{...cached.limits}},newLimits=[];
     let pending=Buffer.alloc(0),consumed=s.offset;
     // Limit the stream to the size observed above; an append is picked up next scan.
     if(st.size>s.offset) for await (const chunk of handle.createReadStream({start:s.offset,end:st.size-1,autoClose:false,highWaterMark:512*1024})) {
      bytes+=chunk.length;pending=pending.length?Buffer.concat([pending,chunk]):chunk;let at=0,index;
      while((index=pending.indexOf(10,at))!==-1) {const end=index+1,line=pending.subarray(at,index).toString('utf8');consumed+=end-at;at=end;
       // Audit lines carry whole conversations; only limit events are worth parsing.
       if(line.trim()&&(tool!==COWORK_AUDIT_TOOL||line.includes('rate_limit_event')))try {ingest(s,JSON.parse(line),newLimits);}catch{s.malformed++;}
      }
      if(at)prefix.update(pending.subarray(0,at));
      pending=pending.subarray(at);
      if(pending.length>32*1024*1024)throw Error('Eine Logzeile überschreitet 32 MB');
     }
     // Accept valid final JSON even without a newline; incomplete JSON stays unread.
     if(pending.length) {let final;try {final=JSON.parse(pending.toString('utf8'));}catch{}
      if(final) {try {ingest(s,final,newLimits);}catch{s.malformed++;}consumed+=pending.length;prefix.update(pending);}
     }
     compactState(s);s.offset=consumed;s.size=st.size;if(st.birthtimeMs>0)s.created=st.birthtimeMs;s.mtime=st.mtimeMs;s.ctime=st.ctimeMs;s.ino=st.ino;s.dev=st.dev;s.prefixHash=prefix.digest('hex');
     if(/^[a-z]:[\\/]|^\\\\/i.test(s.cwd))s.cwd=path.win32.normalize(s.cwd);
     // Cowork transcripts keep their shared group; their VM working directories are not host paths.
     s.repository=s.origin==='cowork'?COWORK_REPOSITORY:await this.repository(s.cwd);
     return {state:s,newLimits};
    }catch(e){warnings.push(`${file}: ${e.code||e.message}`);}finally{try{await handle?.close();}catch(e){warnings.push(`${file}: ${e.code||e.message}`);}}
  });
  const newLimitSources=[];
  for(const result of results)if(result){
   this.reindexClaudeFile(this.files[result.state.file],result.state);this.files[result.state.file]=result.state;newLimitSources.push(...result.newLimits);changed++;
  }
  const codexNames=await readCodexSessionNames(settings.codexRoots,warnings,this.codexNamesCache);
  if(codexNames.databaseCount)for(const state of Object.values(this.files))if(state.tool==='codex') {
   const metadata=codexNames.names.get(state.id);if(!metadata)continue;
   if(state.name!==metadata.name||state.nameSource!==metadata.source||state.namePriority!==metadata.priority) {state.name=metadata.name;state.title=metadata.name;state.nameSource=metadata.source;state.namePriority=metadata.priority;metadataChanges++;}
  }
  if(settings.coworkRoots?.length) {
   const titles=await readCoworkMetadata(coworkMetadata,warnings,this.coworkMetadataCache);
   for(const state of Object.values(this.files))if(state.tool==='claude'&&inside(settings.coworkRoots,state.file)) {
    const title=state.subagent?'':titles.get(state.id)||'',named=title&&(state.namePriority||0)<=3&&(state.name!==title||state.nameSource!=='cowork.metadata.title');
    if(named){state.name=title;state.title=title;state.nameSource='cowork.metadata.title';state.namePriority=3;}
    if(named||state.origin!=='cowork'||state.repository!==COWORK_REPOSITORY){state.origin='cowork';state.repository=COWORK_REPOSITORY;metadataChanges++;}
   }
  }
  const hermesRoots=validateHermesRoots(settings.hermesRoots||[]);
  if(hermesRoots.length)metadataChanges+=await this.scanHermes(hermesRoots,warnings);
  if(changed||metadataChanges)this.dataRevision++;
  this.claudeLimits=await readLimits(settings.claudeRoots,warnings);
  const claudeInbox=await readLimitInbox(settings.claudeRoots,warnings);
  this.hermesLimits=await readHermesLimits(hermesRoots,warnings);
  const hermesInbox=await readHermesLimitInbox(hermesRoots,warnings);
  const now=Date.now(),retentionChanged=this.limitRetentionDays!==settings.limitRetentionDays,prune=retentionChanged||now>=this.limitHistoryNextPrune;
  const history=updateLimitHistory([...newLimitSources,...claudeInbox.map(entry=>entry.limit),this.claudeLimits,...hermesInbox.map(entry=>entry.limit),this.hermesLimits],this.limitHistory,this.limitNotified,{now,retentionDays:settings.limitRetentionDays,thresholds:settings.limitThresholds,knownIds:this.limitHistoryIds,prune});
  this.limitHistory=history.history;this.limitNotified=history.notified;this.limitAlerts=history.alerts;
  if(prune){this.limitHistoryIds=new Set(this.limitHistory.map(point=>point.id));this.limitHistoryNextPrune=now+60*60*1000;}else for(const point of history.added)this.limitHistoryIds.add(point.id);
  this.limitRetentionDays=settings.limitRetentionDays;
  this.scanCount++;this.lastScan=new Date().toISOString();
  this.stats={durationMs:Date.now()-begun,changed,metadataChanges,bytes,files:Object.keys(this.files).length+hermesRoots.reduce((sum,root)=>sum+Object.keys(this.hermesSources[root]?.sessions||{}).length,0),scanCount:this.scanCount,warnings};
  if(changed||metadataChanges||history.changed)this.cacheDirty=true;
  // Log files remain the source of truth: parse progress that is lost before the next write is
  // simply read again. Rewriting the whole cache for every appended response is therefore
  // deferred, while limit history, notifications and metadata without a log source persist now.
  const urgent=history.changed||metadataChanges>0||this.cacheNeedsBackup||now-this.lastPersist>=this.persistIntervalMs;
  if(this.cacheDirty&&urgent) {try {
   await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});
   if(this.cacheNeedsBackup) {try {await fs.copyFile(this.cacheFile,`${this.cacheFile}.v${this.cacheVersion}.backup`,fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}}
   await this.persist();
  }catch(e){warnings.push(`Cache konnte nicht gespeichert werden: ${e.code}`);}}
  if(!this.cacheDirty){if(claudeInbox.length)await removeLimitInboxEntries(claudeInbox,warnings);if(hermesInbox.length)await removeHermesLimitInbox(hermesInbox,warnings);}
  return this.snapshot(settings,options);
 }
 snapshot(settings,options={}) {
  const compact=options.compact===true,includeLimitHistory=!compact&&options.includeLimitHistory!==false,includeContextTimeline=!compact&&options.includeContextTimeline!==false,includePricingEvidence=!compact&&options.includePricingEvidence!==false;
  const groupedStates=new Map(),limits={};
  // Active paths win over retained archived duplicates.
  const files=Object.values(this.files).filter(s=>inside(rootsFor(s.tool,settings),s.file));
  files.sort((a,b)=>Number(a.file.includes('archived_sessions'))-Number(b.file.includes('archived_sessions')));
  const hermesRoots=validateHermesRoots(settings.hermesRoots||[]);
  const claudeOwners=this.claudeDuplicates.size?this.claudeDuplicateOwners(new Set(files.filter(state=>state.tool==='claude').map(state=>state.file))):null;
  for(const root of hermesRoots)files.push(...hermesConversations(Object.values(this.hermesSources[root]?.sessions||{})));
  const requested=options.sessionId,alias=requested&&files.find(s=>s.tool==='hermes'&&s.segmentIds?.some(id=>`hermes:${id}`===requested)),requestedId=alias?`hermes:${alias.id}`:requested;
  for(const s of files) {
   if(s.tool===COWORK_AUDIT_TOOL){if(s.limits.claude&&(!limits.claude||limits.claude.observedAt<s.limits.claude.observedAt))limits.claude=s.limits.claude;continue;}
   const id=`${s.tool}:${s.id}`;
   if(requestedId&&id!==requestedId)continue;
   if(!groupedStates.has(id))groupedStates.set(id,[]);groupedStates.get(id).push(s);
   for(const [key,value] of Object.entries(s.limits))if(!limits[key]||limits[key].observedAt<value.observedAt)limits[key]=value;
  }
  const sessions=[],currentRates=effectiveRates(settings.prices);
  for(const [id,states] of groupedStates) {
  const first=states[0],identity=states.reduce((best,state)=>(state.namePriority||0)>(best.namePriority||0)?state:best,first),name=identity.name||identity.title||'',session={id,tool:first.tool,sessionId:first.id,name,nameSource:identity.nameSource||'',title:name,cwd:first.cwd,repository:first.repository||first.cwd,branch:first.branch,subagent:first.subagent,parentId:first.parentId||'',relationType:first.relationType||'',relationEvidence:first.relationEvidence||'',forkedFromId:first.forkedFromId||'',effort:first.effort||'',origin:first.origin||'',started:first.started,lastActivity:first.lastActivity,contextWindow:first.contextWindow,contextUsed:first.contextUsed,contextTimeline:[],events:[],malformed:first.malformed,reportedCost:states.find(state=>state.reportedCost)?.reportedCost||null};
   if(first.tool==='hermes')session.segmentIds=first.segmentIds||[first.id];
   const relationshipProofs=[...new Map(states.map(s=>{
    const relatedId=s.parentId||s.forkedFromId||'';return relatedId&&s.relationType?[`${s.relationType}:${relatedId}`,{parentId:s.parentId||'',forkedFromId:s.forkedFromId||'',relationType:s.relationType,relationEvidence:s.relationEvidence||''}]:null;
   }).filter(Boolean)).values()];
   if(relationshipProofs.length===1)Object.assign(session,relationshipProofs[0],{subagent:['subagent','guardian_review'].includes(relationshipProofs[0].relationType)});
   else if(relationshipProofs.length>1)Object.assign(session,{parentId:'',forkedFromId:'',relationType:'ambiguous',relationEvidence:'conflicting cached session metadata',subagent:true});
   for(const s of states.slice(1)) {
    if(s.started&&(!session.started||s.started<session.started))session.started=s.started;
    if(s.lastActivity>session.lastActivity) {session.lastActivity=s.lastActivity;session.contextWindow=s.contextWindow??session.contextWindow;session.contextUsed=s.contextUsed??session.contextUsed;}
    session.effort=s.effort||session.effort;session.origin=s.origin||session.origin;session.malformed=Math.max(session.malformed,s.malformed);
   }
   if(includeContextTimeline){const contextSeen=new Set();for(const s of states)for(const item of [...Object.values(s.contextSamples||{}),...Object.values(s.contextMarkers||{})]){if(contextSeen.has(item.id))continue;contextSeen.add(item.id);session.contextTimeline.push(item);}session.contextTimeline.sort((a,b)=>a.time.localeCompare(b.time)||a.kind.localeCompare(b.kind));}else delete session.contextTimeline;
   const records=first.tool==='codex'&&states.some(s=>Object.keys(s.records||{}).length),seen=new Set();
   for(const s of states)for(const event of Object.values(records?(s.records||{}):(s.events||{}))) {if(seen.has(event.id))continue;seen.add(event.id);if(claudeOwners&&s.tool==='claude'){const owner=claudeOwners.get(event.id);if(owner&&owner!==id)continue;}const pricing=Number.isFinite(event.reportedCost)?{cost:event.reportedCost,pricingMode:'reported',priceSnapshotId:null,pricingRuleVersion:'hermes-reported'}:this.priceHistory?.evaluate(event,settings.pricingMode,settings.prices,currentRates)||{cost:costForRates(event,currentRates),pricingMode:'current',priceSnapshotId:null,pricingRuleVersion:PRICING_RULE_VERSION};session.events.push(includePricingEvidence?{...event,...pricing}:{...event,cost:pricing.cost});}
   sessions.push(session);
  }
  const claude=this.claudeLimits;
  if(claude&&(!limits.claude||limits.claude.observedAt<claude.observedAt))limits.claude=claude;
  else if(limits.claude&&!limits.claude.plan_type&&claude?.plan_type)limits.claude={...limits.claude,plan_type:claude.plan_type};
  if(this.hermesLimits)limits.hermes=this.hermesLimits;
  const claudeBridge={file:bridgeCandidates(settings.claudeRoots)[0]||null,active:claude?.source==='statusline'};
  const priceHistory=this.priceHistory?.status()||{snapshots:[]},pricingRevision=createHash('sha256').update((priceHistory.snapshots||[]).map(item=>item.id).join('|')+'|'+JSON.stringify(settings.prices||{})).digest('hex').slice(0,16),sourceRevision=createHash('sha256').update(JSON.stringify([settings.claudeRoots,settings.codexRoots,settings.hermesRoots,settings.coworkRoots||[]])).digest('hex').slice(0,12);
  const result={sessions:sessions.sort((a,b)=>(b.lastActivity||'').localeCompare(a.lastActivity||'')),limits,claudeBridge,lastScan:this.lastScan,stats:this.stats,priceDate,pricingMode:settings.pricingMode||'current',pricingRuleVersion:PRICING_RULE_VERSION,priceHistory,detailRevision:[this.dataRevision,settings.pricingMode||'current',pricingRevision,sourceRevision,PRICING_RULE_VERSION].join('|')};
  if(includeLimitHistory)result.limitHistory=this.limitHistory;return result;
 }
}
