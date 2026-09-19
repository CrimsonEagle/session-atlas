import test from 'node:test';
import assert from 'node:assert/strict';
import {updateLimitHistory} from '../lib/limit-history.mjs';
import {averageCostLimitWindows,estimateCostLimits,limitHistoryView} from '../public/limit-history.js';

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
 const html=limitHistoryView({history,tool:'codex',now:now+2*60*60*1000,esc:String,date:String});assert.equal((html.match(/class="limit-history-area"/g)||[]).length,2);assert.equal((html.match(/class="limit-history-line"/g)||[]).length,2);assert.equal((html.match(/class="limit-history-point window-300"/g)||[]).length,4);assert.match(html,/data-tip=/);assert.match(html,/class="limit-history-chart-wrap" data-tip-host/);assert.match(html,/viewBox="0 0 900 274"/);assert.match(html,/Flächen enden an Resetgrenzen/);assert.match(html,/Session-Log/);assert.match(html,/<option value="30" selected>/);
});

test('interactive limit legend filters usage chart and table together',()=>{
 const history=[
  {id:'five-1',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:20,sourceObservedAt:'2026-09-15T10:00:00Z',source:'session-log'},
  {id:'five-2',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:40,sourceObservedAt:'2026-09-15T11:00:00Z',source:'session-log'},
  {id:'week-1',tool:'codex',windowMinutes:10080,resetsAt:'2026-09-22T15:00:00Z',usedPercent:60,sourceObservedAt:'2026-09-15T09:00:00Z',source:'statusline'},
  {id:'week-2',tool:'codex',windowMinutes:10080,resetsAt:'2026-09-22T15:00:00Z',usedPercent:80,sourceObservedAt:'2026-09-15T12:00:00Z',source:'statusline'}];
 const full=limitHistoryView({history,tool:'codex',period:'all',now,esc:String,date:String});
 const html=limitHistoryView({history,tool:'codex',period:'all',visibleWindows:[300],now,esc:String,date:String});
 assert.match(html,/data-limit-history-window="300" class="" aria-pressed="true"/);
 assert.match(html,/data-limit-history-window="10080" class="is-hidden" aria-pressed="false"/);
 assert.equal((html.match(/class="limit-history-point window-300"/g)||[]).length,2);
 assert.doesNotMatch(html,/class="limit-history-point window-10080"/);
 assert.doesNotMatch(html,/>Wöchentlich<\/td>/);
 assert.match(html,/2 von 4 Messpunkten/);
 const fiveHourPoint=markup=>markup.match(/class="limit-history-point window-300"[^>]*><circle cx="([^"]+)" cy="([^"]+)"/)?.slice(1);
 assert.deepEqual(fiveHourPoint(html),fiveHourPoint(full));
});

test('history view limits chart and table to the selected date range',()=>{
 const history=[
  {id:'old',tool:'codex',windowMinutes:300,resetsAt:'2026-07-01T15:00:00Z',usedPercent:90,sourceObservedAt:'2026-07-01T10:00:00Z',source:'session-log'},
  {id:'new-1',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:20,sourceObservedAt:'2026-09-15T10:00:00Z',source:'session-log'},
  {id:'new-2',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:40,sourceObservedAt:'2026-09-15T11:00:00Z',source:'statusline'}];
 const recent=limitHistoryView({history,tool:'codex',period:'30',now,esc:String,date:String});assert.doesNotMatch(recent,/90 %/);assert.match(recent,/2 von 3 Messpunkten/);
 const all=limitHistoryView({history,tool:'codex',period:'all',now,esc:String,date:String});assert.match(all,/90 %/);assert.match(all,/3 von 3 Messpunkten/);
});

