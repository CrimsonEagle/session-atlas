import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cleanSessionName} from './session-names.mjs';
// Claude Desktop runs each Cowork task as its own Claude Code instance below
// local-agent-mode-sessions/<account>/<organization>/<session>/. Atlas reads three things there:
// the Claude Code transcripts in .claude/projects, the rate_limit_event entries the app audits in
// audit.jsonl, and the title plus transcript ID from the <session>.json metadata. Prompts, uploads,
// outputs, mounted host folders and plugin caches are never entered.
export const COWORK_AUDIT_TOOL='cowork-audit';
const SESSION_DEPTH=4,MAX_METADATA_BYTES=16*1024*1024;
const SKIPPED=new Set(['cowork_plugins','node_modules','outputs','uploads','host-cwd','shim-lib','shim-perm','debug','backups','memory']);
// Claude Code keeps large tool outputs and memory notes beside transcripts; neither holds usage.
const TRANSCRIPT_SKIPPED=new Set(['tool-results','memory']);

export function defaultCoworkRoot(platform=process.platform,env=process.env,home=os.homedir()) {
 if(platform==='win32')return path.join(env.APPDATA||path.join(home,'AppData','Roaming'),'Claude','local-agent-mode-sessions');
 if(platform==='darwin')return path.join(home,'Library','Application Support','Claude','local-agent-mode-sessions');
 return path.join(env.XDG_CONFIG_HOME||path.join(home,'.config'),'Claude','local-agent-mode-sessions');
}

async function entries(dir,warnings) {
 try{return await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')warnings.push(`${dir}: ${e.code}`);return [];}
}
// Directories are listed concurrently: a refresh waits for the deepest path, not for every listing.
async function transcripts(dir,warnings,result) {
 const nested=[];
 for(const entry of await entries(dir,warnings)) {
  if(entry.isSymbolicLink())continue;
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){if(!TRANSCRIPT_SKIPPED.has(entry.name))nested.push(transcripts(file,warnings,result));}
  else if(entry.name.endsWith('.jsonl'))result.push(file);
 }
 await Promise.all(nested);
}
// A session directory is recognized by its own .claude directory. The walk is depth-limited and
// skips hidden and known content folders, so a refresh only lists a few directories per session.
export async function discoverCowork(root,warnings=[]) {
 const result={transcripts:[],audits:[],metadata:[]};
 async function walk(dir,depth) {
  const list=await entries(dir,warnings);
  const nested=[];
  if(list.some(entry=>entry.isDirectory()&&!entry.isSymbolicLink()&&entry.name==='.claude')) {
   nested.push(transcripts(path.join(dir,'.claude','projects'),warnings,result.transcripts));
   if(list.some(entry=>entry.isFile()&&entry.name==='audit.jsonl'))result.audits.push(path.join(dir,'audit.jsonl'));
  }
  for(const entry of list) {
   if(entry.isSymbolicLink())continue;
   const file=path.join(dir,entry.name);
   if(entry.isFile()&&/^local_.+\.json$/.test(entry.name))result.metadata.push(file);
   else if(entry.isDirectory()&&depth<SESSION_DEPTH&&!SKIPPED.has(entry.name)&&!entry.name.startsWith('.'))nested.push(walk(file,depth+1));
  }
  await Promise.all(nested);
 }
 await walk(root,0);
 // Concurrent listing finishes in any order; sorting keeps duplicate handling deterministic.
 for(const list of Object.values(result))list.sort();
 return result;
}

// Metadata files also hold prompts and account details; only the title and transcript ID are kept.
// Unchanged files are served from the cache by size and modification time.
export async function readCoworkMetadata(files,warnings=[],cache=new Map()) {
 const names=new Map(),seen=new Set(files);
 const entries=await Promise.all(files.map(async file=>{
  try {
   const st=await fs.stat(file);let entry=cache.get(file);
   if(!entry||entry.size!==st.size||entry.mtime!==st.mtimeMs) {
    if(st.size>MAX_METADATA_BYTES)throw Error('größer als 16 MB');
    const x=JSON.parse(await fs.readFile(file,'utf8'));
    entry={size:st.size,mtime:st.mtimeMs,sessionId:typeof x.cliSessionId==='string'?x.cliSessionId:'',title:cleanSessionName(x.title)};cache.set(file,entry);
   }
   return entry;
  }catch(e){if(e.code!=='ENOENT')warnings.push(`${file}: ${e.code||e.message}`);return null;}
 }));
 for(const entry of entries)if(entry?.sessionId&&entry.title)names.set(entry.sessionId,entry.title);
 for(const file of cache.keys())if(!seen.has(file))cache.delete(file);
 return names;
}

const WINDOWS=[['five_hour',300],['seven_day',10080]];
const percent=value=>Math.round(Math.max(0,value)*10000)/100;
// Claude Desktop records the account-wide usage the API reports with every response. Utilization
// is a fraction; older entries carry a single window only while a warning is active.
export function coworkLimit(x) {
 if(x?.type!=='rate_limit_event')return null;
 const info=x.rate_limit_info||{},observedMs=Date.parse(x.timestamp||x._audit_timestamp);
 if(!Number.isFinite(observedMs))return null;
 const shaped=(window,minutes)=>{const used=Number(window?.utilization),reset=Number(window?.resetsAt);return Number.isFinite(used)?{window_minutes:minutes,used_percent:percent(used),resets_at:Number.isFinite(reset)?Math.floor(reset):null}:null;};
 const [primary,secondary]=WINDOWS.map(([key,minutes])=>info.unifiedWindows?shaped(info.unifiedWindows[key],minutes):info.rateLimitType===key?shaped(info,minutes):null);
 if(!primary&&!secondary)return null;
 return {limit_id:'claude',plan_type:'',source:'cowork',primary,secondary,observedAt:new Date(observedMs).toISOString()};
}
