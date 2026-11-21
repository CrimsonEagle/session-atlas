import {execFile} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FULL_THRESHOLD=0.9995;
const MAX_DATE_MS=8.64e15;
const WINDOW_MINUTES={ '5h':300, weekly:10080 };
const DEFAULT_TIMEOUT_MS=90_000;
const DEFAULT_MAX_BUFFER=2*1024*1024;

export class AntigravityLimitError extends Error {
 constructor(code,message) {super(message);this.name='AntigravityLimitError';this.code=code;}
}

const finite=v=>typeof v==='number'&&Number.isFinite(v);

function parseResetSeconds(raw) {
 if(typeof raw!=='string'||!raw.trim())return null;
 const ms=Date.parse(raw);
 return Number.isFinite(ms)&&ms>0&&ms<=MAX_DATE_MS?Math.floor(ms/1000):null;
}

function extractJsonObject(stdout) {
 const text=String(stdout||'').trim();
 if(!text)throw new AntigravityLimitError('AGY_PARSE_ERROR','Antigravity-CLI lieferte keine Ausgabe.');
 try{return JSON.parse(text);}catch{}
 const lines=text.split(/\r?\n/);
 for(let i=lines.length-1;i>=0;i--) {
  const line=lines[i].trim();
  if(!line.startsWith('{'))continue;
  try{return JSON.parse(line);}catch{}
 }
 throw new AntigravityLimitError('AGY_PARSE_ERROR','Ausgabe der Antigravity-CLI konnte nicht als JSON gelesen werden.');
}

function normalizeBucket(raw,groupName) {
 const id=typeof raw?.id==='string'?raw.id.trim():'';
 const frac=Number(raw?.remaining_fraction??raw?.remainingFraction);
 if(!id||!Number.isFinite(frac))return null;
 const remaining=Math.max(0,Math.min(1,frac));
 const full=remaining>=FULL_THRESHOLD;
 const usedPercent=full?0:Math.round((1-remaining)*10000)/100;
 const windowName=typeof raw.window==='string'?raw.window.trim().toLowerCase():'';
 const windowMinutes=WINDOW_MINUTES[windowName]??null;
 const resetSec=full?null:(typeof raw.resets_at==='number'&&Number.isSafeInteger(raw.resets_at)&&raw.resets_at>0?raw.resets_at:parseResetSeconds(raw.reset_time??raw.resetTime));
 return {
  id,
  bucketId:id,
  groupName:String(groupName||'').trim(),
  name:typeof raw.name==='string'?raw.name.trim():id,
  description:typeof raw.description==='string'?raw.description.trim():'',
  window:windowName||'unknown',
  window_minutes:windowMinutes,
  remaining_fraction:remaining,
  used_percent:usedPercent,
  resets_at:resetSec,
  full
 };
}

function selectPrimaryPair(groups) {
 const all=groups.flatMap(g=>g.buckets);
 const gemini=groups.find(g=>/gemini/i.test(g.name)&&!/argon/i.test(g.name))||groups[0];
 const pick=(minutes,preferred)=>{
  const list=preferred?preferred.buckets:all;
  const hit=list.find(b=>b.window_minutes===minutes)||all.find(b=>b.window_minutes===minutes);
  return hit?{window_minutes:hit.window_minutes,used_percent:hit.used_percent,resets_at:hit.resets_at,bucketId:hit.id,groupName:hit.groupName,full:hit.full}:null;
 };
 return [pick(300,gemini),pick(10080,gemini)];
}

export function parseAntigravityUsageOutput(stdout,observedAtIso=new Date().toISOString()) {
 const parsed=extractJsonObject(stdout);
 if(parsed?.status!=='SUCCESS') {
  const detail=typeof parsed?.error==='string'&&parsed.error.trim()?`: ${parsed.error.trim().slice(0,200)}`:'';
  throw new AntigravityLimitError('AGY_FAILED',`Antigravity-CLI meldete keinen Erfolg${detail}`);
 }
 if(parsed?.command?.name!=='usage'||!Array.isArray(parsed?.command?.data?.groups)) {
  throw new AntigravityLimitError('AGY_PARSE_ERROR','Antigravity-Usage-Antwort enthält keine gültigen Kontingentgruppen.');
 }
 const observedMs=Date.parse(observedAtIso),observedAt=Number.isFinite(observedMs)?new Date(observedMs).toISOString():new Date().toISOString();
 const groups=[];
 for(const rawGroup of parsed.command.data.groups) {
  if(!rawGroup||typeof rawGroup!=='object'||!Array.isArray(rawGroup.buckets))continue;
  const name=typeof rawGroup.name==='string'&&rawGroup.name.trim()?rawGroup.name.trim():'Antigravity';
  const description=typeof rawGroup.description==='string'?rawGroup.description.trim():'';
  const buckets=rawGroup.buckets.map(b=>normalizeBucket(b,name)).filter(Boolean);
  if(buckets.length)groups.push({name,description,buckets});
 }
 if(!groups.length)throw new AntigravityLimitError('AGY_PARSE_ERROR','Antigravity-Usage-Antwort enthält keine lesbaren Buckets.');
 const [primary,secondary]=selectPrimaryPair(groups);
 const historyBuckets=groups.flatMap(g=>g.buckets.filter(b=>b.window_minutes===300||b.window_minutes===10080).map(b=>({
  bucketId:b.id,groupName:g.name,window:b.window,window_minutes:b.window_minutes,used_percent:b.used_percent,resets_at:b.resets_at,full:b.full
 })));
 return {
  version:1,
  limit_id:'antigravity',
  source:'antigravity-cli',
  plan_type:'',
  observedAt,
  description:typeof parsed.command.data.description==='string'?parsed.command.data.description.trim():'',
  primary,
  secondary,
  groups,
  buckets:historyBuckets
 };
}

