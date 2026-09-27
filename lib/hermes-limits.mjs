import fs from 'node:fs/promises';
import path from 'node:path';
export const HERMES_LIMIT_FILE='session-atlas-hermes-limits.json';
export const HERMES_LIMIT_INBOX='session-atlas-hermes-limit-inbox';
const windowShape=(entry,minutes)=>{
 if(!entry||typeof entry.used_percent!=='number'||!Number.isFinite(entry.used_percent)||entry.used_percent<0||entry.used_percent>100)return null;
 const reset=Date.parse(entry.resets_at);
 if(!Number.isFinite(reset))return null;
 return {window_minutes:minutes,used_percent:entry.used_percent,resets_at:Math.floor(reset/1000)};
};
export function normalizeHermesUsage(raw){
 if(raw?.provider!=='openai-codex'||raw.source!=='usage_api'||!Array.isArray(raw.windows))return null;
 const primary=windowShape(raw.windows.find(w=>w.label==='Session'),300),secondary=windowShape(raw.windows.find(w=>w.label==='Weekly'),10080);
 if(!primary||!secondary)return null;
 return {limit_id:'hermes',source:'hermes-usage',plan_type:typeof raw.plan==='string'?raw.plan.slice(0,80):'',primary,secondary};
}
export function normalizeHermesSnapshot(state){
 if(state?.version!==1||state.limit_id!=='hermes'||state.source!=='hermes-usage'||typeof state.observedAt!=='string'||!Number.isFinite(Date.parse(state.observedAt)))return null;
 // The persisted format contains epoch seconds, not the ISO date expected by windowShape.
 if(!state.primary||!state.secondary||!Number.isFinite(state.primary.used_percent)||!Number.isFinite(state.secondary.used_percent))return null;
 const windows=[state.primary,state.secondary];
 if(windows.some((w,i)=>w.window_minutes!==[300,10080][i]||typeof w.used_percent!=='number'||w.used_percent<0||w.used_percent>100||!Number.isSafeInteger(w.resets_at)||w.resets_at<=0))return null;
 return {version:1,limit_id:'hermes',source:'hermes-usage',plan_type:typeof state.plan_type==='string'?state.plan_type.slice(0,80):'',observedAt:new Date(state.observedAt).toISOString(),primary:{...state.primary},secondary:{...state.secondary}};
}
async function read(file,warnings){try{const stat=await fs.stat(file);if(stat.size>16384)throw Error('Limitdatei überschreitet 16 KB');return normalizeHermesSnapshot(JSON.parse(await fs.readFile(file,'utf8')));}catch(error){if(error.code!=='ENOENT')warnings.push(`${file}: ${error.code||error.message}`);return null;}}
export async function readHermesLimits(roots,warnings=[]){let latest=null;for(const root of roots||[]){const limit=await read(path.join(root,HERMES_LIMIT_FILE),warnings);if(limit&&(!latest||limit.observedAt>latest.observedAt))latest=limit;}return latest;}
export async function readHermesLimitInbox(roots,warnings=[]){const entries=[];for(const root of roots||[]){const dir=path.join(root,HERMES_LIMIT_INBOX);let files;try{files=await fs.readdir(dir,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')warnings.push(`${dir}: ${error.code||error.message}`);continue;}for(const entry of files){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;const file=path.join(dir,entry.name),limit=await read(file,warnings);if(limit)entries.push({file,limit});}}entries.sort((a,b)=>a.limit.observedAt.localeCompare(b.limit.observedAt)||a.file.localeCompare(b.file));return entries;}
export async function removeHermesLimitInbox(entries,warnings=[]){for(const {file} of entries)try{await fs.unlink(file);}catch(error){if(error.code!=='ENOENT')warnings.push(`${file}: ${error.code||error.message}`);}}
