import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Store} from './lib/store.mjs';
import {effectiveRates} from './lib/pricing.mjs';
import {loadPriceCache,remotePrices,priceSyncStatus,syncPrices} from './lib/price-sync.mjs';
import {startupStatus,setStartup,openBrowser} from './lib/windows.mjs';
import {PriceHistory} from './lib/price-history.mjs';
import {activeState,prepareState,activateState,activateStateId} from './lib/state-set.mjs';
import {createBackup,parseBackup,MAX_BACKUP_COMPRESSED} from './lib/backup.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataRoot=process.env.ATLAS_DATA_DIR||path.join(root,'.local');
let active=await activeState(dataRoot),dataDir=active.dir;
await loadPriceCache(dataDir);
const port=Number(process.env.ATLAS_PORT||4317);
const origin=`http://127.0.0.1:${port}`;
const token=randomBytes(32).toString('hex');
const defaultThresholds={codex:{300:[80,95],10080:[80,95]},claude:{300:[80,95],10080:[80,95]}};
const defaults={intervalSeconds:30,hiddenProviders:[],limitRetentionDays:90,limitThresholds:defaultThresholds,claudeRoots:[path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'projects')],codexRoots:[path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions'),path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'archived_sessions')],prices:{},pricingMode:'current',priceEffectiveFrom:''};
let settings={...defaults};
try {settings={...defaults,...JSON.parse(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'))};}catch{}
let priceHistory=new PriceHistory(path.join(dataDir,'price-history.json'));await priceHistory.load();
if(!priceHistory.snapshots.length)await priceHistory.capture({overrides:settings.prices,source:'upgrade',sourceDetails:{note:'Initialer lokaler Preisstand'}});
let store=new Store(path.join(dataDir,'usage-cache.json'),priceHistory);await store.load();
function validateSettings(x) {
 if(!Number.isInteger(x.intervalSeconds)||x.intervalSeconds<10||x.intervalSeconds>3600)throw Error('Aktualisierung: 10 bis 3600 Sekunden.');
 if(!Array.isArray(x.hiddenProviders)||x.hiddenProviders.some(provider=>!['codex','claude'].includes(provider)))throw Error('Ungültige Provider-Sichtbarkeit.');
 for(const k of ['claudeRoots','codexRoots'])if(!Array.isArray(x[k])||x[k].length>20||x[k].some(p=>typeof p!=='string'||!path.isAbsolute(p)||p.length>2000))throw Error('Bitte gültige absolute Ordnerpfade eintragen.');
 if(!x.prices||typeof x.prices!=='object'||Array.isArray(x.prices))throw Error('Preise müssen ein JSON-Objekt sein.');
 for(const [model,r] of Object.entries(x.prices))if(model.length>120||!Array.isArray(r)||r.length<3||r.length>5||r.some(v=>!Number.isFinite(v)||v<0||v>100000))throw Error('Preise: je Modell 3 bis 5 nichtnegative Zahlen.');
 if(!Number.isInteger(x.limitRetentionDays)||x.limitRetentionDays<30||x.limitRetentionDays>3650)throw Error('Limitverlauf: 30 bis 3650 Tage Aufbewahrung.');
 if(!['current','historical'].includes(x.pricingMode))throw Error('Ungültiger Bewertungsmodus.');
 if(x.priceEffectiveFrom&& !Number.isFinite(Date.parse(x.priceEffectiveFrom)))throw Error('Ungültiger Gültigkeitsbeginn für manuelle Preise.');
 const limitThresholds={};for(const tool of ['codex','claude']){limitThresholds[tool]={};for(const minutes of [300,10080]){const values=x.limitThresholds?.[tool]?.[minutes];if(!Array.isArray(values)||values.length<1||values.length>5||values.some(value=>!Number.isFinite(value)||value<=0||value>100))throw Error('Limitschwellen: 1 bis 5 Prozentwerte zwischen 1 und 100.');limitThresholds[tool][minutes]=[...new Set(values)].sort((a,b)=>a-b);}}
 return {intervalSeconds:x.intervalSeconds,hiddenProviders:[...new Set(x.hiddenProviders)],limitRetentionDays:x.limitRetentionDays,limitThresholds,claudeRoots:x.claudeRoots.map(p=>path.resolve(p)),codexRoots:x.codexRoots.map(p=>path.resolve(p)),prices:x.prices,pricingMode:x.pricingMode,priceEffectiveFrom:x.priceEffectiveFrom?new Date(x.priceEffectiveFrom).toISOString():''};
}
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/activity-calendar.js':['activity-calendar.js','text/javascript; charset=utf-8'],'/analytics-core.js':['analytics-core.js','text/javascript; charset=utf-8'],'/charts.js':['charts.js','text/javascript; charset=utf-8'],'/comparison.js':['comparison.js','text/javascript; charset=utf-8'],'/context-history.js':['context-history.js','text/javascript; charset=utf-8'],'/details.js':['details.js','text/javascript; charset=utf-8'],'/limit-history.js':['limit-history.js','text/javascript; charset=utf-8'],'/polling.js':['polling.js','text/javascript; charset=utf-8'],'/session-label.js':['session-label.js','text/javascript; charset=utf-8'],'/tasks.js':['tasks.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/details.css':['details.css','text/css; charset=utf-8'],'/app-icon.png':['app-icon.png','image/png'],'/favicon.png':['favicon.png','image/png'],'/favicon.svg':['favicon.svg','image/svg+xml']};
staticFiles['/background.js']=['background.js','text/javascript; charset=utf-8'];
staticFiles['/session-tree.js']=['session-tree.js','text/javascript; charset=utf-8'];
staticFiles['/session-row.js']=['session-row.js','text/javascript; charset=utf-8'];
staticFiles['/background.css']=['background.css','text/css; charset=utf-8'];
staticFiles['/pixi-background.js']=['pixi-background.js','text/javascript; charset=utf-8'];
staticFiles['/i18n.js']=['i18n.js','text/javascript; charset=utf-8'];
staticFiles['/vendor/pixi-8.21.0.mjs']=['vendor/pixi-8.21.0.mjs','text/javascript; charset=utf-8'];
staticFiles['/vendor/pixi-csp-8.21.0.mjs']=['vendor/pixi-csp-8.21.0.mjs','text/javascript; charset=utf-8'];
let mutating=false;
const restorePlans=new Map();
async function readBody(req,max){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(Error(`Anfrage überschreitet ${Math.round(max/1024/1024)} MB.`),{statusCode:413});chunks.push(chunk);}return Buffer.concat(chunks);}
async function reloadRuntime(nextDir){
 await loadPriceCache(nextDir);let restored={...defaults,...JSON.parse(await fs.readFile(path.join(nextDir,'settings.json'),'utf8'))};restored=validateSettings(restored);
 const history=new PriceHistory(path.join(nextDir,'price-history.json'));await history.load();if(!history.snapshots.length)await history.capture({overrides:restored.prices,source:'restore-upgrade',sourceDetails:{note:'Beim Wiederherstellen ergänzter initialer Preisstand'}});
 const nextStore=new Store(path.join(nextDir,'usage-cache.json'),history);await nextStore.load();dataDir=nextDir;settings=restored;priceHistory=history;store=nextStore;
}
function mappedRestoreFiles(plan,mappings){
 if(!mappings||!Object.keys(mappings).length)return plan.files;const allowed=new Set((plan.preview.sourceRoots||[]).map(item=>item.path)),pairs=Object.entries(mappings).filter(([,value])=>value);
 if(pairs.length>20||pairs.some(([from,to])=>!allowed.has(from)||typeof to!=='string'||!path.isAbsolute(to)||to.length>2000))throw Error('Die Quellordner-Zuordnung ist ungültig.');
 const settingsFile=JSON.parse(plan.files['settings.json']),cache=JSON.parse(plan.files['usage-cache.json']),replace=value=>{for(const [from,to] of pairs){const relative=path.relative(from,value);if(relative===''||(!relative.startsWith('..')&&!path.isAbsolute(relative)))return path.join(to,relative);}return value;};
 settingsFile.claudeRoots=(settingsFile.claudeRoots||[]).map(root=>mappings[root]||root);settingsFile.codexRoots=(settingsFile.codexRoots||[]).map(root=>mappings[root]||root);
 cache.files=Object.fromEntries(Object.entries(cache.files||{}).map(([file,state])=>{const nextFile=replace(file);return [nextFile,{...state,file:nextFile}];}));
 return {...plan.files,'settings.json':JSON.stringify(settingsFile,null,2),'usage-cache.json':JSON.stringify(cache)};
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 try {
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return json(403,{error:'Ungültiger Host.'});
  if(req.headers.origin&&!([origin,`http://localhost:${port}`].includes(req.headers.origin)))return json(403,{error:'Fremder Ursprung blockiert.'});
  if(req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'Fremder Ursprung blockiert.'});
  const url=new URL(req.url,origin);
  if(req.method==='GET') {
   if(url.pathname==='/api/health')return json(200,{app:'session-atlas',version:'1.0.0'});
   if(url.pathname==='/api/bootstrap')return json(200,{token,settings,startup:await startupStatus(),rates:effectiveRates(settings.prices),pricing:priceSyncStatus(),priceHistory:priceHistory.status(),dataDir:dataRoot,activeState:active.id,bridgeScript:path.join(root,'bridge','atlas-statusline.mjs')});
   if(url.pathname==='/api/snapshot')return json(200,store.snapshot(settings,{compact:true}));
   if(url.pathname==='/api/limit-history'){
    const tool=url.searchParams.get('tool');if(!['codex','claude'].includes(tool))return json(400,{error:'Ungültiges KI-Tool.'});
    return json(200,{tool,history:store.limitHistory.filter(point=>point.tool===tool),scanCount:store.scanCount});
   }
   if(url.pathname==='/api/session-details'){
    const id=url.searchParams.get('id');if(!id||id.length>500)return json(400,{error:'Ungültige Session-ID.'});
    const snapshot=store.snapshot(settings,{sessionId:id,includeLimitHistory:false}),session=snapshot.sessions[0];return session?json(200,{session,detailRevision:snapshot.detailRevision}):json(404,{error:'Session nicht gefunden.'});
   }
   if(url.pathname==='/api/export-data'){
    const snapshot=store.snapshot(settings,{includeLimitHistory:false,includeContextTimeline:false});return json(200,{sessions:snapshot.sessions,pricingMode:snapshot.pricingMode,pricingRuleVersion:snapshot.pricingRuleVersion});
   }
   if(staticFiles[url.pathname]) {const [file,type]=staticFiles[url.pathname];res.writeHead(200,{'Content-Type':type});return res.end(await fs.readFile(path.join(root,'public',file)));}
  }
  if(req.method==='POST') {
   if(req.headers['x-atlas-token']!==token)return json(403,{error:'Sitzung abgelaufen. Bitte Seite neu laden.'});
   if(url.pathname==='/api/backup/preview'){
    const buffer=await readBody(req,MAX_BACKUP_COMPRESSED),parsed=parseBackup(buffer),restoreId=randomBytes(18).toString('hex');parsed.preview.sourceRoots=await Promise.all((parsed.preview.sourceRoots||[]).map(async item=>{try{await fs.stat(item.path);return {...item,available:true};}catch{return {...item,available:false};}}));restorePlans.set(restoreId,{...parsed,expires:Date.now()+10*60000});
    for(const [id,plan] of restorePlans)if(plan.expires<Date.now())restorePlans.delete(id);
    return json(200,{restoreId,...parsed.preview});
   }
   let body=(await readBody(req,64000)).toString('utf8');
   let input={};try {input=JSON.parse(body||'{}');}catch{return json(400,{error:'Ungültiges JSON.'});}
   if(url.pathname==='/api/refresh'){if(mutating)return json(409,{error:'Ein lokaler Datenstand wird gerade geändert.'});const snapshot=await store.scan(settings,{compact:true});return json(200,{...snapshot,limitAlerts:store.takeLimitAlerts()});}
   if(url.pathname==='/api/cache/reset'){
    if(mutating)return json(409,{error:'Ein lokaler Datenstand wird gerade geändert.'});mutating=true;let previousCache;
    try{
     if(store.pending)await store.pending;await store.persist();const cacheFile=path.join(dataDir,'usage-cache.json');previousCache=await fs.readFile(cacheFile);
     const fallback=await createBackup(dataDir,{sessionCount:store.snapshot(settings,{compact:true}).sessions.length}),backupDir=path.join(dataRoot,'recovery');await fs.mkdir(backupDir,{recursive:true});const fallbackFile=path.join(backupDir,`before-cache-reset-${new Date().toISOString().replaceAll(':','-')}.json.gz`);await fs.writeFile(fallbackFile,fallback.buffer);
     const replacement=new Store(cacheFile,priceHistory),snapshot=await replacement.scan(settings,{compact:true});store=replacement;return json(200,{ok:true,fallbackFile,snapshot});
    }catch(error){if(previousCache)try{const cacheFile=path.join(dataDir,'usage-cache.json'),rollback=cacheFile+'.reset-rollback';await fs.writeFile(rollback,previousCache);await fs.rename(rollback,cacheFile);}catch(rollbackError){error.message+=` · Cache-Rollback fehlgeschlagen: ${rollbackError.code||rollbackError.message}`;}throw error;}finally{mutating=false;}
   }
   if(url.pathname==='/api/backup/export'){
    if(mutating)return json(409,{error:'Ein lokaler Datenstand wird gerade geändert.'});mutating=true;try{if(store.pending)await store.pending;await store.persist();
     const backup=await createBackup(dataDir,{sessionCount:store.snapshot(settings,{compact:true}).sessions.length});res.writeHead(200,{'Content-Type':'application/gzip','Content-Disposition':`attachment; filename="session-atlas-backup-${backup.createdAt.slice(0,10)}.json.gz"`,'Content-Length':backup.buffer.length});return res.end(backup.buffer);
    }finally{mutating=false;}
   }
   if(url.pathname==='/api/backup/restore'){
    if(mutating)return json(409,{error:'Eine Änderung wird gerade gespeichert.'});const plan=restorePlans.get(input.restoreId);if(!plan||plan.expires<Date.now())return json(410,{error:'Die geprüfte Vorschau ist abgelaufen. Bitte die Sicherung erneut auswählen.'});mutating=true;
    const previous=active;try{
     if(store.pending)await store.pending;await store.persist();const fallback=await createBackup(dataDir,{sessionCount:store.snapshot(settings,{compact:true}).sessions.length});const backupDir=path.join(dataRoot,'recovery');await fs.mkdir(backupDir,{recursive:true});const fallbackFile=path.join(backupDir,`before-restore-${new Date().toISOString().replaceAll(':','-')}.json.gz`);await fs.writeFile(fallbackFile,fallback.buffer);
     const prepared=await prepareState(dataRoot,mappedRestoreFiles(plan,input.rootMappings));await activateState(dataRoot,prepared);await reloadRuntime(prepared.dir);active=prepared;restorePlans.delete(input.restoreId);
     return json(200,{ok:true,fallbackFile,settings,pricing:priceSyncStatus(),priceHistory:priceHistory.status(),rates:effectiveRates(settings.prices),snapshot:store.snapshot(settings,{compact:true}),activeState:active.id});
    }catch(error){await activateStateId(dataRoot,previous.id);await reloadRuntime(previous.dir);active=previous;throw error;}finally{mutating=false;}
   }
   if(url.pathname==='/api/prices/sync') {
    if(mutating)return json(409,{error:'Ein lokaler Datenstand wird gerade geändert.'});mutating=true;try{const result=await syncPrices(dataDir);
     const snapshot=await priceHistory.capture({overrides:settings.prices,validFrom:result.fetchedAt,source:'remote-sync',sourceDetails:{updated:result.updated,warnings:result.warnings},remote:remotePrices()});await priceHistory.recordFetch(result.pricing.sources);
     return json(200,{...result,rates:effectiveRates(settings.prices),priceHistory:priceHistory.status(),priceSnapshotId:snapshot.id});
    }finally{mutating=false;}
   }
   if(url.pathname==='/api/prices/compare'){
    if(mutating)return json(409,{error:'Ein lokaler Datenstand wird gerade geändert.'});
    const ids=[input.first,input.second];if(ids.some(id=>typeof id!=='string'||!priceHistory.snapshots.some(item=>item.id===id)))throw Error('Bitte zwei vorhandene Preisstände auswählen.');const from=input.from?Date.parse(`${input.from}T00:00:00`):-Infinity,to=input.to?Date.parse(`${input.to}T23:59:59.999`):Infinity;if(!Number.isFinite(from)&&from!==-Infinity||!Number.isFinite(to)&&to!==Infinity||from>to)throw Error('Ungültiger Vergleichszeitraum.');
     const events=store.snapshot(settings,{compact:true}).sessions.flatMap(session=>session.events).filter(event=>{const time=Date.parse(event.time);return time>=from&&time<=to;}),summarize=id=>{let cost=0,unknown=0;for(const event of events){const value=priceHistory.evaluateSnapshot(event,id).cost;if(value===null)unknown++;else cost+=value;}return {id,cost,unknown,events:events.length};};return json(200,{first:summarize(ids[0]),second:summarize(ids[1])});
   }
   if(url.pathname==='/api/settings'||url.pathname==='/api/startup') {
    if(mutating)return json(409,{error:'Eine Änderung wird gerade gespeichert.'});mutating=true;
    try {
     if(url.pathname==='/api/startup') {if(typeof input.enabled!=='boolean')throw Error('enabled muss boolean sein.');return json(200,await setStartup(input.enabled,root));}
     const next=validateSettings(input),pricesChanged=JSON.stringify(next.prices)!==JSON.stringify(settings.prices)||next.priceEffectiveFrom!==settings.priceEffectiveFrom;if(store.pending)await store.pending;
     await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(path.join(dataDir,'settings.json.tmp'),JSON.stringify(next,null,2));await fs.rename(path.join(dataDir,'settings.json.tmp'),path.join(dataDir,'settings.json'));settings=next;
     if(pricesChanged)await priceHistory.capture({overrides:settings.prices,validFrom:settings.priceEffectiveFrom||new Date().toISOString(),source:'manual-settings',sourceDetails:{removedOverrides:Object.keys(input.prices||{}).length===0}});
     store.repos.clear();return json(200,{settings,priceHistory:priceHistory.status(),rates:effectiveRates(settings.prices)});
    }finally {mutating=false;}
   }
   if(url.pathname==='/api/shutdown') {json(200,{ok:true});server.close();setTimeout(()=>process.exit(0),300).unref();return;}
  }
  json(404,{error:'Nicht gefunden.'});
 }catch(e){console.error(e.message);if(!res.headersSent)json(e.statusCode||400,{error:e.message});else res.end();}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} ist belegt. Starte über Start.cmd oder setze ATLAS_PORT.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`Session Atlas: ${origin}`);if(process.argv.includes('--open'))openBrowser(origin).catch(e=>console.error(e.message));});
