import fs from 'node:fs/promises';
import path from 'node:path';

export function cleanSessionName(value) {
 const source=String(value||'');let end=Math.min(256,source.length);
 for(;;) {
  const name=source.slice(0,end).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu,' ').replace(/\s+/g,' ').trim();
  if(name.length>=200||end===source.length)return name.slice(0,200);
  end=Math.min(source.length,end*2);
 }
}

function codexHomes(roots) {
 const homes=new Set();
 for(const root of roots||[]) {
  const resolved=path.resolve(root),leaf=path.basename(resolved).toLowerCase();
  if(['sessions','archived_sessions'].includes(leaf))homes.add(path.dirname(resolved));
 }
 return [...homes];
}

async function fileStamp(file) {
 try {const st=await fs.stat(file);return [st.size,st.mtimeMs,st.ctimeMs,st.ino,st.dev];}
 catch(error) {return error.code==='ENOENT'?null:undefined;}
}

export async function readCodexSessionNames(roots,warnings=[],cache=new Map()) {
 const names=new Map();let databaseCount=0,DatabaseSync;
 try {({DatabaseSync}=await import('node:sqlite'));}catch{warnings.push('Codex session names are unavailable because this Node.js version does not provide node:sqlite.');return {names,databaseCount};}
 for(const home of codexHomes(roots)) {
  let files;try {files=(await fs.readdir(home)).filter(file=>/^state_\d+\.sqlite$/i.test(file)).sort((a,b)=>Number(b.match(/\d+/)?.[0])-Number(a.match(/\d+/)?.[0]));}catch(error){if(error.code!=='ENOENT')warnings.push(`${home}: ${error.code||error.message}`);continue;}
  const file=files[0];if(!file)continue;let database;
  const databaseFile=path.join(home,file);
  try {
   // SQLite may keep fresh thread names in the WAL without touching the main file.
   // Both stamps must match before reusing a previous read.
   const stamps=[await fileStamp(databaseFile),await fileStamp(`${databaseFile}-wal`)];
   const stamp=stamps.includes(undefined)?null:JSON.stringify(stamps);
   const previous=cache.get(databaseFile);
   if(stamp&&previous?.stamp===stamp) {for(const [id,name] of previous.names)names.set(id,name);databaseCount++;continue;}
   database=new DatabaseSync(databaseFile,{readOnly:true});
   const columns=new Set(database.prepare('PRAGMA table_info(threads)').all().map(column=>column.name));
   if(!columns.has('id'))continue;
   const selected=['id',...['name','title'].filter(column=>columns.has(column))];
   if(selected.length===1)continue;
   const databaseNames=new Map();
   for(const row of database.prepare(`SELECT ${selected.join(',')} FROM threads`).all()) {
    const explicit=cleanSessionName(row.name),generated=explicit?'':cleanSessionName(row.title),name=explicit||generated;
    if(name)databaseNames.set(String(row.id),{name,source:explicit?'codex.state.threads.name':'codex.state.threads.title',priority:explicit?3:2});
   }
   for(const [id,name] of databaseNames)names.set(id,name);
   if(stamp)cache.set(databaseFile,{stamp,names:databaseNames});
   databaseCount++;
  }catch(error){warnings.push(`${databaseFile}: ${error.code||error.message}`);}finally{try{database?.close();}catch{}}
 }
 return {names,databaseCount};
}