test('cost limits are extrapolated from spend inside each provider reset window',()=>{
 const history=[
  {id:'five',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:40,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'},
  {id:'week',tool:'codex',windowMinutes:10080,resetsAt:'2026-09-22T09:59:59Z',usedPercent:25,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'},
  {id:'zero',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:0,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'}];
 const sessions=[{tool:'codex',events:[
  {time:'2026-09-15T09:59:59Z',cost:9},
  {time:'2026-09-15T10:00:00Z',cost:1},
  {time:'2026-09-15T11:00:00Z',cost:2},
  {time:'2026-09-15T11:30:00Z',cost:null},
  {time:'2026-09-15T12:00:01Z',cost:8}]}];
 const [five,week,zero]=estimateCostLimits(history,sessions,'codex');
 assert.equal(five.windowCost,3);assert.equal(five.estimatedLimit,7.5);assert.equal(five.unknownCosts,1);assert.equal(five.requests,3);assert.equal(five.coverage,2/3);
 assert.equal(week.windowCost,12);assert.equal(week.estimatedLimit,48);assert.equal(week.unknownCosts,1);
 assert.equal(zero.estimatedLimit,null);
});

test('cost estimates collapse into one arithmetic mean per reset window',()=>{
 const points=[
  {windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',sourceObservedAt:'2026-09-15T11:00:00Z',estimatedLimit:10,windowCost:1,usedPercent:20,coverage:.5,unknownCosts:1},
  {windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',sourceObservedAt:'2026-09-15T12:00:00Z',estimatedLimit:14,windowCost:3,usedPercent:40,coverage:1,unknownCosts:0},
  {windowMinutes:300,resetsAt:'2026-09-15T20:00:00Z',sourceObservedAt:'2026-09-15T18:00:00Z',estimatedLimit:20,windowCost:4,usedPercent:20,coverage:1,unknownCosts:0},
  {windowMinutes:10080,resetsAt:'2026-09-22T10:00:00Z',sourceObservedAt:'2026-09-15T12:00:00Z',estimatedLimit:80,windowCost:8,usedPercent:10,coverage:1,unknownCosts:0}];
 const windows=averageCostLimitWindows(points),first=windows[0];
 assert.equal(windows.length,3);assert.equal(first.measurements,2);assert.equal(first.estimatedLimit,12);assert.equal(first.minEstimatedLimit,10);assert.equal(first.maxEstimatedLimit,14);assert.equal(first.windowCost,2);assert.equal(first.usedPercent,30);assert.equal(first.coverage,.75);assert.equal(first.incompleteMeasurements,1);assert.equal(first.sourceObservedAt,'2026-09-15T12:00:00Z');
});

test('cost-limit detail shows both temporal series and explains incomplete pricing',()=>{
 const history=[
  {id:'five',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:50,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'},
  {id:'week',tool:'codex',windowMinutes:10080,resetsAt:'2026-09-22T10:00:00Z',usedPercent:25,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'}];
 const sessions=[{tool:'codex',events:[{time:'2026-09-15T10:00:00Z',cost:2},{time:'2026-09-15T11:00:00Z',cost:null}]}];
 const html=limitHistoryView({history,sessions,tool:'codex',mode:'cost',period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(html,/arithmetischer Mittelwert/);assert.match(html,/window-300/);assert.match(html,/window-10080/);assert.match(html,/\$4\.00/);assert.match(html,/\$8\.00/);assert.match(html,/unbekannten Modellpreisen/);assert.match(html,/2 Fenstermittel aus 2 Messpunkten/);assert.match(html,/Kostenlimit/);
 assert.match(html,/<option value="window" selected>Fenstermittel<\/option>/);
 assert.match(html,/aria-label="Geschätzte nutzbare Kostenlimits im Zeitverlauf"/);assert.doesNotMatch(html,/<title id="limit-cost-title">/);
 const raw=limitHistoryView({history,sessions,tool:'codex',mode:'cost',aggregation:'raw',period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(raw,/<option value="raw" selected>Einzelmessungen<\/option>/);assert.match(raw,/2 Einzelmessungen/);assert.match(raw,/Jeder Punkt zeigt eine einzelne historische Hochrechnung/);assert.match(raw,/100%-Schätzung/);assert.doesNotMatch(raw,/2 Fenstermittel aus/);
 const fiveOnly=limitHistoryView({history,sessions,tool:'codex',mode:'cost',period:'all',visibleWindows:[300],now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(fiveOnly,/data-limit-history-window="10080" class="is-hidden" aria-pressed="false"/);assert.doesNotMatch(fiveOnly,/class="limit-cost-series window-10080"/);assert.doesNotMatch(fiveOnly,/>Wöchentlich<\/td>/);
 const fiveHourPath=markup=>markup.match(/class="limit-cost-series window-300"><path d="([^"]+)"/)?.[1];
 assert.equal(fiveHourPath(fiveOnly),fiveHourPath(html));
});
