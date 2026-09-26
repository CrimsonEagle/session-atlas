import fs from 'node:fs/promises';
import path from 'node:path';

const sources = [
 {id:'modelsdev',name:'models.dev',url:'https://models.dev/api.json'},
 {id:'litellm',name:'LiteLLM',url:'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'},
 {id:'openrouter',name:'OpenRouter',url:'https://openrouter.ai/api/v1/models'}
];
let cache = {version:1,sources:{}};
let prices = {};
let pending = null;
const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100000;
const supported = name => (/^(claude-|gpt-|o[134](?:-|$)|codex-)/.test(name) && !name.includes('/') || /^openrouter:[a-z0-9][a-z0-9_.:/-]*$/i.test(name)) && name.length < 200;
const rate = (value,scale=1) => valid(value) && valid(value*scale) ? value*scale : null;
const perToken=value=>value===null||value===undefined||value===''?null:rate(Number(value),1e6);

export function parsePrices(id,data) {
 const result = {};
 const add = (name,row) => {
  // Zero-price catalog placeholders must not overwrite known paid models.
  if(supported(name) && (id==='openrouter'?row[0]!==null&&row[2]!==null:row[0]>0&&row[2]>0)) result[name] = row;
 };
 if(id === 'litellm') {
  for(const [key,m] of Object.entries(data)) {
   if(!m || !['anthropic','openai'].includes(m.litellm_provider) || m.mode !== 'chat') continue;
   const name=key.replace(/^(anthropic|openai)\//,'');
   add(name,[m.input_cost_per_token,m.cache_read_input_token_cost,m.output_cost_per_token,m.cache_creation_input_token_cost,m.cache_creation_input_token_cost_above_1hr].map(v=>rate(v,1e6)));
  }
 } else if(id==='openrouter') {
  for(const model of data.data||[]){
   if(typeof model.id!=='string'||!model.pricing||Number(model.pricing.request||0)>0)continue;
   const price=model.pricing,read=perToken(price.cache_read??price.cached_prompt??price.input_cache_read),write=perToken(price.cache_write??price.cache_creation??price.input_cache_write),input=perToken(price.prompt),output=perToken(price.completion);
   add(`openrouter:${model.id}`,[input,read??(input===0&&output===0?0:null),output,write??(input===0&&output===0?0:null),write??(input===0&&output===0?0:null)]);
  }
 } else {
  for(const provider of ['anthropic','openai']) for(const [name,m] of Object.entries(data[provider]?.models || {})) {
   const c=m.cost;if(!c)continue;
   add(name,[rate(c.input),rate(c.cache_read),rate(c.output),rate(c.cache_write),provider==='anthropic' && valid(c.input)?rate(c.input*2):rate(c.cache_write)]);
  }
 }
 if(!Object.keys(result).length) throw Error('Keine gültigen Modellpreise gefunden.');
 return result;
}

function rebuild() {
 prices={};
 // Newer source snapshots win; LiteLLM wins ties because it includes cache TTLs.
 for(const source of sources.map(s=>cache.sources[s.id]).filter(Boolean).sort((a,b)=>a.fetchedAt.localeCompare(b.fetchedAt))) {
  for(const [name,row] of Object.entries(source.rates)) {
   const previous=prices[name];
   prices[name]=row.map((value,i)=>value ?? previous?.[i] ?? null);
  }
 }
}
export function remotePrices() {return prices;}
export function priceSyncStatus() {
 return {modelCount:Object.keys(prices).length,sources:sources.map(s=>({name:s.name,url:s.url,fetchedAt:cache.sources[s.id]?.fetchedAt || null,modelCount:Object.keys(cache.sources[s.id]?.rates || {}).length}))};
}
export async function loadPriceCache(dataDir) {
 cache={version:1,sources:{}};prices={};
 try {
  const saved=JSON.parse(await fs.readFile(path.join(dataDir,'model-prices.json'),'utf8'));
  if(saved.version!==1)return;
  for(const s of sources) {
   const entry=saved.sources?.[s.id];
   if(!entry || !Number.isFinite(Date.parse(entry.fetchedAt)))continue;
   const rows=Object.entries(entry.rates || {});
   if(rows.length && rows.every(([name,row])=>supported(name)&&Array.isArray(row)&&row.length===5&&row.every(v=>v===null||valid(v))&&row[0]!==null&&row[2]!==null))cache.sources[s.id]=entry;
  }
  rebuild();
 } catch { /* An absent or damaged cache leaves the bundled prices available. */ }
}
async function download(source) {
 const response=await fetch(source.url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'},redirect:'error'});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 const chunks=[];let size=0;
 for await(const chunk of response.body) {
  size+=chunk.length;if(size>32*1024*1024)throw Error('Preisdatei ist zu groß.');chunks.push(chunk);
 }
 return parsePrices(source.id,JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
export async function syncPrices(dataDir) {
 if(pending)return pending;
 pending=(async()=>{
  const results=await Promise.allSettled(sources.map(download));
  const next={version:1,sources:{...cache.sources}},warnings=[],updated=[];
  const fetchedAt=new Date().toISOString();
  results.forEach((result,i)=>{
   const source=sources[i];
   if(result.status==='fulfilled') {next.sources[source.id]={fetchedAt,rates:result.value};updated.push(source.name);}
   else warnings.push(`${source.name}: ${result.reason?.message || 'Abruf fehlgeschlagen'}`);
  });
  if(!updated.length)throw Error(`Preise konnten nicht abgerufen werden. Bisherige Preise bleiben erhalten. ${warnings.join(' · ')}`);
  await fs.mkdir(dataDir,{recursive:true});
  const file=path.join(dataDir,'model-prices.json');
  await fs.writeFile(file+'.tmp',JSON.stringify(next));await fs.rename(file+'.tmp',file);
  cache=next;rebuild();
  return {pricing:priceSyncStatus(),warnings,updated,fetchedAt};
 })().finally(()=>{pending=null;});
 return pending;
}
