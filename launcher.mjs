import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openBrowser} from './lib/windows.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const url=`http://127.0.0.1:${Number(process.env.ATLAS_PORT||4317)}`;
async function ready(){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(700)});return (await r.json()).app==='session-atlas';}catch{return false;}}
if(!await ready()) {
 const data=process.env.ATLAS_DATA_DIR||path.join(root,'.local');fs.mkdirSync(data,{recursive:true});
 const log=fs.openSync(path.join(data,'server.log'),'a');
 const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
 let up=false;for(let i=0;i<40;i++){if(await ready()){up=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!up)throw Error(`Start fehlgeschlagen. Siehe ${path.join(data,'server.log')}.`);
}
try {await openBrowser(url);}catch {
 console.log(`Session Atlas läuft unter ${url}`);
 console.error('Der Browser konnte nicht automatisch geöffnet werden. Bitte die Adresse manuell öffnen.');
 process.exitCode=1;
}
