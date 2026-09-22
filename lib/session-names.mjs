import fs from 'node:fs/promises';
import path from 'node:path';

export function cleanSessionName(value) {
 return String(value||'').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu,' ').replace(/\s+/g,' ').trim().slice(0,200);
}

function codexHomes(roots) {
 const homes=new Set();
 for(const root of roots||[]) {
  const resolved=path.resolve(root),leaf=path.basename(resolved).toLowerCase();
  if(['sessions','archived_sessions'].includes(leaf))homes.add(path.dirname(resolved));
 }
 return [...homes];
}

export async function readCodexSessionNames(roots,warnings=[]) {
 const names=new Map();let databaseCount=0,DatabaseSync;
 try {({DatabaseSync}=await import('node:sqlite'));}catch{warnings.push('Codex session names are unavailable because this Node.js version does not provide node:sqlite.');return {names,databaseCount};}
 for(const home of codexHomes(roots)) {
  let files;try {files=(await fs.readdir(home)).filter(file=>/^state_\d+\.sqlite$/i.test(file)).sort((a,b)=>Number(b.match(/\d+/)?.[0])-Number(a.match(/\d+/)?.[0]));}catch(error){if(error.code!=='ENOENT')warnings.push(`${home}: ${error.code||error.message}`);continue;}
  const file=files[0];if(!file)continue;let database;
  try {
   database=new DatabaseSync(path.join(home,file),{readOnly:true});
   const columns=new Set(database.prepare('PRAGMA table_info(threads)').all().map(column=>column.name));
   if(!columns.has('id'))continue;
   const selected=['id',...['name','title'].filter(column=>columns.has(column))];
   if(selected.length===1)continue;
   for(const row of database.prepare(`SELECT ${selected.join(',')} FROM threads`).all()) {
    const explicit=cleanSessionName(row.name),generated=cleanSessionName(row.title),name=explicit||generated;
    if(name)names.set(String(row.id),{name,source:explicit?'codex.state.threads.name':'codex.state.threads.title',priority:explicit?3:2});
   }
   databaseCount++;
  }catch(error){warnings.push(`${path.join(home,file)}: ${error.code||error.message}`);}finally{try{database?.close();}catch{}}
 }
 return {names,databaseCount};
}
