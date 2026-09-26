import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const exec=promisify(execFile);
export const psQuote=s=>`'${String(s).replaceAll("'","''")}'`;
export async function powershell(script) {return exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000});}
function windowsStartupFile() {
 if(!process.env.APPDATA)return null;
 return path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup','Session Atlas.lnk');
}
export function linuxStartupFile(configHome=process.env.XDG_CONFIG_HOME,home=os.homedir()) {
 const base=configHome&&path.posix.isAbsolute(configHome)?configHome:path.posix.join(home,'.config');
 return path.posix.join(base,'autostart','session-atlas.desktop');
}
export function desktopExecQuote(value) {
 const slash='\\';
 return `"${[...String(value)].map(char=>char==='%'?'%%':char===slash?slash.repeat(4):'"$`'.includes(char)?slash.repeat(2)+char:char).join('')}"`;
}
export function linuxDesktopEntry(nodePath,root) {
 return `[Desktop Entry]\nType=Application\nName=Session Atlas\nExec=${desktopExecQuote(nodePath)} ${desktopExecQuote(path.posix.join(root,'launcher.mjs'))}\nTerminal=false\n`;
}
function startupFile() {return process.platform==='win32'?windowsStartupFile():process.platform==='linux'?linuxStartupFile():null;}
export async function startupStatus() {const file=startupFile();return {supported:!!file,enabled:file?await fs.access(file).then(()=>true,()=>false):false};}
export async function setStartup(enabled,root) {
 const file=startupFile();if(!file)throw Error('Autostart ist auf diesem Betriebssystem nicht verfügbar.');
 if(process.platform==='linux') {
  if(enabled) {
   await fs.mkdir(path.dirname(file),{recursive:true});
   const temporary=`${file}.${process.pid}-${randomUUID()}.tmp`;
   try {await fs.writeFile(temporary,linuxDesktopEntry(process.execPath,root),{flag:'wx',mode:0o644});await fs.rename(temporary,file);}
   finally {await fs.rm(temporary,{force:true});}
  } else await fs.rm(file,{force:true});
  return startupStatus();
 }
 if(enabled) {
  const command=`& ${psQuote(process.execPath)} ${psQuote(path.join(root,'launcher.mjs'))}`;
  const args=`-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${Buffer.from(command,'utf16le').toString('base64')}`;
  await powershell(`$atlasShell = New-Object -ComObject WScript.Shell\n$atlasShortcut = $atlasShell.CreateShortcut(${psQuote(file)})\n$atlasShortcut.TargetPath = ${psQuote(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'))}\n$atlasShortcut.Arguments = ${psQuote(args)}\n$atlasShortcut.WorkingDirectory = ${psQuote(root)}\n$atlasShortcut.WindowStyle = 7\n$atlasShortcut.Description = 'Session Atlas – lokale KI-Nutzungsanalyse'\n$atlasShortcut.Save()`);
 } else await fs.rm(file,{force:true});
 return startupStatus();
}
export async function openBrowser(url) {
 if(process.platform==='win32') await powershell(`Start-Process ${psQuote(url)}`);
 else await exec(process.platform==='darwin'?'open':'xdg-open',[url]);
}
