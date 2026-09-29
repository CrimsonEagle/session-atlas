import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PriceHistory} from '../lib/price-history.mjs';

test('historical prices remain reproducible while current prices follow the latest table',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-prices-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'history.json'),history=new PriceHistory(file);await history.load();
 const first=await history.capture({overrides:{custom:[1,.1,2]},validFrom:'2026-01-01T00:00:00Z',source:'manual'}),event={time:'2026-02-01T00:00:00Z',model:'custom',input:1e6,cache:0,write:0,writeHour:0,output:1e6,tier:'standard',geo:''};
 assert.equal(history.evaluate(event,'historical').cost,3);assert.equal(history.evaluate(event,'historical').priceSnapshotId,first.id);
 await history.capture({overrides:{custom:[2,.2,4]},validFrom:'2026-03-01T00:00:00Z',source:'manual'});
 assert.equal(history.evaluate(event,'historical').cost,3);assert.equal(history.evaluate({...event,time:'2026-04-01T00:00:00Z'},'historical').cost,6);assert.equal(history.evaluate(event,'current',{custom:[2,.2,4]}).cost,6);
 const restored=new PriceHistory(file);await restored.load();assert.equal(restored.evaluate(event,'historical').cost,3);assert.equal(restored.evaluate({...event,time:'2025-12-01T00:00:00Z'},'historical').priceMissingReason,'no-historical-snapshot');
});

test('capturing the same immutable price stand reuses its identifier',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-prices-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const history=new PriceHistory(path.join(dir,'history.json')),input={overrides:{custom:[1,.1,2]},validFrom:'2026-01-01T00:00:00Z',source:'manual'};const a=await history.capture(input),b=await history.capture(input);assert.equal(a.id,b.id);assert.equal(history.snapshots.length,1);
});

test('backdated manual prices reference the table used for current costs, including after restart',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-prices-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'history.json'),history=new PriceHistory(file);
 const old=await history.capture({overrides:{custom:[1,0,1]},validFrom:'2026-01-01T00:00:00Z'});
 const later=await history.capture({overrides:{custom:[2,0,2]},validFrom:'2026-03-01T00:00:00Z'});
 const backdated=await history.capture({overrides:{custom:[3,0,3]},validFrom:'2026-02-01T00:00:00Z'});
 const event={time:'2026-09-29T12:00:00Z',model:'custom',input:1e6,cache:0,write:0,writeHour:0,output:0,tier:'standard',geo:''};
 const restarted=new PriceHistory(file);await restarted.load();
 for(const h of [history,restarted]){
  const current=h.evaluate(event,'current',{custom:[3,0,3]});
  assert.equal(current.cost,3);assert.equal(current.priceSnapshotId,backdated.id);
  assert.equal(h.evaluateSnapshot(event,current.priceSnapshotId).cost,current.cost);
  assert.equal(h.evaluate(event,'current',{custom:[4,0,4]}).priceSnapshotId,null);
  assert.equal(h.resolve('2025-12-31T23:59:59Z'),null);
  assert.equal(h.resolve('2026-01-01T00:00:00Z').id,old.id);
  assert.equal(h.resolve('2026-02-01T00:00:00Z').id,backdated.id);
  assert.equal(h.resolve(event.time).id,later.id);
 }
});
