import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function defaultHermesHome(env=process.env,platform=process.platform) {
 return path.resolve(env.HERMES_HOME||(platform==='win32'?path.join(env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'hermes'):path.join(os.homedir(),'.hermes')));
}
export function validateHermesRoots(value) {
 if(!Array.isArray(value)||value.length>20||value.some(root=>typeof root!=='string'||!path.isAbsolute(root)||root.length>2000))throw Error('Bitte gültige absolute Hermes-Verzeichnisse eintragen.');
 return [...new Set(value.map(root=>path.resolve(root)))];
}
const finite=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const stamp=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value),ms=Number.isFinite(n)?(Math.abs(n)>1e11?n:n*1000):Date.parse(value);return Number.isFinite(ms)?new Date(ms).toISOString():null;};
const cost=row=>{
 const status=String(row.cost_status||'').toLowerCase(),actual=row.actual_cost_usd===null||row.actual_cost_usd===undefined?NaN:Number(row.actual_cost_usd),estimate=row.estimated_cost_usd===null||row.estimated_cost_usd===undefined?NaN:Number(row.estimated_cost_usd);
 if(status==='included')return 0;
 if(status==='actual'&&Number.isFinite(actual)&&actual>=0)return actual;
 if(status==='unknown')return null;
 return Number.isFinite(estimate)&&estimate>0?estimate:null;
};
const fields=['input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','reasoning_tokens','api_call_count'];
const counters=row=>({input:finite(row.input_tokens),cache:finite(row.cache_read_tokens),write:finite(row.cache_write_tokens),output:finite(row.output_tokens),reasoning:finite(row.reasoning_tokens),calls:finite(row.api_call_count)});
const projection=(db,table,names)=>{const columns=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name));return {columns,sql:names.map(name=>columns.has(name)?name:`NULL AS ${name}`).join(', ')};};
const usageKey=row=>createHash('sha256').update(JSON.stringify([row.model,row.billing_provider,row.billing_base_url,row.billing_mode,row.task])).digest('hex').slice(0,20);
export const hermesRootId=root=>createHash('sha256').update(process.platform==='win32'?path.resolve(root).toLowerCase():path.resolve(root)).digest('hex').slice(0,10);
const openRouter=row=>String(row.billing_provider||'').toLowerCase()==='openrouter'||/^https?:\/\/(?:[^/]+\.)?openrouter\.ai(?::\d+)?(?:\/|$)/i.test(String(row.billing_base_url||''));
const usage=(row,time)=>({key:usageKey(row),model:String(row.model||'unknown').slice(0,160),provider:String(row.billing_provider||'').slice(0,80),task:String(row.task||'').slice(0,80),priceModel:openRouter(row)?`openrouter:${row.model}`:'',time:stamp(row.last_seen)||time,counters:counters(row),reportedCost:cost(row)});

async function databases(roots,warnings) {
 const result=[],seen=new Set();
 for(const root of roots){
  let profiles=[];try{profiles=(await fs.readdir(path.join(root,'profiles'),{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();}catch(error){if(error.code!=='ENOENT')warnings.push(`Hermes (${root}): ${error.message}`);}
  for(const [profile,dir] of [['default',root],...profiles.map(name=>[`profile:${name}`,path.join(root,'profiles',name)])]){
   const file=path.join(dir,'state.db');if(seen.has(file))continue;seen.add(file);
   try{if(!(await fs.stat(file)).isFile())continue;}catch(error){if(error.code!=='ENOENT')warnings.push(`Hermes (${file}): ${error.message}`);continue;}
   result.push({root,profile,file});
  }
 }
 return result;
}

export async function readHermesLocal(roots) {
 const warnings=[],rows=[],candidates=await databases(validateHermesRoots(roots),warnings);
 if(!candidates.length)return {rows,warnings};
 let DatabaseSync;try{({DatabaseSync}=await import('node:sqlite'));}catch{warnings.push('Hermes: Diese Node.js-Version bietet node:sqlite nicht an.');return {rows,warnings};}
 for(const {root,profile,file} of candidates){
  let db;try{
   db=new DatabaseSync(file,{readOnly:true});
   const sessionFields=['id','source','model','title','started_at','ended_at','last_activity_at','parent_session_id','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','reasoning_tokens','estimated_cost_usd','actual_cost_usd','cost_status','cwd','git_branch','git_repo_root','api_call_count','billing_provider','billing_base_url','billing_mode'];
   const sessions=projection(db,'sessions',sessionFields);
   if(!['id','started_at','input_tokens','output_tokens'].every(name=>sessions.columns.has(name)))throw Error('Hermes sessions-Schema wird nicht unterstützt.');
   const messages=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages'").get()?new Map(db.prepare('SELECT session_id, MAX(timestamp) AS last_activity FROM messages GROUP BY session_id').all().map(row=>[row.session_id,row.last_activity])):new Map();
   const modelTable=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_model_usage'").get()),bySession=new Map();
   if(modelTable){
    const names=['session_id','model','billing_provider','billing_base_url','billing_mode','task',...fields,'estimated_cost_usd','actual_cost_usd','cost_status','last_seen'];
    const modelFields=projection(db,'session_model_usage',names);
    if(modelFields.columns.has('session_id'))for(const item of db.prepare(`SELECT ${modelFields.sql} FROM session_model_usage`).all()){
     if(!bySession.has(item.session_id))bySession.set(item.session_id,[]);bySession.get(item.session_id).push(item);
    }
   }
   const rootId=hermesRootId(root);
   for(const item of db.prepare(`SELECT ${sessions.sql} FROM sessions`).all()){
    if(typeof item.id!=='string'||item.id.length>300)continue;
    const started=stamp(item.started_at),lastActivity=[started,stamp(item.ended_at),stamp(item.last_activity_at),stamp(messages.get(item.id))].filter(Boolean).sort().at(-1);
    if(!started||!lastActivity)continue;
    const prefix=`${rootId}:${profile}`,aggregate=counters(item),modelRows=bySession.get(item.id)||[],usages=modelRows.map(row=>usage(row,lastActivity));
    if(modelRows.length){
     const residual={};for(const key of Object.keys(aggregate))residual[key]=Math.max(0,aggregate[key]-usages.reduce((sum,row)=>sum+row.counters[key],0));
     const estimatedResidual=Math.max(0,finite(item.estimated_cost_usd)-modelRows.reduce((sum,row)=>sum+finite(row.estimated_cost_usd),0));
     const actualResidual=Math.max(0,finite(item.actual_cost_usd)-modelRows.reduce((sum,row)=>sum+finite(row.actual_cost_usd),0));
     if(Object.values(residual).some(Boolean)||estimatedResidual||actualResidual)usages.push(usage({...item,task:'unattributed',...Object.fromEntries(fields.map((field,index)=>[field,residual[['input','output','cache','write','reasoning','calls'][index]]])),estimated_cost_usd:estimatedResidual,actual_cost_usd:actualResidual},lastActivity));
    }else usages.push(usage(item,lastActivity));
    rows.push({id:`${prefix}:${item.id}`,root,profile,dbFile:file,source:String(item.source||'').slice(0,80),name:String(item.title||'').slice(0,300),model:String(item.model||'unknown').slice(0,160),started,lastActivity,parentId:item.parent_session_id?`${prefix}:${item.parent_session_id}`:'',cwd:String(item.cwd||item.git_repo_root||'').slice(0,2000),branch:String(item.git_branch||'').slice(0,300),usages});
   }
  }catch(error){warnings.push(`Hermes (${file}): ${error.message}`);}finally{try{db?.close();}catch{}}
 }
 return {rows,warnings};
}
