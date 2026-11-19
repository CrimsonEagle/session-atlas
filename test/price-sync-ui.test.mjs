import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {translateGerman} from '../public/i18n.js';

async function loadPriceSyncHelpers(overrides={}) {
 const app=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('function updatePriceSyncUI(){'),end=app.indexOf('\nfunction priceHistoryPanel()',start);
 assert.ok(start>=0&&end>start,'price sync helpers must exist in public/app.js');
 const buttons=overrides.buttons||[];
 const elements=overrides.elements||{};
 const calls=[];
 const context={
  document:{querySelectorAll:selector=>selector==='[data-sync-prices]'?buttons:[]},
  $:selector=>elements[selector]||null,
  num:n=>String(n),
  priceStatusText:()=>'cache-status',
  priceSyncBusy:false,
  priceSyncMessage:'',
  config:{pricing:null,rates:{},priceHistory:null},
  data:null,
  limitHistoryCache:new Map([['codex',[]]]),
  sessionDetailCache:new Map([['s1',{}]]),
  toast:msg=>calls.push(['toast',msg]),
  error:msg=>calls.push(['error',msg]),
  render:()=>calls.push(['render']),
  detailViews:{dataChanged:()=>calls.push(['detailViews.dataChanged'])},
  api:async(url,body)=>{
   calls.push(['api',url,body===undefined?null:JSON.parse(JSON.stringify(body))]);
   if(overrides.api)return overrides.api(url,body);
   if(url==='/api/prices/sync')return {pricing:{modelCount:42,sources:[]},rates:{'gemini-4-neon':[3,.15,15]},priceHistory:{snapshots:[]},warnings:[]};
   if(url==='/api/snapshot')return {sessions:[{id:'s1',events:[{cost:0.1}]}]};
   throw Error(`unexpected ${url}`);
  },
  ...overrides.context
 };
 vm.runInNewContext(`${app.slice(start,end)}\nthis.updatePriceSyncUI=updatePriceSyncUI;this.priceNoticeMarkup=priceNoticeMarkup;this.syncPublicPrices=syncPublicPrices;`,context);
 return {context,calls};
}

test('unknown-price banner includes price update button alongside model details',async()=>{
 const {context}=await loadPriceSyncHelpers();
 assert.equal(context.priceNoticeMarkup(0),'');
 const idle=context.priceNoticeMarkup(7);
 assert.match(idle,/Für 7 Modellantworten fehlt ein verlässlicher Preis/);
 assert.match(idle,/data-sync-prices[^>]*>Preise aktualisieren<\/button>/);
 assert.match(idle,/id="price-details">Modelle anzeigen<\/button>/);
 context.priceSyncBusy=true;
 const busy=context.priceNoticeMarkup(7);
 assert.match(busy,/data-sync-prices disabled>Preise werden abgerufen …<\/button>/);
 assert.equal(translateGerman('Preise aktualisieren'),'Update prices');
 assert.equal(translateGerman('Preise werden abgerufen …'),'Fetching prices…');
});

test('banner price sync updates rates, clears caches, re-renders immediately and reports errors outside settings',async()=>{
 const bannerButton={disabled:false,textContent:'Preise aktualisieren'};
 const {context,calls}=await loadPriceSyncHelpers({buttons:[bannerButton]});
 await context.syncPublicPrices();
 assert.equal(context.priceSyncBusy,false);
 assert.equal(bannerButton.disabled,false);
 assert.equal(bannerButton.textContent,'Preise aktualisieren');
 assert.deepEqual(context.config.rates,{'gemini-4-neon':[3,.15,15]});
 assert.deepEqual(context.data,{sessions:[{id:'s1',events:[{cost:0.1}]}]});
 assert.equal(context.limitHistoryCache.size,0);
 assert.equal(context.sessionDetailCache.size,0);
 assert.deepEqual(calls,[
  ['api','/api/prices/sync',{}],
  ['error',''],
  ['toast','Preise aktualisiert und lokal gespeichert.'],
  ['api','/api/snapshot',null],
  ['render'],
  ['detailViews.dataChanged']
 ]);

 const failing=await loadPriceSyncHelpers({
  buttons:[bannerButton],
  api:async()=>{throw Error('Offline');}
 });
 await failing.context.syncPublicPrices();
 assert.equal(failing.context.priceSyncBusy,false);
 assert.equal(bannerButton.disabled,false);
 assert.equal(failing.context.priceSyncMessage,'Offline');
 assert.ok(failing.calls.some(([kind,msg])=>kind==='error'&&msg==='Offline'));
});