export function normalizeAntigravityLimit(state) {
 if(!state||state.version!==1||state.limit_id!=='antigravity'||typeof state.observedAt!=='string'||!Number.isFinite(Date.parse(state.observedAt)))return null;
 if(!Array.isArray(state.groups)||!state.groups.length)return null;
 const groups=[];
 for(const rawGroup of state.groups) {
  if(!rawGroup||typeof rawGroup!=='object'||!Array.isArray(rawGroup.buckets))continue;
  const name=typeof rawGroup.name==='string'&&rawGroup.name.trim()?rawGroup.name.trim():'Antigravity';
  const description=typeof rawGroup.description==='string'?rawGroup.description.trim():'';
  const buckets=[];
  for(const b of rawGroup.buckets) {
   const id=typeof b?.id==='string'?b.id.trim():typeof b?.bucketId==='string'?b.bucketId.trim():'';
   const used=Number(b?.used_percent);
   if(!id||!Number.isFinite(used)||used<0||used>100)continue;
   const windowName=typeof b.window==='string'?b.window.trim().toLowerCase():'unknown';
   const windowMinutes=b.window_minutes===300||b.window_minutes===10080?b.window_minutes:(WINDOW_MINUTES[windowName]??null);
   const remaining=finite(b.remaining_fraction)?Math.max(0,Math.min(1,b.remaining_fraction)):Math.max(0,Math.min(1,1-used/100));
   const full=b.full===true||remaining>=FULL_THRESHOLD;
   const resetsAt=full?null:(Number.isSafeInteger(b.resets_at)&&b.resets_at>0?b.resets_at:null);
   buckets.push({
    id,bucketId:id,groupName:name,
    name:typeof b.name==='string'&&b.name.trim()?b.name.trim():id,
    description:typeof b.description==='string'?b.description.trim():'',
    window:windowName,window_minutes:windowMinutes,remaining_fraction:remaining,
    used_percent:full?0:used,resets_at:resetsAt,full
   });
  }
  if(buckets.length)groups.push({name,description,buckets});
 }
 if(!groups.length)return null;
 const [primary,secondary]=selectPrimaryPair(groups);
 const historyBuckets=groups.flatMap(g=>g.buckets.filter(b=>b.window_minutes===300||b.window_minutes===10080).map(b=>({
  bucketId:b.id,groupName:g.name,window:b.window,window_minutes:b.window_minutes,used_percent:b.used_percent,resets_at:b.resets_at,full:b.full
 })));
 return {
  version:1,
  limit_id:'antigravity',
  source:typeof state.source==='string'&&state.source?state.source:'antigravity-cli',
  plan_type:typeof state.plan_type==='string'?state.plan_type.slice(0,80):'',
  observedAt:new Date(state.observedAt).toISOString(),
  description:typeof state.description==='string'?state.description:'',
  primary,
  secondary,
  groups,
  buckets:historyBuckets
 };
}

export function resolveAgyBinary(env=process.env,platform=process.platform,home=os.homedir()) {
 if(typeof env?.AGY_BIN==='string'&&env.AGY_BIN.trim())return env.AGY_BIN.trim();
 if(platform==='win32') {
  const localAppData=env?.LOCALAPPDATA||path.join(home,'AppData','Local');
  const candidates=[
   path.join(localAppData,'agy','bin','agy.exe'),
   path.join(env?.HOME||home,'.gemini','antigravity-cli','bin','agy.exe')
  ];
  for(const candidate of candidates) {
   try{if(fs.statSync(candidate).isFile())return candidate;}catch{}
  }
 }
 return 'agy';
}

