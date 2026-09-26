import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {desktopExecQuote,linuxDesktopEntry,linuxStartupFile,setStartup,startupStatus} from '../lib/platform.mjs';

test('Linux autostart uses the XDG configuration directory',()=>{
 assert.equal(linuxStartupFile('/custom/config','/home/user'),'/custom/config/autostart/session-atlas.desktop');
 assert.equal(linuxStartupFile('relative/config','/home/user'),'/home/user/.config/autostart/session-atlas.desktop');
});

test('desktop entry quotes paths and escapes reserved characters',()=>{
 assert.equal(desktopExecQuote('/opt/Node with space/node'),'"/opt/Node with space/node"');
 assert.equal(desktopExecQuote('a%b'),'"a%%b"');
 assert.equal(desktopExecQuote('a$b'),'"a'+'\\'.repeat(2)+'$b"');
 assert.equal(desktopExecQuote('a"b'),'"a'+'\\'.repeat(2)+'"b"');
 assert.equal(desktopExecQuote('a`b'),'"a'+'\\'.repeat(2)+'`b"');
 assert.equal(desktopExecQuote('a\\b'),'"a'+'\\'.repeat(4)+'b"');
 const entry=linuxDesktopEntry('/opt/Node with space/node','/home/me/Atlas Project');
 assert.match(entry,/^\[Desktop Entry\]\nType=Application\nName=Session Atlas\n/);
 assert.match(entry,/Exec="\/opt\/Node with space\/node" "\/home\/me\/Atlas Project\/launcher\.mjs"/);
 assert.match(entry,/\nTerminal=false\n$/);
});

test('Linux autostart entry round-trip in an isolated XDG directory',{skip:process.platform!=='linux'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-xdg-')),old=process.env.XDG_CONFIG_HOME;
 try {
  process.env.XDG_CONFIG_HOME=dir;
  assert.equal((await startupStatus()).enabled,false);
  assert.equal((await setStartup(true,"/opt/Atlas Test's Folder")).enabled,true);
  const entry=await fs.readFile(path.join(dir,'autostart','session-atlas.desktop'),'utf8');
  assert.match(entry,/Atlas Test's Folder\/launcher\.mjs/);
  assert.equal((await setStartup(false,dir)).enabled,false);
 }finally{
  if(old===undefined)delete process.env.XDG_CONFIG_HOME;else process.env.XDG_CONFIG_HOME=old;
  if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-xdg-'))throw Error('Unexpected cleanup path');
  await fs.rm(dir,{recursive:true,force:true});
 }
});
