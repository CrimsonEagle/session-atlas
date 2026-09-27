import {spawn} from 'node:child_process';
const TIMER='session-atlas-hermes-usage.timer',SERVICE='session-atlas-hermes-usage.service';
export async function systemctl(args,{timeout=8000}={}){return new Promise((resolve,reject)=>{
 const child=spawn('systemctl',['--user',...args],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',settled=false;
 const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);timer.unref();
 child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16384)child.kill('SIGKILL');});child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>2048)child.kill('SIGKILL');});
 child.on('error',err=>{clearTimeout(timer);if(!settled){settled=true;reject(Error(`systemctl nicht verfügbar: ${err.code||err.message}`));}});
 child.on('close',code=>{clearTimeout(timer);if(settled)return;settled=true;code===0?resolve(stdout):reject(Error(`systemctl fehlgeschlagen: ${stderr.slice(0,240)||code}`));});
 });}
function parseShow(text){return Object.fromEntries(text.trim().split('\n').filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));}
export function systemdTimestamp(value){if(!/^@\d+(?:\.\d+)?$/.test(value||''))return null;const ms=Number(value.slice(1))*1000;return Number.isFinite(ms)?new Date(ms).toISOString():null;}
export async function collectorStatus(){if(process.platform!=='linux')return {supported:false,installed:false,enabled:false,running:false,lastRun:null,lastSuccess:false};
 try{
  const [timer,service]=await Promise.all([systemctl(['show',TIMER,'--property=LoadState,UnitFileState,ActiveState,LastTriggerUSec','--timestamp=unix']),systemctl(['show',SERVICE,'--property=LoadState,ActiveState,Result,ExecMainStatus,InactiveEnterTimestamp','--timestamp=unix'])]);
  const t=parseShow(timer),s=parseShow(service),installed=t.LoadState==='loaded'&&s.LoadState==='loaded';
  return {supported:true,installed,enabled:installed&&t.UnitFileState==='enabled',running:installed&&t.ActiveState==='active',lastRun:systemdTimestamp(s.InactiveEnterTimestamp)||systemdTimestamp(t.LastTriggerUSec),lastSuccess:s.Result==='success'&&s.ExecMainStatus==='0',error:s.Result&&s.Result!=='success'?s.Result:''};
 }catch(error){return {supported:true,installed:false,enabled:false,running:false,lastRun:null,lastSuccess:false,error:error.message};}
}
export async function setCollectorEnabled(enabled){if(process.platform!=='linux')throw Error('Der Hermes-Sammler benötigt Linux und systemd --user.');
 const before=await collectorStatus();if(!before.installed)throw Error('Sammler nicht eingerichtet. Bitte zuerst das Installationsskript ausführen.');
 if(enabled){await systemctl(['enable','--now',TIMER]);try{await systemctl(['start',SERVICE],{timeout:40000});}catch(error){throw Error(`Timer gestartet, erste Messung fehlgeschlagen: ${error.message}`);}}
 else{await systemctl(['disable','--now',TIMER]);await systemctl(['stop',SERVICE]);}
 return collectorStatus();
}
