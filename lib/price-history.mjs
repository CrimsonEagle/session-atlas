import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {costForRates,effectiveRates,PRICING_RULE_VERSION} from './pricing.mjs';

const iso=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const clone=value=>JSON.parse(JSON.stringify(value));
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
const stable=value=>JSON.stringify(canonical(value));
const snapshotId=value=>'price-'+createHash('sha256').update(stable(value)).digest('hex').slice(0,16);
function validRates(rates){return rates&&typeof rates==='object'&&!Array.isArray(rates)&&Object.entries(rates).every(([name,row])=>name.length<=160&&Array.isArray(row)&&row.length>=3&&row.length<=5&&row.every(value=>value===null||(Number.isFinite(value)&&value>=0&&value<=100000)));}

export class PriceHistory {
 constructor(file){this.file=file;this.snapshots=[];this.fetches=[];}
 async load(){
  this.snapshots=[];this.fetches=[];
  try{
   const saved=JSON.parse(await fs.readFile(this.file,'utf8'));if(saved.version!==1)return;
   this.snapshots=(saved.snapshots||[]).filter(item=>item&&typeof item.id==='string'&&iso(item.validFrom)&&iso(item.recordedAt)&&validRates(item.rates)&&typeof item.ruleVersion==='string').map(clone).sort((a,b)=>a.validFrom.localeCompare(b.validFrom)||a.recordedAt.localeCompare(b.recordedAt));
   this.fetches=(saved.fetches||[]).filter(item=>item&&iso(item.fetchedAt)&&Array.isArray(item.sources)).map(clone);
  }catch{}
 }
 async save(){await fs.mkdir(path.dirname(this.file),{recursive:true});const next=JSON.stringify({version:1,snapshots:this.snapshots,fetches:this.fetches});await fs.writeFile(this.file+'.tmp',next);await fs.rename(this.file+'.tmp',this.file);}
 async capture({overrides={},validFrom=new Date().toISOString(),source='local',sourceDetails={},remote}={}){
  const when=iso(validFrom);if(!when)throw Error('Ungültiger Gültigkeitsbeginn für den Preisstand.');
  const rates=effectiveRates(overrides,remote),basis={validFrom:when,ruleVersion:PRICING_RULE_VERSION,rates,manualOverrides:clone(overrides)};
  const id=snapshotId(basis),existing=this.snapshots.find(item=>item.id===id);
  if(existing)return existing;
  const entry={id,recordedAt:new Date().toISOString(),validFrom:when,source,sourceDetails:clone(sourceDetails),ruleVersion:PRICING_RULE_VERSION,rates:clone(rates),manualOverrides:clone(overrides)};
  this.snapshots.push(entry);this.snapshots.sort((a,b)=>a.validFrom.localeCompare(b.validFrom)||a.recordedAt.localeCompare(b.recordedAt));await this.save();return entry;
 }
 async recordFetch(sources){const entry={fetchedAt:new Date().toISOString(),sources:clone(sources||[])};this.fetches.push(entry);await this.save();return entry;}
 resolve(time){const at=iso(time);if(!at)return null;let found=null;for(const item of this.snapshots){if(item.validFrom<=at)found=item;else break;}return found;}
 latest(){return this.snapshots.at(-1)||null;}
 evaluateSnapshot(event,id){if(Number.isFinite(event.reportedCost))return {cost:event.reportedCost,priceSnapshotId:null,pricingRuleVersion:'hermes-reported'};const snapshot=this.snapshots.find(item=>item.id===id);return {cost:snapshot?costForRates(event,snapshot.rates):null,priceSnapshotId:snapshot?.id||null,pricingRuleVersion:snapshot?.ruleVersion||null};}
 evaluate(event,mode='current',overrides={}){
  if(mode==='historical'){
   const snapshot=this.resolve(event.time);return {cost:snapshot?costForRates(event,snapshot.rates):null,pricingMode:'historical',priceSnapshotId:snapshot?.id||null,pricingRuleVersion:snapshot?.ruleVersion||null,priceMissingReason:snapshot?null:'no-historical-snapshot'};
  }
  const snapshot=this.latest(),table=effectiveRates(overrides);
  return {cost:costForRates(event,table),pricingMode:'current',priceSnapshotId:snapshot?.id||null,pricingRuleVersion:PRICING_RULE_VERSION,priceMissingReason:null};
 }
 status(){return {ruleVersion:PRICING_RULE_VERSION,snapshots:this.snapshots.map(({rates,manualOverrides,...item})=>({...item,modelCount:Object.keys(rates).length,manualModelCount:Object.keys(manualOverrides||{}).length})),fetches:this.fetches.slice(-50)};}
}
