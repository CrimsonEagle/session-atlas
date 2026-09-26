import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openBrowser} from './lib/platform.mjs';
import {runtimeRevision} from './lib/runtime-revision.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const url=`http://127.0.0.1:${Number(process.env.ATLAS_PORT||4317)}`;
const revision=runtimeRevision(root);
async function health(){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(700)});return r.ok?await r.json():null;}catch{return null;}}
async function ready(){const status=await health();return status?.app==='session-atlas'&&status.revision===revision;}
const running=await health();
if(running?.app==='session-atlas'&&running.revision!==revision){
 const bootstrap=await(await fetch(url+'/api/bootstrap',{signal:AbortSignal.timeout(2000)})).json();
 const stopped=await fetch(url+'/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Token':bootstrap.token},body:'{}',signal:AbortSignal.timeout(2000)});
 if(!stopped.ok)throw Error('Der veraltete App-Prozess konnte nicht beendet werden.');
 for(let i=0;i<40&&await health();i++)await new Promise(resolve=>setTimeout(resolve,100));
 if(await health())throw Error('Der veraltete App-Prozess gibt den Port nicht frei.');
}else if(running?.app&&running.app!=='session-atlas')throw Error(`Port ${new URL(url).port} wird von einer anderen App verwendet.`);
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
