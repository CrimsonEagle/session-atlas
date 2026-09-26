import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setStartup,startupStatus,powershell,psQuote} from '../lib/platform.mjs';
test('Autostart shortcut round-trip in an isolated fake APPDATA directory', {skip:process.platform!=='win32'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-startup-')),old=process.env.APPDATA;
 try {
  process.env.APPDATA=dir;const startup=path.join(dir,'Microsoft','Windows','Start Menu','Programs','Startup');await fs.mkdir(startup,{recursive:true});
  assert.equal((await startupStatus()).enabled,false);assert.equal((await setStartup(true,"C:\\Atlas Test's Folder")).enabled,true);
  const {stdout}=await powershell(`$atlasShell = New-Object -ComObject WScript.Shell\n$atlasLink = $atlasShell.CreateShortcut(${psQuote(path.join(startup,'Session Atlas.lnk'))})\n$atlasLink.Arguments`);
  assert.match(stdout,/-WindowStyle Hidden -EncodedCommand/);const encoded=stdout.trim().split(' ').at(-1);const command=Buffer.from(encoded,'base64').toString('utf16le');assert.match(command,/Atlas Test''s Folder/);assert.ok(command.includes('launcher.mjs'));
  assert.equal((await setStartup(false,dir)).enabled,false);
 }finally{if(old===undefined)delete process.env.APPDATA;else process.env.APPDATA=old;if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-startup-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});}
});
