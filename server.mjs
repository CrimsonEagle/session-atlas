import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Store} from './lib/store.mjs';
import {rates} from './lib/pricing.mjs';
import {loadPriceCache,remotePrices,priceSyncStatus,syncPrices} from './lib/price-sync.mjs';
import {startupStatus,setStartup,openBrowser} from './lib/windows.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.ATLAS_DATA_DIR||path.join(root,'.local');
await loadPriceCache(dataDir);
const port=Number(process.env.ATLAS_PORT||4317);
const origin=`http://127.0.0.1:${port}`;
const token=randomBytes(32).toString('hex');
const defaults={intervalSeconds:30,claudeRoots:[path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'projects')],codexRoots:[path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions'),path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'archived_sessions')],prices:{}};
let settings={...defaults};
try {settings={...defaults,...JSON.parse(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'))};}catch{}
const store=new Store(path.join(dataDir,'usage-cache.json'));await store.load();
function validateSettings(x) {
 if(!Number.isInteger(x.intervalSeconds)||x.intervalSeconds<10||x.intervalSeconds>3600)throw Error('Aktualisierung: 10 bis 3600 Sekunden.');
 for(const k of ['claudeRoots','codexRoots'])if(!Array.isArray(x[k])||x[k].length>20||x[k].some(p=>typeof p!=='string'||!path.isAbsolute(p)||p.length>2000))throw Error('Bitte gültige absolute Ordnerpfade eintragen.');
 if(!x.prices||typeof x.prices!=='object'||Array.isArray(x.prices))throw Error('Preise müssen ein JSON-Objekt sein.');
 for(const [model,r] of Object.entries(x.prices))if(model.length>120||!Array.isArray(r)||r.length<3||r.length>5||r.some(v=>!Number.isFinite(v)||v<0||v>100000))throw Error('Preise: je Modell 3 bis 5 nichtnegative Zahlen.');
 return {intervalSeconds:x.intervalSeconds,claudeRoots:x.claudeRoots.map(p=>path.resolve(p)),codexRoots:x.codexRoots.map(p=>path.resolve(p)),prices:x.prices};
}
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/analytics-core.js':['analytics-core.js','text/javascript; charset=utf-8'],'/details.js':['details.js','text/javascript; charset=utf-8'],'/polling.js':['polling.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/details.css':['details.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
let mutating=false;
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
   if(url.pathname==='/api/bootstrap')return json(200,{token,settings,startup:await startupStatus(),rates:{...rates,...remotePrices()},pricing:priceSyncStatus(),dataDir});
   if(url.pathname==='/api/snapshot')return json(200,store.snapshot(settings));
   if(staticFiles[url.pathname]) {const [file,type]=staticFiles[url.pathname];res.writeHead(200,{'Content-Type':type});return res.end(await fs.readFile(path.join(root,'public',file)));}
  }
  if(req.method==='POST') {
   if(req.headers['x-atlas-token']!==token)return json(403,{error:'Sitzung abgelaufen. Bitte Seite neu laden.'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>64000)return json(413,{error:'Anfrage zu groß.'});}
   let input={};try {input=JSON.parse(body||'{}');}catch{return json(400,{error:'Ungültiges JSON.'});}
   if(url.pathname==='/api/refresh')return json(200,await store.scan(settings));
   if(url.pathname==='/api/prices/sync') {
    const result=await syncPrices(dataDir);
    return json(200,{...result,rates:{...rates,...remotePrices()}});
   }
   if(url.pathname==='/api/settings'||url.pathname==='/api/startup') {
    if(mutating)return json(409,{error:'Eine Änderung wird gerade gespeichert.'});mutating=true;
    try {
     if(url.pathname==='/api/startup') {if(typeof input.enabled!=='boolean')throw Error('enabled muss boolean sein.');return json(200,await setStartup(input.enabled,root));}
     const next=validateSettings(input);if(store.pending)await store.pending;
     await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(path.join(dataDir,'settings.json.tmp'),JSON.stringify(next,null,2));await fs.rename(path.join(dataDir,'settings.json.tmp'),path.join(dataDir,'settings.json'));settings=next;store.repos.clear();return json(200,{settings});
    }finally {mutating=false;}
   }
   if(url.pathname==='/api/shutdown') {json(200,{ok:true});server.close();setTimeout(()=>process.exit(0),300).unref();return;}
  }
  json(404,{error:'Nicht gefunden.'});
 }catch(e){console.error(e.message);if(!res.headersSent)json(400,{error:e.message});else res.end();}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} ist belegt. Starte über Start.cmd oder setze ATLAS_PORT.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{console.log(`Session Atlas: ${origin}`);if(process.argv.includes('--open'))openBrowser(origin).catch(e=>console.error(e.message));});
