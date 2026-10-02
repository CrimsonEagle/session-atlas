// USD / million tokens. Snapshot 2026-10-02. Never guess prices for unknown aliases.
// Sources: https://developers.openai.com/api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
import {remotePrices} from './price-sync.mjs';
export const priceDate = '2026-10-02';
export const rates = {
 'gpt-6-astra': [10,1,50,12.5], 'gpt-5.6-sol': [4,.4,20,5],
 'gpt-5.6-terra': [2,.2,12,2.5], 'gpt-5.6-luna': [.2,.02,1.2,.25],
 'gpt-5-codex': [1.25,.125,10], 'gpt-5.5': [5,.5,30],
 'claude-opus-4-8': [5,.5,25,6.25,10], 'claude-opus-4-7': [5,.5,25,6.25,10],
 'claude-opus-4-6': [5,.5,25,6.25,10], 'claude-opus-4-5': [5,.5,25,6.25,10],
 'claude-opus-4-1': [15,1.5,75,18.75,30], 'claude-opus-4': [15,1.5,75,18.75,30],
 'claude-sonnet-4-6': [3,.3,15,3.75,6], 'claude-sonnet-4-5': [3,.3,15,3.75,6],
 'claude-sonnet-4': [3,.3,15,3.75,6], 'claude-haiku-4-5': [1,.1,5,1.25,2],
 'claude-opus-5-5': [4,.2,20,5,8], 'claude-opus-5': [5,.5,25,6.25,10],
 'claude-sonnet-5-5': [2,.2,10,2.5,4], 'claude-sonnet-5': [2,.2,10,2.5,4],
 'claude-fable-5-1': [10,.25,50,12.5,20], 'claude-fable-5': [10,1,50,12.5,20],
 // Retired models still appear in old logs under their dated legacy names.
 'claude-3-7-sonnet': [3,.3,15,3.75,6], 'claude-3-5-sonnet': [3,.3,15,3.75,6],
 'claude-3-5-haiku': [.8,.08,4,1,1.6], 'claude-3-opus': [15,1.5,75,18.75,30],
 'claude-3-haiku': [.25,.03,1.25,.3,.5]
};
// Fast mode bills a model-specific multiple of the standard rate; models without an entry have no
// published fast price, so their fast responses stay unpriced instead of being guessed.
const FAST_MODE_FACTORS={'claude-opus-4-8':2,'claude-opus-5':2,'claude-opus-5-5':2};
const own=(object,key)=>Object.hasOwn(object||{},key)?object[key]:undefined;
export const PRICING_RULE_VERSION='2026-10-02-v1';
export function effectiveRates(overrides={},remote=remotePrices()) {
 return {...rates,...remote,...overrides};
}
export function resolveRate(modelName,table) {
 const model=String(modelName||'unknown').replace(/-\d{8}$/, '');
 return own(table,modelName)??own(table,model);
}
export function costForRates(e,table) {
 const model=e.model.replace(/-\d{8}$/, '');
 const r=resolveRate(e.priceModel||e.model,table);
 if(!r) return null;
 let [input,cache,output,write=input,writeHour=write]=r;
 if((e.cache>0 && cache===null)||(e.write-e.writeHour>0 && write===null)||(e.writeHour>0 && writeHour===null))return null;
 // Current GPT models use long-context pricing above 272k input tokens.
 // Session-level aggregates cannot establish whether any individual request crossed the threshold.
 if(!e.aggregateUsage&&!e.priceModel&&(model.startsWith('gpt-6-')||model.startsWith('gpt-5.6-')||model==='gpt-5.5') && e.input+e.cache+e.write>272000) {input*=2;cache*=2;write*=2;output*=1.5;}
 let factor=1;
 if(['priority','fast'].includes(e.tier)) {
  if(model.startsWith('gpt-6-')||model.startsWith('gpt-5.6-')) factor=2;
  else if(Object.hasOwn(FAST_MODE_FACTORS,model)) factor=FAST_MODE_FACTORS[model];
  else return null;
 }
 if(e.geo==='us') factor*=1.1;
 return (e.input*input+e.cache*cache+e.output*output+Math.max(0,e.write-e.writeHour)*write+e.writeHour*writeHour)*factor/1e6;
}
export function costFor(e,overrides={}) {return costForRates(e,effectiveRates(overrides));}
