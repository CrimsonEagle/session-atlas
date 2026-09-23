import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runtimeRevision} from '../lib/runtime-revision.mjs';

test('runtime revision changes when server code changes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-revision-'));
 try{
  await fs.mkdir(path.join(dir,'lib'));
  await fs.writeFile(path.join(dir,'server.mjs'),'server-v1');
  await fs.writeFile(path.join(dir,'lib','module.mjs'),'module-v1');
  const first=runtimeRevision(dir);
  assert.equal(runtimeRevision(dir),first);
  await fs.writeFile(path.join(dir,'lib','module.mjs'),'module-v2');
  assert.notEqual(runtimeRevision(dir),first);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
