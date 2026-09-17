import test from 'node:test';
import assert from 'node:assert/strict';
import {updateLimitHistory} from '../lib/limit-history.mjs';
import {limitHistoryView} from '../public/limit-history.js';

const now=Date.parse('2026-09-15T12:00:00Z');
const limit=(used,observed='2026-09-15T12:00:00Z',reset='2026-09-15T15:00:00Z')=>({limit_id:'codex',observedAt:observed,primary:{window_minutes:300,used_percent:used,resets_at:Date.parse(reset)/1000}});

test('identical measurements deduplicate and a threshold jump emits only the highest alert',()=>{
 const first=updateLimitHistory([limit(96)],[],{},{now});assert.equal(first.history.length,1);assert.equal(first.alerts.length,1);assert.equal(first.alerts[0].threshold,95);assert.equal(Object.keys(first.notified).length,2);
 const repeat=updateLimitHistory([limit(96,'2026-09-15T12:01:00Z')],first.history,first.notified,{now:now+60000});assert.equal(repeat.history.length,1);assert.equal(repeat.alerts.length,0);
 const sameWindow=updateLimitHistory([limit(97,'2026-09-15T12:01:00Z')],repeat.history,repeat.notified,{now:now+60000});assert.equal(sameWindow.alerts.length,0);
});

test('new resets can alert again while stale or expired observations cannot',()=>{
 const first=updateLimitHistory([limit(85)],[],{},{now});
 const next=updateLimitHistory([limit(85,'2026-09-15T12:02:00Z','2026-09-16T15:00:00Z')],first.history,first.notified,{now:now+120000});assert.equal(next.alerts[0].threshold,80);
 const expired=updateLimitHistory([limit(99,'2026-09-15T11:50:00Z','2026-09-15T11:59:00Z')],next.history,next.notified,{now});assert.equal(expired.alerts.length,0);
 const stale=updateLimitHistory([limit(99,'2026-09-14T12:00:00Z','2026-09-16T15:00:00Z')],expired.history,expired.notified,{now});assert.equal(stale.alerts.length,0);
});

test('retention removes old points and configured thresholds are honored',()=>{
 const old={id:'old',tool:'codex',windowMinutes:300,resetsAt:null,usedPercent:10,sourceObservedAt:'2026-07-01T00:00:00Z',capturedAt:'2026-07-01T00:00:00Z',source:'session-log'};
 const result=updateLimitHistory([limit(75)], [old], {}, {now,retentionDays:30,thresholds:{codex:{300:[70,90]}}});assert.equal(result.history.length,1);assert.equal(result.alerts[0].threshold,70);
});

test('indexed incremental updates reuse unchanged history until pruning is requested',()=>{
 const first=updateLimitHistory([limit(20)],[],{},{now}),knownIds=new Set(first.history.map(point=>point.id));
 const repeat=updateLimitHistory([limit(20)],first.history,first.notified,{now:now+1000,knownIds,prune:false});
 assert.strictEqual(repeat.history,first.history);assert.equal(repeat.changed,false);assert.deepEqual(repeat.added,[]);
});

test('history view separates reset windows and reports sources',()=>{
 const history=[
  {id:'1',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:20,sourceObservedAt:'2026-09-15T10:00:00Z',source:'session-log'},
  {id:'2',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:40,sourceObservedAt:'2026-09-15T11:00:00Z',source:'session-log'},
  {id:'3',tool:'codex',windowMinutes:300,resetsAt:'2026-09-16T15:00:00Z',usedPercent:10,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'},
  {id:'4',tool:'codex',windowMinutes:300,resetsAt:'2026-09-16T15:00:00Z',usedPercent:30,sourceObservedAt:'2026-09-15T13:00:00Z',source:'session-log'}];
 const html=limitHistoryView({history,tool:'codex',now:now+2*60*60*1000,esc:String,date:String});assert.equal((html.match(/class="limit-history-area"/g)||[]).length,2);assert.equal((html.match(/class="limit-history-line"/g)||[]).length,2);assert.doesNotMatch(html,/<circle/);assert.match(html,/Flächen enden an Resetgrenzen/);assert.match(html,/Session-Log/);assert.match(html,/<option value="30" selected>/);
});

test('history view limits chart and table to the selected date range',()=>{
 const history=[
  {id:'old',tool:'codex',windowMinutes:300,resetsAt:'2026-07-01T15:00:00Z',usedPercent:90,sourceObservedAt:'2026-07-01T10:00:00Z',source:'session-log'},
  {id:'new-1',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:20,sourceObservedAt:'2026-09-15T10:00:00Z',source:'session-log'},
  {id:'new-2',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:40,sourceObservedAt:'2026-09-15T11:00:00Z',source:'statusline'}];
 const recent=limitHistoryView({history,tool:'codex',period:'30',now,esc:String,date:String});assert.doesNotMatch(recent,/90 %/);assert.match(recent,/2 von 3 Messpunkten/);
 const all=limitHistoryView({history,tool:'codex',period:'all',now,esc:String,date:String});assert.match(all,/90 %/);assert.match(all,/3 von 3 Messpunkten/);
});
