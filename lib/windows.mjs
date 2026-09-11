import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile);
export const psQuote=s=>`'${String(s).replaceAll("'","''")}'`;
export async function powershell(script) {return exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000});}
function startupFile() {
 if(process.platform!=='win32'||!process.env.APPDATA)return null;
 return path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup','Session Atlas.lnk');
}
export async function startupStatus() {const file=startupFile();return {supported:!!file,enabled:file?await fs.access(file).then(()=>true,()=>false):false};}
export async function setStartup(enabled,root) {
 const file=startupFile();if(!file)throw Error('Autostart ist nur unter Windows verfügbar.');
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
