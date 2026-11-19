import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanSessionName} from './session-names.mjs';

const SKIPPED=new Set(['annotations','bin','builtin','cache','code_tracker','context_state','conversations','crashes','html_artifacts','implicit','knowledge','log','node_modules','playground','presence','scratch','steps','updater','.system_generated','.user_uploaded']);
const MAX_METADATA_BYTES=16*1024*1024;

export function defaultAntigravityRoots(env=process.env,home=os.homedir()) {
 if(env.ANTIGRAVITY_HOME)return [path.resolve(env.ANTIGRAVITY_HOME)];
 const base=path.join(env.HOME||home,'.gemini');
 return [path.join(base,'antigravity-cli'),path.join(base,'antigravity')];
}

export function antigravitySessionId(file) {
 const parts=path.normalize(file).split(path.sep),lower=parts.map(part=>part.toLowerCase());
 const sys=lower.lastIndexOf('.system_generated');
 if(sys>0)return parts[sys-1];
 const brain=lower.lastIndexOf('brain');
 if(brain>=0&&brain+1<parts.length-1)return parts[brain+1];
 const base=path.basename(file,'.jsonl');
 return (base==='transcript'||base==='transcript_full')&&parts.length>1?parts[parts.length-2]:base;
}

export function uriToPath(uri) {
 const raw=String(uri||'').trim();if(!raw)return '';
 if(!raw.startsWith('file://'))return raw;
 try{return fileURLToPath(raw);}catch{
  try{const p=decodeURIComponent(new URL(raw).pathname);return /^\/[a-z]:\//i.test(p)?p.slice(1):p;}catch{return '';}
 }
}

const GEMINI_VARIANT_SUFFIX=/(?:-tiered)?-(minimal|low|medium|high|xhigh)$|-tiered$/i;
function normalizeGeminiSlug(rawSlug,effort='') {
 let slug=rawSlug.toLowerCase(),nextEffort=effort;
 const variant=slug.match(GEMINI_VARIANT_SUFFIX);
 if(variant) {
  const base=slug.slice(0,variant.index);
  if(/^gemini-.+/.test(base)) {slug=base;if(!nextEffort&&variant[1])nextEffort=variant[1].toLowerCase();}
 }
 if(slug==='gemini-3-flash'||slug==='gemini-3.1-pro')slug=`${slug}-preview`;
 return {model:slug,effort:nextEffort};
}

export function normalizeAntigravityModel(raw) {
 let text=String(raw||'').trim().replace(/\.+$/,'').trim(),effort='';
 if(!text||/^(?:none|unknown)$/i.test(text))return {model:'',effort:''};
 const effortMatch=text.match(/\((Minimal|Low|Medium|High|XHigh)\)\s*$/i);
 if(effortMatch){effort=effortMatch[1].toLowerCase();text=text.slice(0,effortMatch.index).trim();}
 text=text.replace(/\s*\(Thinking\)\s*/gi,' ').replace(/\s+/g,' ').trim();
 if(!text||text.length>80||/[`"'<>\\;{}[\]()\r\n]|\.\./.test(text)||/^(?:none|unknown)$/i.test(text))return {model:'',effort:''};
 const claudeMatch=text.match(/^Claude\s+(Opus|Sonnet|Haiku|Fable|Mythos)\s+(\d+)(?:\.(\d+))?$/i);
 if(claudeMatch)return {model:`claude-${claudeMatch[1].toLowerCase()}-${claudeMatch[2]}${claudeMatch[3]?`-${claudeMatch[3]}`:''}`,effort};
 const geminiMatch=text.match(/^Gemini\s+([a-z0-9][a-z0-9.\s-]*)$/i);
 if(geminiMatch)return normalizeGeminiSlug(`gemini-${geminiMatch[1].trim().replace(/\s+/g,'-')}`,effort);
 if(/^gemini-[a-z0-9._:-]+$/i.test(text))return normalizeGeminiSlug(text,effort);
 if(/^[a-z0-9][a-z0-9._:-]*$/i.test(text))return {model:text.toLowerCase(),effort};
 return {model:'',effort:''};
}

function parseWorkspaceUris(raw) {
 if(!raw)return '';
 if(Array.isArray(raw)){for(const item of raw){const p=uriToPath(item);if(p)return p;}return '';}
 const text=String(raw).trim();if(!text)return '';
 if(text.startsWith('[')){try{return parseWorkspaceUris(JSON.parse(text));}catch{}}
 return uriToPath(text);
}

async function entries(dir,warnings) {
 try{return await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')warnings.push(`${dir}: ${e.code}`);return [];}
}

async function regularFile(file) {
 try{const st=await fs.lstat(file);return st.isFile()&&!st.isSymbolicLink()?file:null;}catch{return null;}
}

// Each Antigravity conversation directory holds both transcript.jsonl, transcript_full.jsonl and
// chunked copies under .system_generated/logs. Selecting only the primary transcript per
// conversation directory avoids multiplying usage by four while skipping tool output folders.
async function conversationTranscript(convDir) {
 const logsDir=path.join(convDir,'.system_generated','logs');
 return await regularFile(path.join(logsDir,'transcript.jsonl'))
  ||await regularFile(path.join(logsDir,'transcript_full.jsonl'))
  ||await regularFile(path.join(convDir,'transcript.jsonl'));
}

export async function discoverAntigravity(root,warnings=[]) {
 const found=new Set(),top=await entries(root,warnings);
 const scanConversations=async dir=>{
  const list=await entries(dir,warnings);
  const direct=await conversationTranscript(dir);
  if(direct){found.add(direct);return;}
  await Promise.all(list.map(async entry=>{
   if(entry.isSymbolicLink())return;
   const full=path.join(dir,entry.name);
   if(entry.isDirectory()&&!SKIPPED.has(entry.name)&&!entry.name.startsWith('.')){
    const transcript=await conversationTranscript(full);
    if(transcript)found.add(transcript);
   }
  }));
 };
 const tasks=[scanConversations(root)];
 for(const entry of top){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;
  const name=entry.name.toLowerCase(),sub=path.join(root,entry.name);
  if(name==='brain')tasks.push(scanConversations(sub));
  else if(name==='antigravity-cli'||name==='antigravity'){
   tasks.push(scanConversations(sub),scanConversations(path.join(sub,'brain')));
  }
 }
 await Promise.all(tasks);
 return [...found].sort();
}

function antigravityHomes(roots) {
 const homes=new Set();
 for(const root of roots||[]){
  const resolved=path.resolve(root),leaf=path.basename(resolved).toLowerCase();
  homes.add(resolved);
  if(leaf==='brain')homes.add(path.dirname(resolved));
 }
 return [...homes];
}

async function fileStamp(file) {
 try{const st=await fs.stat(file);return [st.size,st.mtimeMs,st.ctimeMs,st.ino,st.dev];}
 catch(error){return error.code==='ENOENT'?null:undefined;}
}

function mergeMeta(target,id,patch) {
 if(!id)return;
 const current=target.get(id)||{name:'',source:'',priority:0,cwd:'',parentId:'',agentName:''};
 if(patch.name&&(patch.priority||0)>=(current.priority||0)){current.name=patch.name;current.source=patch.source||'';current.priority=patch.priority||0;}
 if(patch.cwd&&!current.cwd)current.cwd=patch.cwd;
 if(patch.parentId&&!current.parentId)current.parentId=patch.parentId;
 if(patch.agentName&&!current.agentName)current.agentName=patch.agentName;
 target.set(id,current);
}

export async function readAntigravityMetadata(roots,warnings=[],cache=new Map(),sessionIds=[]) {
 const metadata=new Map();let DatabaseSync=null;
 try{({DatabaseSync}=await import('node:sqlite'));}catch{}
 const homes=antigravityHomes(roots);
 for(const home of homes){
  // 1. conversation_summaries.db provides titles, previews, workspace URIs and parent conversation IDs.
  if(DatabaseSync){
   const dbFile=path.join(home,'conversation_summaries.db');let db;
   try{
    const stamps=[await fileStamp(dbFile),await fileStamp(`${dbFile}-wal`)];
    if(stamps[0]!==null){
     const stamp=stamps.includes(undefined)?null:JSON.stringify(stamps),cached=cache.get(dbFile);
     let rows=cached?.stamp===stamp?cached.rows:null;
     if(!rows){
      db=new DatabaseSync(dbFile,{readOnly:true});
      const table=['conversation_summaries','summaries'].find(t=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
      const cols=new Set(table?db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name):[]);
      if(cols.has('conversation_id')){
       const select=['conversation_id',...['title','preview','workspace_uris','parent_conversation_id','agent_name'].filter(c=>cols.has(c))];
       rows=db.prepare(`SELECT ${select.join(',')} FROM ${table}`).all().map(row=>{
        const title=cleanSessionName(row.title),preview=title?'':cleanSessionName(row.preview);
        return {id:String(row.conversation_id||'').trim(),name:title||preview,source:title?'antigravity.summaries.title':preview?'antigravity.summaries.preview':'',priority:title?3:preview?2:0,cwd:parseWorkspaceUris(row.workspace_uris),parentId:String(row.parent_conversation_id||'').trim(),agentName:cleanSessionName(row.agent_name)};
       });
       if(stamp)cache.set(dbFile,{stamp,rows});
      }
     }
     for(const row of rows||[])mergeMeta(metadata,row.id,row);
    }
   }catch(e){if(e.code!=='ENOENT')warnings.push(`${dbFile}: ${e.code||e.message}`);}finally{try{db?.close();}catch{}}
  }
  // 2. annotations/<id>.pbtxt holds the conversation title even before summary DB flushes.
  for(const entry of await entries(path.join(home,'annotations'),warnings)){
   if(!entry.isFile()||entry.isSymbolicLink()||!entry.name.endsWith('.pbtxt'))continue;
   const id=path.basename(entry.name,'.pbtxt'),file=path.join(home,'annotations',entry.name);
   try{
    const st=await fs.stat(file);let cached=cache.get(file);
    if(!cached||cached.size!==st.size||cached.mtime!==st.mtimeMs){
     if(st.size>MAX_METADATA_BYTES)continue;
     const text=await fs.readFile(file,'utf8'),match=text.match(/title\s*:\s*"((?:[^"\\]|\\.)*)"/);
     const title=match?cleanSessionName(match[1].replace(/\\"/g,'"').replace(/\\\\/g,'\\')):'';
     cached={size:st.size,mtime:st.mtimeMs,title};cache.set(file,cached);
    }
    if(cached.title)mergeMeta(metadata,id,{name:cached.title,source:'antigravity.annotations.title',priority:3});
   }catch(e){if(e.code!=='ENOENT')warnings.push(`${file}: ${e.code||e.message}`);}
  }
  // 3. cache/last_conversations.json and history.jsonl map conversations to their workspace paths.
  const lastConvFile=path.join(home,'cache','last_conversations.json');
  try{
   const st=await fs.stat(lastConvFile);let cached=cache.get(lastConvFile);
   if(!cached||cached.size!==st.size||cached.mtime!==st.mtimeMs){
    if(st.size<=MAX_METADATA_BYTES){
     const obj=JSON.parse(await fs.readFile(lastConvFile,'utf8')),pairs=[];
     for(const [cwd,id] of Object.entries(obj||{}))if(typeof id==='string'&&typeof cwd==='string')pairs.push([id.trim(),uriToPath(cwd)]);
     cached={size:st.size,mtime:st.mtimeMs,pairs};cache.set(lastConvFile,cached);
    }
   }
   for(const [id,cwd] of cached?.pairs||[])mergeMeta(metadata,id,{cwd});
  }catch(e){if(e.code!=='ENOENT')warnings.push(`${lastConvFile}: ${e.code||e.message}`);}
  const historyFile=path.join(home,'history.jsonl');
  try{
   const st=await fs.stat(historyFile);let cached=cache.get(historyFile);
   if(!cached||cached.size!==st.size||cached.mtime!==st.mtimeMs){
    if(st.size<=MAX_METADATA_BYTES){
     const pairs=[];
     for(const line of (await fs.readFile(historyFile,'utf8')).split('\n'))if(line.trim()){
      try{const x=JSON.parse(line);if(typeof x.conversationId==='string'&&typeof x.workspace==='string')pairs.push([x.conversationId.trim(),uriToPath(x.workspace)]);}catch{}
     }
     cached={size:st.size,mtime:st.mtimeMs,pairs};cache.set(historyFile,cached);
    }
   }
   for(const [id,cwd] of cached?.pairs||[])mergeMeta(metadata,id,{cwd});
  }catch(e){if(e.code!=='ENOENT')warnings.push(`${historyFile}: ${e.code||e.message}`);}
  // 4. conversations/<id>.db trajectory_metadata_blob fallback for sessions still missing cwd.
  if(DatabaseSync&&sessionIds.length){
   for(const id of sessionIds){
    if(metadata.get(id)?.cwd)continue;
    const convDb=path.join(home,'conversations',`${id}.db`);let db;
    try{
     const stamps=[await fileStamp(convDb),await fileStamp(`${convDb}-wal`)];
     if(stamps[0]===null)continue;
     const stamp=stamps.includes(undefined)?null:JSON.stringify(stamps),cached=cache.get(convDb);
     let cwd=cached?.stamp===stamp?cached.cwd:undefined;
     if(cwd===undefined){
      db=new DatabaseSync(convDb,{readOnly:true});
      const row=db.prepare("SELECT data FROM trajectory_metadata_blob WHERE id='main'").get();
      const text=row?.data?Buffer.from(row.data).toString('utf8'):'';
      const match=text.match(/file:\/\/\/[^\x00-\x1f"'\s<>]+/);
      cwd=match?uriToPath(match[0]):'';
      if(stamp)cache.set(convDb,{stamp,cwd});
     }
     if(cwd)mergeMeta(metadata,id,{cwd});
    }catch{}finally{try{db?.close();}catch{}}
   }
  }
 }
 return metadata;
}
