import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBackup,parseBackup} from '../lib/backup.mjs';
import {activeState,prepareState,activateState} from '../lib/state-set.mjs';

test('backup round-trip validates checksums and atomically activates a prepared state',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-backup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'settings.json'),JSON.stringify({intervalSeconds:30}));await fs.writeFile(path.join(root,'usage-cache.json'),JSON.stringify({version:6,files:{one:{tool:'codex',id:'session'}}}));
 const initial=await activeState(root),created=await createBackup(initial.dir,{sessionCount:1}),parsed=parseBackup(created.buffer);assert.equal(parsed.preview.sessionCount,1);assert.deepEqual(parsed.preview.categories.map(item=>item.file).sort(),['settings.json','usage-cache.json']);
 const prepared=await prepareState(root,parsed.files);await activateState(root,prepared);const active=await activeState(root);assert.equal(active.id,prepared.id);assert.equal(JSON.parse(await fs.readFile(path.join(active.dir,'usage-cache.json'),'utf8')).version,6);
 const damaged=Buffer.from(created.buffer);damaged[Math.floor(damaged.length/2)]^=255;assert.throws(()=>parseBackup(damaged),/beschädigt|Prüfsumme/);
});

test('backup rejects incomplete containers before changing state',async()=>{
 assert.throws(()=>parseBackup(Buffer.from('not gzip')),/beschädigt/);
});

test('backup preview includes locally cached Hermes sessions and source roots',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-hermes-backup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'settings.json'),JSON.stringify({hermesRoots:['/home/user/.hermes']}));
 await fs.writeFile(path.join(root,'usage-cache.json'),JSON.stringify({version:7,files:{},hermesSources:{'/home/user/.hermes':{sessions:{one:{tool:'hermes',id:'root-id:default:one'}}}}}));
 const backup=await createBackup(root),preview=parseBackup(backup.buffer).preview;
 assert.equal(preview.sessionCount,1);
 assert.deepEqual(preview.sourceRoots,[{tool:'hermes',path:'/home/user/.hermes'}]);
});
