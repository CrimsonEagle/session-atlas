import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {newState,ingest,sessionEvents} from './parser.mjs';
import {costFor,priceDate} from './pricing.mjs';

async function discover(root,warnings) {
 const result=[];
 async function walk(dir) {try {for(const e of await fs.readdir(dir,{withFileTypes:true})) {
  if(e.isSymbolicLink()) continue;
  const p=path.join(dir,e.name); if(e.isDirectory()) await walk(p);else if(e.name.endsWith('.jsonl')) result.push(p);
 }}catch(e){if(e.code!=='ENOENT') warnings.push(`${dir}: ${e.code}`);}}
 await walk(root);return result;
}
export class Store {
 constructor(cacheFile) {this.cacheFile=cacheFile;this.files={};this.repos=new Map();this.scanCount=0;this.lastScan=null;}
 async load() {try {const x=JSON.parse(await fs.readFile(this.cacheFile,'utf8'));if(x.version===2)this.files=x.files;}catch{}}
 async repository(cwd) {
  if(!cwd)return 'Unbekannter Ordner';if(this.repos.has(cwd))return this.repos.get(cwd);
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
 async performScan(settings) {
  const begun=Date.now(), warnings=[];let changed=0,bytes=0;
  for(const [tool,roots] of [['claude',settings.claudeRoots],['codex',settings.codexRoots]]) for(const root of roots) {
   for(const file of await discover(root,warnings)) {
    try {
     const st=await fs.stat(file);let s=this.files[file];
     if(s&&s.size===st.size&&s.mtime===st.mtimeMs)continue;
     if(!s||st.size<s.offset||(s.size===st.size&&s.mtime!==st.mtimeMs))s=newState(tool,file);
     let pending=Buffer.alloc(0),consumed=s.offset;
     // Limit the stream to the size observed above; an append is picked up next scan.
     if(st.size>s.offset) for await (const chunk of createReadStream(file,{start:s.offset,end:st.size-1,highWaterMark:128*1024})) {
      bytes+=chunk.length;pending=Buffer.concat([pending,chunk]);let at=0,index;
      while((index=pending.indexOf(10,at))!==-1) {const line=pending.subarray(at,index).toString('utf8');consumed+=index-at+1;at=index+1;
       if(line.trim())try {ingest(s,JSON.parse(line));}catch{s.malformed++;}
      }
      pending=pending.subarray(at);
      if(pending.length>32*1024*1024)throw Error('Eine Logzeile überschreitet 32 MB');
     }
     // Accept valid final JSON even without a newline; incomplete JSON stays unread.
     if(pending.length) {let final;try {final=JSON.parse(pending.toString('utf8'));}catch{}
      if(final) {try {ingest(s,final);}catch{s.malformed++;}consumed+=pending.length;}
     }
     s.offset=consumed;s.size=st.size;s.mtime=st.mtimeMs;
     if(/^[a-z]:[\\/]|^\\\\/i.test(s.cwd))s.cwd=path.win32.normalize(s.cwd);
     s.repository=await this.repository(s.cwd);
     this.files[file]=s;changed++;
    }catch(e){warnings.push(`${file}: ${e.code||e.message}`);}
   }
  }
  this.scanCount++;this.lastScan=new Date().toISOString();
  this.stats={durationMs:Date.now()-begun,changed,bytes,files:Object.keys(this.files).length,scanCount:this.scanCount,warnings};
  if(changed) {try {await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});await fs.writeFile(this.cacheFile+'.tmp',JSON.stringify({version:2,files:this.files}));await fs.rename(this.cacheFile+'.tmp',this.cacheFile);}catch(e){warnings.push(`Cache konnte nicht gespeichert werden: ${e.code}`);}}
  return this.snapshot(settings);
 }
 snapshot(settings) {
  const groups=new Map(),limits={},seen=new Set();
  // Active paths win over retained archived duplicates.
  const files=Object.values(this.files).filter(s=>(s.tool==='claude'?settings.claudeRoots:settings.codexRoots).some(root=>{const rel=path.relative(root,s.file);return !rel.startsWith('..')&&!path.isAbsolute(rel);}));
  files.sort((a,b)=>Number(a.file.includes('archived_sessions'))-Number(b.file.includes('archived_sessions')));
  for(const s of files) {
   const id=`${s.tool}:${s.id}`;
   let session=groups.get(id);
   if(!session) {session={id,tool:s.tool,sessionId:s.id,title:s.title,cwd:s.cwd,repository:s.repository||s.cwd,branch:s.branch,subagent:s.subagent,effort:s.effort||'',origin:s.origin||'',started:s.started,lastActivity:s.lastActivity,contextWindow:s.contextWindow,contextUsed:s.contextUsed,events:[],malformed:s.malformed};groups.set(id,session);}
   if(s.lastActivity>session.lastActivity)session.lastActivity=s.lastActivity;
   session.effort=s.effort||session.effort;session.origin=s.origin||session.origin;
   for(const event of sessionEvents(s)) {if(seen.has(event.id))continue;seen.add(event.id);session.events.push({...event,cost:costFor(event,settings.prices)});}
   for(const [key,value] of Object.entries(s.limits))if(!limits[key]||limits[key].observedAt<value.observedAt)limits[key]=value;
  }
  return {sessions:[...groups.values()].sort((a,b)=>(b.lastActivity||'').localeCompare(a.lastActivity||'')),limits,lastScan:this.lastScan,stats:this.stats,priceDate};
 }
}
