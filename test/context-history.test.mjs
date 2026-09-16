import test from 'node:test';
import assert from 'node:assert/strict';
import {contextHistoryView} from '../public/context-history.js';

const helpers={compact:String,date:String,esc:String};
test('context chart marks model, window, compaction and data gaps while preserving unknown percentages',()=>{
 const timeline=[
  {id:'1',kind:'sample',time:'2026-01-01T10:00:00Z',model:'a',usedTokens:100,windowTokens:1000},
  {id:'2',kind:'compaction',time:'2026-01-01T10:10:00Z',model:'a'},
  {id:'3',kind:'sample',time:'2026-01-01T10:10:00Z',model:'b',usedTokens:50,windowTokens:null},
  {id:'4',kind:'sample',time:'2026-01-01T12:00:00Z',model:'b',usedTokens:80,windowTokens:2000}
 ],html=contextHistoryView({timeline,...helpers});
 assert.match(html,/Komprimierung/);assert.match(html,/Lücke/);assert.match(html,/model-change/);assert.match(html,/window-change/);assert.match(html,/Nicht berechenbar/);assert.match(html,/tabindex="0"/);
 assert.match(html,/<div class="context-chart-shell" data-tip-host><div class="context-chart">/);
 assert.doesNotMatch(html,/class="context-chart" data-tip-host/);
});

test('a single last context value is explicitly reported as no history',()=>{const html=contextHistoryView({timeline:[],lastUsed:100,lastWindow:null,...helpers});assert.match(html,/Nur der letzte Stand/);assert.doesNotMatch(html,/<svg/);});
