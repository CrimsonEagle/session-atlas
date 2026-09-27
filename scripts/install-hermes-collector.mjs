#!/usr/bin/env node
// One-time user-level installation, deliberately leaves the timer stopped.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {systemctl} from '../lib/hermes-collector-service.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const quote=value=>`"${String(value).replaceAll('%','%%').replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;
async function executable(name){if(path.isAbsolute(name)){await fs.access(name,fs.constants.X_OK);return name;}for(const dir of (process.env.PATH||'').split(path.delimiter)){const file=path.join(dir,name);try{await fs.access(file,fs.constants.X_OK);return file;}catch{}}throw Error(`${name} wurde im PATH nicht gefunden.`);}
export async function install({configHome=process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),home=process.env.HERMES_HOME||path.join(os.homedir(),'.hermes'),cli=process.env.ATLAS_HERMES_CLI||'hermes',node=process.execPath,reload=true}={}){
 if(process.platform!=='linux')throw Error('systemd-User-Timer werden nur unter Linux unterstützt.');
 const dir=path.join(configHome,'systemd','user');await fs.mkdir(dir,{recursive:true});
 const command=await executable(cli),script=path.join(root,'bridge','hermes-usage.mjs');await fs.access(script);
 const service=`# Session Atlas Hermes collector (managed by scripts/install-hermes-collector.mjs)\n[Unit]\nDescription=Session Atlas Hermes account usage sample\n[Service]\nType=oneshot\nEnvironment=${quote(`ATLAS_HERMES_CLI=${command}`)}\nEnvironment=${quote(`HERMES_HOME=${home}`)}\nExecStart=${quote(node)} ${quote(script)}\n`;
 const timer=`# Session Atlas Hermes collector (managed by scripts/install-hermes-collector.mjs)\n[Unit]\nDescription=Sample Hermes Codex account usage every five minutes\n[Timer]\nOnActiveSec=5min\nOnUnitActiveSec=5min\nAccuracySec=30s\nUnit=session-atlas-hermes-usage.service\n[Install]\nWantedBy=timers.target\n`;
 for(const [name,body] of [['session-atlas-hermes-usage.service',service],['session-atlas-hermes-usage.timer',timer]]){
  const file=path.join(dir,name);let previous;try{previous=await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous===body)continue;
  if(previous&&!previous.startsWith('# Session Atlas Hermes collector (managed by scripts/install-hermes-collector.mjs)'))throw Error(`${file} gehört nicht Session Atlas; Installation abgebrochen.`);
  const temp=file+'.new';await fs.writeFile(temp,body,{mode:0o600});await fs.rename(temp,file);
 }
 if(reload)await systemctl(['daemon-reload']);return dir;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))install().then(dir=>console.log(`Sammler eingerichtet unter ${dir}. Timer bleibt gestoppt; in Session Atlas aktivieren.`)).catch(error=>{console.error(error.message);process.exitCode=1;});
