#!/usr/bin/env node
// Independent five-minute collector. Persist *only* changed, validated account-limit values.
// The immutable inbox survives Atlas downtime; the snapshot is the comparison baseline.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HERMES_LIMIT_FILE,HERMES_LIMIT_INBOX,normalizeHermesUsage} from '../lib/hermes-limits.mjs';

export function equivalent(a,b){return JSON.stringify({plan:a?.plan_type,primary:a?.primary,secondary:a?.secondary})===JSON.stringify({plan:b?.plan_type,primary:b?.primary,secondary:b?.secondary});}
async function atomic(file,data){const tmp=path.join(path.dirname(file),`.${path.basename(file)}.${randomUUID()}.tmp`);try{await fs.writeFile(tmp,JSON.stringify(data),{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}}
export async function collect({home=process.env.HERMES_HOME||path.join(os.homedir(),'.hermes'),cli=process.env.ATLAS_HERMES_CLI||'hermes',fetchUsage}={}){
 const response=fetchUsage?await fetchUsage():await new Promise((resolve,reject)=>{
  const child=spawn(cli,['usage','--provider','openai-codex','--json'],{stdio:['ignore','pipe','pipe'],env:process.env});let output='',errors='',done=false;
  const timer=setTimeout(()=>child.kill('SIGKILL'),25000);timer.unref();
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>128*1024)child.kill('SIGKILL');});
  child.stderr.on('data',chunk=>{errors+=chunk.toString().slice(0,1024);});
  child.on('error',err=>{clearTimeout(timer);if(!done){done=true;reject(Error(`Hermes-CLI nicht ausführbar: ${err.code||err.message}`));}});
  child.on('close',code=>{clearTimeout(timer);if(done)return;done=true;code===0?resolve(output):reject(Error(`Hermes-Usage-Abruf fehlgeschlagen (${code??'Timeout'}). ${errors.slice(0,180)}`));});
 });
 let raw;try{raw=JSON.parse(response);}catch{throw Error('Hermes-Usage: ungültiges JSON.');}
 const normalized=normalizeHermesUsage(raw);if(!normalized)throw Error('Hermes-Usage: keine gültigen Codex-Limitfenster.');
 const file=path.join(home,HERMES_LIMIT_FILE),inbox=path.join(home,HERMES_LIMIT_INBOX);let previous=null;
 try{previous=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Hermes-Limit-Snapshot kann nicht gelesen werden.');}
 if(equivalent(previous,normalized))return {changed:false};
 const state={...normalized,version:1,observedAt:new Date().toISOString()},name=`${Date.now()}-${randomUUID()}.json`;
 await fs.mkdir(inbox,{recursive:true,mode:0o700});
 // The inbox goes first: a crash before replacing the snapshot can only create a safe duplicate.
 await atomic(path.join(inbox,name),state);
 await atomic(file,state);
 return {changed:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))collect().then(result=>{if(result.changed)console.log('Hermes-Limits geändert.');}).catch(error=>{console.error(error.message);process.exitCode=1;});
