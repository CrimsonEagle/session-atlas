import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {PARSER_VERSION,newState,ingest} from './parser.mjs';
import {readLimits,bridgeCandidates} from './claude-limits.mjs';
import {costFor,priceDate,PRICING_RULE_VERSION} from './pricing.mjs';
import {updateLimitHistory} from './limit-history.mjs';

// Bound file descriptors and in-flight buffers while letting filesystem requests overlap.
// Results retain discovery order so duplicate-session precedence stays deterministic.
async function mapLimit(items,limit,visit) {
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(next<items.length) {const index=next++;results[index]=await visit(items[index]);}
 }));
 return results;
}
function unchanged(cached,st,tool) {
 return cached?.parserVersion===PARSER_VERSION&&cached.prefixHash&&cached.tool===tool&&cached.size===st.size&&cached.mtime===st.mtimeMs
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
 constructor(cacheFile,priceHistory=null) {this.cacheFile=cacheFile;this.priceHistory=priceHistory;this.files={};this.limitHistory=[];this.limitNotified={};this.limitAlerts=[];this.cacheVersion=null;this.cacheNeedsBackup=false;this.repos=new Map();this.repoPending=new Map();this.claudeLimits=null;this.scanCount=0;this.lastScan=null;}
 async load() {try {const x=JSON.parse(await fs.readFile(this.cacheFile,'utf8'));if([2,3,4,5,6].includes(x.version)){this.files=x.files;this.limitHistory=Array.isArray(x.limitHistory)?x.limitHistory:[];this.limitNotified=x.limitNotified&&typeof x.limitNotified==='object'?x.limitNotified:{};this.cacheVersion=x.version;this.cacheNeedsBackup=x.version<6;}}catch{}}
 async repository(cwd) {
  if(!cwd)return 'Unbekannter Ordner';if(this.repos.has(cwd))return this.repos.get(cwd);
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
 async scan(settings) {
  if(this.pending)return this.pending;
  this.pending=this.performScan(settings).finally(()=>{this.pending=null;});return this.pending;
 }
 takeLimitAlerts(){const alerts=this.limitAlerts;this.limitAlerts=[];return alerts;}
 async persist(){await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});await fs.writeFile(this.cacheFile+'.tmp',JSON.stringify({version:6,files:this.files,limitHistory:this.limitHistory,limitNotified:this.limitNotified}));await fs.rename(this.cacheFile+'.tmp',this.cacheFile);this.cacheVersion=6;this.cacheNeedsBackup=false;}
 async performScan(settings) {
  const begun=Date.now(), warnings=[];let changed=0,bytes=0;
  const roots=[...settings.claudeRoots.map(root=>({tool:'claude',root})),...settings.codexRoots.map(root=>({tool:'codex',root}))];
  const discovered=await mapLimit(roots,4,async({tool,root})=>(await discover(root,warnings)).map(file=>({tool,file})));
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
     let prefix=createHash('sha256'),restart=!cached||cached.parserVersion!==PARSER_VERSION||cached.tool!==tool||!cached.prefixHash||st.size<cached.offset||(cached.size===st.size&&cached.mtime!==st.mtimeMs);
     if(!restart) {
      if(cached.offset)for await (const chunk of handle.createReadStream({start:0,end:cached.offset-1,autoClose:false,highWaterMark:512*1024})) {bytes+=chunk.length;prefix.update(chunk);}
      if(prefix.copy().digest('hex')!==cached.prefixHash)restart=true;
     }
     if(restart)prefix=createHash('sha256');
     // ingest replaces map entries; copying their containers isolates failures without
     // deep-cloning every historical event, even when only one new response was appended.
     const s=restart?newState(tool,file):{...cached,events:{...cached.events},records:{...cached.records},contextSamples:{...cached.contextSamples},contextMarkers:{...cached.contextMarkers},limits:{...cached.limits},limitObservations:{...cached.limitObservations}};
     let pending=Buffer.alloc(0),consumed=s.offset;
     // Limit the stream to the size observed above; an append is picked up next scan.
     if(st.size>s.offset) for await (const chunk of handle.createReadStream({start:s.offset,end:st.size-1,autoClose:false,highWaterMark:512*1024})) {
      bytes+=chunk.length;pending=pending.length?Buffer.concat([pending,chunk]):chunk;let at=0,index;
      while((index=pending.indexOf(10,at))!==-1) {const end=index+1,line=pending.subarray(at,index).toString('utf8');consumed+=end-at;at=end;
       if(line.trim())try {ingest(s,JSON.parse(line));}catch{s.malformed++;}
      }
      if(at)prefix.update(pending.subarray(0,at));
      pending=pending.subarray(at);
      if(pending.length>32*1024*1024)throw Error('Eine Logzeile überschreitet 32 MB');
     }
     // Accept valid final JSON even without a newline; incomplete JSON stays unread.
     if(pending.length) {let final;try {final=JSON.parse(pending.toString('utf8'));}catch{}
      if(final) {try {ingest(s,final);}catch{s.malformed++;}consumed+=pending.length;prefix.update(pending);}
     }
     s.offset=consumed;s.size=st.size;s.mtime=st.mtimeMs;s.ctime=st.ctimeMs;s.ino=st.ino;s.dev=st.dev;s.prefixHash=prefix.digest('hex');
     if(/^[a-z]:[\\/]|^\\\\/i.test(s.cwd))s.cwd=path.win32.normalize(s.cwd);
     s.repository=await this.repository(s.cwd);
     return s;
    }catch(e){warnings.push(`${file}: ${e.code||e.message}`);}finally{try{await handle?.close();}catch(e){warnings.push(`${file}: ${e.code||e.message}`);}}
  });
  for(const state of results)if(state){this.files[state.file]=state;changed++;}
  this.claudeLimits=await readLimits(settings.claudeRoots,warnings);
  const currentFiles=Object.values(this.files).filter(state=>seen.has(path.resolve(state.file))),history=updateLimitHistory([...currentFiles.flatMap(state=>Object.values(state.limitObservations||{})),this.claudeLimits],this.limitHistory,this.limitNotified,{retentionDays:settings.limitRetentionDays,thresholds:settings.limitThresholds});
  this.limitHistory=history.history;this.limitNotified=history.notified;this.limitAlerts=history.alerts;
  this.scanCount++;this.lastScan=new Date().toISOString();
  this.stats={durationMs:Date.now()-begun,changed,bytes,files:Object.keys(this.files).length,scanCount:this.scanCount,warnings};
  if(changed||history.changed) {try {
   await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});
   if(this.cacheNeedsBackup) {try {await fs.copyFile(this.cacheFile,`${this.cacheFile}.v${this.cacheVersion}.backup`,fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}}
   await this.persist();
  }catch(e){warnings.push(`Cache konnte nicht gespeichert werden: ${e.code}`);}}
  return this.snapshot(settings);
 }
 snapshot(settings) {
  const groupedStates=new Map(),limits={};
  // Active paths win over retained archived duplicates.
  const files=Object.values(this.files).filter(s=>(s.tool==='claude'?settings.claudeRoots:settings.codexRoots).some(root=>{const rel=path.relative(root,s.file);return !rel.startsWith('..')&&!path.isAbsolute(rel);}));
  files.sort((a,b)=>Number(a.file.includes('archived_sessions'))-Number(b.file.includes('archived_sessions')));
  for(const s of files) {
   const id=`${s.tool}:${s.id}`;
   if(!groupedStates.has(id))groupedStates.set(id,[]);groupedStates.get(id).push(s);
   for(const [key,value] of Object.entries(s.limits))if(!limits[key]||limits[key].observedAt<value.observedAt)limits[key]=value;
  }
  const sessions=[];
  for(const [id,states] of groupedStates) {
  const first=states[0],session={id,tool:first.tool,sessionId:first.id,title:first.title,cwd:first.cwd,repository:first.repository||first.cwd,branch:first.branch,subagent:first.subagent,parentId:first.parentId||'',relationType:first.relationType||'',relationEvidence:first.relationEvidence||'',forkedFromId:first.forkedFromId||'',effort:first.effort||'',origin:first.origin||'',started:first.started,lastActivity:first.lastActivity,contextWindow:first.contextWindow,contextUsed:first.contextUsed,contextTimeline:[],events:[],malformed:first.malformed};
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
   const contextSeen=new Set();for(const s of states)for(const item of [...Object.values(s.contextSamples||{}),...Object.values(s.contextMarkers||{})]){if(contextSeen.has(item.id))continue;contextSeen.add(item.id);session.contextTimeline.push(item);}session.contextTimeline.sort((a,b)=>a.time.localeCompare(b.time)||a.kind.localeCompare(b.kind));
   const records=first.tool==='codex'&&states.some(s=>Object.keys(s.records||{}).length),seen=new Set();
   for(const s of states)for(const event of Object.values(records?(s.records||{}):(s.events||{}))) {if(seen.has(event.id))continue;seen.add(event.id);const pricing=this.priceHistory?.evaluate(event,settings.pricingMode,settings.prices)||{cost:costFor(event,settings.prices),pricingMode:'current',priceSnapshotId:null,pricingRuleVersion:PRICING_RULE_VERSION};session.events.push({...event,...pricing});}
   sessions.push(session);
  }
  const claude=this.claudeLimits;
  if(claude&&(!limits.claude||limits.claude.observedAt<claude.observedAt))limits.claude=claude;
  const claudeBridge={file:bridgeCandidates(settings.claudeRoots)[0]||null,active:claude?.source==='statusline'};
  return {sessions:sessions.sort((a,b)=>(b.lastActivity||'').localeCompare(a.lastActivity||'')),limits,limitHistory:this.limitHistory,claudeBridge,lastScan:this.lastScan,stats:this.stats,priceDate,pricingMode:settings.pricingMode||'current',pricingRuleVersion:PRICING_RULE_VERSION,priceHistory:this.priceHistory?.status()||{snapshots:[]}};
 }
}
