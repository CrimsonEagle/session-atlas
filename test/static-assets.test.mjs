import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {staticAsset} from '../lib/static-assets.mjs';

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));

async function javascriptFiles(dir){
 const entries=await fs.readdir(dir,{withFileTypes:true});
 const nested=await Promise.all(entries.map(entry=>entry.isDirectory()?javascriptFiles(path.join(dir,entry.name)):Promise.resolve(/\.(?:js|mjs)$/.test(entry.name)?[path.join(dir,entry.name)]:[])));
 return nested.flat();
}

test('every browser module and its local imports can be served',async()=>{
 for(const file of await javascriptFiles(publicDir)){
  const url='/'+path.relative(publicDir,file).split(path.sep).join('/');
  assert.deepEqual(staticAsset(url),[url.slice(1),'text/javascript; charset=utf-8'],url);
  const source=await fs.readFile(file,'utf8');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){
   const imported=path.resolve(path.dirname(file),match[1]);
   assert.ok(imported.startsWith(publicDir),`${url} imports outside public: ${match[1]}`);
   assert.ok((await fs.stat(imported)).isFile(),`${url} imports missing file: ${match[1]}`);
  }
 }
});

test('static routes reject paths outside public assets',()=>{
 for(const url of ['/../server.mjs','/.local/settings.json','/vendor/../../server.mjs','/vendor/readme.txt','/api/bootstrap'])assert.equal(staticAsset(url),null,url);
});
