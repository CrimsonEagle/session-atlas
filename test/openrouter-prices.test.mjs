import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrices} from '../lib/price-sync.mjs';
import {costForRates} from '../lib/pricing.mjs';

test('OpenRouter catalog keeps model slugs and converts per-token prices',()=>{
 const rates=parsePrices('openrouter',{data:[
  {id:'google/gemini-2.5-flash',pricing:{prompt:'0.000001',completion:'0.000002',cache_read:'0.0000002'}},
  {id:'qwen/qwen3:free',pricing:{prompt:'0',completion:'0'}},
  {id:'bad slug',pricing:{prompt:'0.000001',completion:'0.000002'}}
 ]});
 assert.equal(rates['openrouter:google/gemini-2.5-flash'][0],1);
 assert.ok(Math.abs(rates['openrouter:google/gemini-2.5-flash'][1]-.2)<1e-10);
 assert.deepEqual(rates['openrouter:google/gemini-2.5-flash'].slice(2),[2,null,null]);
 assert.deepEqual(rates['openrouter:qwen/qwen3:free'],[0,0,0,0,0]);
 assert.equal(rates['openrouter:bad slug'],undefined);
 const event={model:'google/gemini-2.5-flash',priceModel:'openrouter:google/gemini-2.5-flash',input:100,cache:10,write:0,writeHour:0,output:20,tier:'standard',geo:''};
 assert.ok(Math.abs(costForRates(event,rates)-.000142)<1e-10);
 assert.equal(costForRates({...event,priceModel:'openrouter:missing'},rates),null);
});
