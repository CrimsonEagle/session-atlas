import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('HTTP API is local, rejects foreign origins/mutations, validates settings and shuts down',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'session-atlas-http-'));
 await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify({intervalSeconds:30,claudeRoots:[],codexRoots:[],prices:{}}));
 const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,ATLAS_PORT:String(port),ATLAS_DATA_DIR:dir},windowsHide:true,stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('session-atlas-http-'))throw Error('Unexpected cleanup path');await fs.rm(dir,{recursive:true,force:true});});
 await once(child.stdout,'data');const base=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(base+'/')).status,200);
 for(const [asset,type] of [['i18n.js','text/javascript'],['background.js','text/javascript'],['session-tree.js','text/javascript'],['session-row.js','text/javascript'],['pixi-background.js','text/javascript'],['vendor/pixi-8.21.0.mjs','text/javascript'],['vendor/pixi-csp-8.21.0.mjs','text/javascript'],['background.css','text/css'],['app-icon.png','image/png'],['favicon.png','image/png']]){
  const response=await fetch(base+'/'+asset);
  assert.equal(response.status,200);
  assert.ok(response.headers.get('content-type').startsWith(type));
 }
 assert.equal((await fetch(base+'/api/snapshot',{headers:{Origin:'https://untrusted.example'}})).status,403);
 const foreignHostStatus=await new Promise((resolve,reject)=>{http.get(base+'/api/snapshot',{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
 assert.equal(foreignHostStatus,403);
 assert.equal((await fetch(base+'/api/settings',{method:'POST',body:'{}'})).status,403);
 const bootstrap=await(await fetch(base+'/api/bootstrap')).json();const post=(endpoint,x)=>fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Token':bootstrap.token},body:JSON.stringify(x)});
 assert.deepEqual(bootstrap.settings.hiddenProviders,[]);
 assert.equal((await post('/api/settings',{...bootstrap.settings,intervalSeconds:1})).status,400);
 assert.equal((await post('/api/settings',{...bootstrap.settings,claudeRoots:['relative/path']})).status,400);
 assert.equal((await post('/api/settings',{...bootstrap.settings,hiddenProviders:['other']})).status,400);
 const saved=await post('/api/settings',{...bootstrap.settings,intervalSeconds:10,hiddenProviders:['claude','claude']});assert.equal(saved.status,200);assert.deepEqual((await saved.json()).settings.hiddenProviders,['claude']);
 const result=await(await post('/api/refresh',{})).json();assert.deepEqual(result.sessions,[]);assert.equal(result.stats.scanCount,1);
 const snapshot=await(await fetch(base+'/api/snapshot')).json();assert.equal(snapshot.stats.scanCount,1);assert.equal(snapshot.limitHistory,undefined);
 const history=await(await fetch(base+'/api/limit-history?tool=codex')).json();assert.deepEqual(history.history,[]);assert.equal((await fetch(base+'/api/limit-history?tool=other')).status,400);
 assert.equal((await fetch(base+'/api/session-details?id=codex%3Amissing')).status,404);const exported=await(await fetch(base+'/api/export-data')).json();assert.deepEqual(exported.sessions,[]);
 const reset=await(await post('/api/cache/reset',{})).json();assert.equal(reset.ok,true);assert.deepEqual(reset.snapshot.sessions,[]);assert.equal(typeof reset.snapshot.detailRevision,'string');assert.ok((await fs.stat(reset.fallbackFile)).size>50);
 const backupResponse=await post('/api/backup/export',{});assert.equal(backupResponse.status,200);assert.match(backupResponse.headers.get('content-type'),/application\/gzip/);const backup=await backupResponse.arrayBuffer();assert.ok(backup.byteLength>50);
 const badPreview=await fetch(base+'/api/backup/preview',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Atlas-Token':bootstrap.token},body:Buffer.from('damaged')});assert.equal(badPreview.status,400);
 const previewResponse=await fetch(base+'/api/backup/preview',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Atlas-Token':bootstrap.token},body:backup});assert.equal(previewResponse.status,200);const preview=await previewResponse.json();assert.equal(preview.sessionCount,0);assert.ok(preview.categories.some(item=>item.file==='usage-cache.json'));
 const restored=await(await post('/api/backup/restore',{restoreId:preview.restoreId})).json();assert.equal(restored.ok,true);assert.deepEqual(restored.snapshot.sessions,[]);assert.ok(restored.fallbackFile.includes('before-restore-'));
 assert.equal((await fetch(base+'/.local/settings.json')).status,404);
 assert.equal((await post('/api/shutdown',{})).status,200);await once(child,'exit');
});