export async function fetchAntigravityLimits({bin,timeoutMs,env=process.env,now=()=>new Date().toISOString()}={}) {
 const command=bin||resolveAgyBinary(env);
 const timeout=Number.isFinite(Number(timeoutMs))&&Number(timeoutMs)>0?Number(timeoutMs):(Number(env?.AGY_USAGE_TIMEOUT_MS)||DEFAULT_TIMEOUT_MS);
 const stdout=await new Promise((resolve,reject)=>{
  execFile(command,['-p','/usage','--output-format','json'],{timeout,maxBuffer:DEFAULT_MAX_BUFFER,windowsHide:true,env},(error,out,err)=>{
   if(!error)return resolve(out);
   if(error.code==='ENOENT')return reject(new AntigravityLimitError('AGY_NOT_FOUND','Antigravity-CLI (agy) nicht gefunden – bitte installieren oder AGY_BIN setzen.'));
   if(error.killed||error.signal)return reject(new AntigravityLimitError('AGY_TIMEOUT',`Antigravity-Usage-Abruf nach ${Math.round(timeout/1000)} s abgebrochen.`));
   const firstLine=String(err||error.message||'').split(/\r?\n/).map(line=>line.trim()).find(Boolean)||'Unbekannter Fehler';
   reject(new AntigravityLimitError('AGY_FAILED',`Antigravity-Usage-Abruf fehlgeschlagen (${error.code??'Fehler'}): ${firstLine.slice(0,260)}`));
  });
 });
 return parseAntigravityUsageOutput(stdout,now());
}

export function createAntigravityLimitPoller({getSettings,onLimit,fetcher=fetchAntigravityLimits,initialDelayMs=10_000,minManualIntervalMs=30_000,now=()=>Date.now()}={}) {
 let timer=null,startupTimer=null,stopped=false,inFlight=null,lastAttemptAt=null,lastSuccessAt=null,lastError=null,lastSuccessMs=0;
 const envOverride=process.env.AGY_USAGE_POLL_MINUTES;
 const pollMinutes=()=>{
  if(envOverride!==undefined&&envOverride!==''){const n=Number(envOverride);if(Number.isInteger(n)&&n>=0)return n;}
  const configured=Number(getSettings?.()?.antigravityLimitPollMinutes);
  return Number.isInteger(configured)&&configured>=0?configured:15;
 };
 const isActive=()=>{
  const s=getSettings?.()||{};
  return pollMinutes()>0&&!(s.hiddenProviders||[]).includes('antigravity')&&(s.antigravityRoots||[]).length>0;
 };
 const clearTimers=()=>{if(timer){clearInterval(timer);timer=null;}if(startupTimer){clearTimeout(startupTimer);startupTimer=null;}};
 const schedule=()=>{
  clearTimers();
  if(stopped||!isActive())return;
  const minutes=pollMinutes();
  timer=setInterval(()=>{refresh({force:false}).catch(()=>{});},minutes*60_000);
  timer.unref?.();
 };
 async function refresh({force=false}={}) {
  if(inFlight)return inFlight;
  const minutes=pollMinutes();
  if(!force&&!isActive())return {skipped:true,status:status()};
  if(force&&lastSuccessMs&&now()-lastSuccessMs<minManualIntervalMs)return {throttled:true,status:status()};
  lastAttemptAt=new Date(now()).toISOString();
  const run=(async()=>{
   try {
    const limit=await fetcher();
    lastSuccessMs=now();
    lastSuccessAt=new Date(lastSuccessMs).toISOString();
    lastError=null;
    await onLimit?.(limit);
    return {ok:true,limit,status:status()};
   }catch(error) {
    lastError={code:error?.code||'AGY_FAILED',message:error?.message||String(error),at:new Date(now()).toISOString()};
    return {ok:false,error:lastError,status:status()};
   }finally {
    inFlight=null;
   }
  })();
  inFlight=run;
  return run;
 }
 function status() {
  const minutes=pollMinutes(),enabled=minutes>0;
  return {enabled,active:isActive(),pollMinutes:minutes,inFlight:Boolean(inFlight),lastAttemptAt,lastSuccessAt,error:lastError};
 }
 function start() {
  stopped=false;
  schedule();
  if(isActive()) {
   startupTimer=setTimeout(()=>{startupTimer=null;if(!stopped&&isActive())refresh({force:false}).catch(()=>{});},initialDelayMs);
   startupTimer.unref?.();
  }
 }
 function configure() {schedule();}
 function stop() {stopped=true;clearTimers();}
 return {start,configure,stop,refresh,status};
}
