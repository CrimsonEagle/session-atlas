// USD / million tokens. Snapshot 2026-10-02. Never guess prices for unknown aliases.
// Sources: https://developers.openai.com/api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
import {remotePrices} from './price-sync.mjs';
export const priceDate = '2026-11-19';
export const rates = {
 'gpt-6.1-sol': [2,.1,10,2.5], 'gpt-6-astra': [10,1,50,12.5],
 'gpt-6-sol': [2,.2,10,2.5], 'gpt-6-luna': [.1,.01,.5,.125], 'gpt-5.6-sol': [4,.4,20,5],
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
 'claude-3-haiku': [.25,.03,1.25,.3,.5],
 'gemini-4-neon': [3,.15,15,.083333,.083333], 'gemini-4-carbon': [2,.1,10,.1875,.1875],
 'gemini-4-argon': [2,.1,10,.1875,.1875], 'gemini-4-hydrogen': [1.5,.075,7.5,.083333,.083333],
 'gemini-3.8-flash': [.825,.0825,4.125,.041667,.041667],
 'gemini-3.7-flash': [.75,.075,3.75,.041667,.041667], 'gemini-3.6-flash': [.75,.075,3.75,.041667,.041667],
 'gemini-3.5-flash': [1.5,.15,9,.083333,.083333], 'gemini-3.5-flash-lite': [.3,.03,2.5,.083333,.083333],
 'gemini-3.1-pro-preview': [2,.2,12,.375,.375], 'gemini-3.1-pro': [2,.2,12,.375,.375],
 'gemini-3.1-flash-lite-preview': [.25,.025,1.5,.083333,.083333], 'gemini-3.1-flash-lite': [.25,.025,1.5,.083333,.083333],
 'gemini-3-flash-preview': [.5,.05,3,.083333,.083333], 'gemini-3-flash': [.5,.05,3,.083333,.083333],
 'gemini-2.5-pro': [1.25,.125,10,.375,.375], 'gemini-2.5-pro-preview': [1.25,.125,10,.375,.375],
 'gemini-2.5-flash': [.3,.03,2.5,.083333,.083333], 'gemini-2.5-flash-lite': [.1,.01,.4,.083333,.083333]
};
// Fast mode bills a model-specific multiple of the standard rate; models without an entry have no
// published fast price, so their fast responses stay unpriced instead of being guessed.
// Long-context and priority rules cover whole GPT families, including point releases such as gpt-6.1.
const GPT_TIERED_FAMILY=/^gpt-(?:6(?:\.\d+)?|5\.6)-/;
const FAST_MODE_FACTORS={'claude-opus-4-8':2,'claude-opus-5':2,'claude-opus-5-5':2};
// Antigravity and some Google logs append effort/routing suffixes such as -medium, -high or -tiered-high.
const GEMINI_VARIANT_SUFFIX=/(?:-tiered)?-(?:minimal|low|medium|high|xhigh)$|-tiered$/i;
const stripGeminiVariant=name=>{
 const base=name.replace(GEMINI_VARIANT_SUFFIX,'').replace(/-\d{8}$/,'');
 return base!==name&&/^gemini-.+/i.test(base)?base:null;
};
const own=(object,key)=>Object.hasOwn(object||{},key)?object[key]:undefined;
export const PRICING_RULE_VERSION='2026-11-19-v1';
export function effectiveRates(overrides={},remote=remotePrices()) {
 return {...rates,...remote,...overrides};
}
export function resolveRate(modelName,table) {
 const raw=String(modelName||'unknown'),model=raw.replace(/-\d{8}$/, '');
 const direct=own(table,raw)??own(table,model);
 if(direct)return direct;
 if(/^gemini-/i.test(model)) {
  const lower=model.toLowerCase(),match=own(table,lower)??own(table,`openrouter:google/${lower}`);
  if(match)return match;
  const base=stripGeminiVariant(lower);
  if(base)return own(table,base)??own(table,`openrouter:google/${base}`)??((base==='gemini-3-flash'||base==='gemini-3.1-pro')?(own(table,`${base}-preview`)??own(table,`openrouter:google/${base}-preview`)):undefined);
 }
 if(/^openrouter:google\/gemini-/i.test(model)) {
  const slug=model.toLowerCase().slice('openrouter:google/'.length),base=stripGeminiVariant(slug);
  if(base)return own(table,`openrouter:google/${base}`);
 }
 return undefined;
}
export function costForRates(e,table) {
 const model=e.model.replace(/-\d{8}$/, '');
 const r=resolveRate(e.priceModel||e.model,table);
 if(!r) return null;
 let [input,cache,output,write=input,writeHour=write]=r;
 if((e.cache>0 && cache===null)||(e.write-e.writeHour>0 && write===null)||(e.writeHour>0 && writeHour===null))return null;
 // Current GPT models use long-context pricing above 272k input tokens.
 // Session-level aggregates cannot establish whether any individual request crossed the threshold.
 if(!e.aggregateUsage&&!e.priceModel&&(GPT_TIERED_FAMILY.test(model)||model==='gpt-5.5') && e.input+e.cache+e.write>272000) {input*=2;cache*=2;write*=2;output*=1.5;}
 let factor=1;
 if(['priority','fast'].includes(e.tier)) {
  if(GPT_TIERED_FAMILY.test(model)) factor=2;
  else if(Object.hasOwn(FAST_MODE_FACTORS,model)) factor=FAST_MODE_FACTORS[model];
  else return null;
 }
 if(e.geo==='us') factor*=1.1;
 return (e.input*input+e.cache*cache+e.output*output+Math.max(0,e.write-e.writeHour)*write+e.writeHour*writeHour)*factor/1e6;
}
export function costFor(e,overrides={}) {return costForRates(e,effectiveRates(overrides));}
