import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateLimitHistory} from '../lib/limit-history.mjs';
import {averageCostLimitWindows,estimateCostLimits,limitHistoryView,rawCostTrend} from '../public/limit-history.js';

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
 const html=limitHistoryView({history,tool:'codex',now:now+2*60*60*1000,esc:String,date:String});assert.equal((html.match(/class="limit-history-area"/g)||[]).length,2);assert.equal((html.match(/class="limit-history-line"/g)||[]).length,2);assert.equal((html.match(/class="limit-history-point window-300"/g)||[]).length,4);assert.match(html,/data-tip=/);assert.doesNotMatch(html,/limit-history-hit/);assert.match(html,/class="limit-history-chart-wrap" data-tip-host/);assert.match(html,/viewBox="0 0 900 274"/);assert.match(html,/Flächen enden an Resetgrenzen/);assert.match(html,/Session-Log/);assert.match(html,/<option value="30" selected>/);
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

test('whole and fractional usage readings produce rounding ranges',()=>{
 const history=[
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:1,sourceObservedAt:'2026-09-15T12:00:00Z'},
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:1.2,sourceObservedAt:'2026-09-15T12:01:00Z'}];
 const sessions=[{tool:'codex',events:[{time:'2026-09-15T11:00:00Z',cost:.12}]}];
 const [whole,fractional]=estimateCostLimits(history,sessions,'codex');
 assert.equal(whole.estimatedLimit,12);
 assert.equal(whole.minRoundingLimit,8);
 assert.equal(whole.maxRoundingLimit,24);
 assert.equal(fractional.estimatedLimit,10);
 assert.ok(Math.abs(fractional.minRoundingLimit-9.6)<1e-10);
 assert.ok(Math.abs(fractional.maxRoundingLimit-12/1.15)<1e-10);
});

test('cost estimates collapse into one arithmetic mean per reset window',()=>{
 const points=[
  {windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',sourceObservedAt:'2026-09-15T11:00:00Z',estimatedLimit:10,minRoundingLimit:8,maxRoundingLimit:13,windowCost:1,usedPercent:20,coverage:.5,unknownCosts:1},
  {windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',sourceObservedAt:'2026-09-15T12:00:00Z',estimatedLimit:14,minRoundingLimit:13,maxRoundingLimit:16,windowCost:3,usedPercent:40,coverage:1,unknownCosts:0},
  {windowMinutes:300,resetsAt:'2026-09-15T20:00:00Z',sourceObservedAt:'2026-09-15T18:00:00Z',estimatedLimit:20,windowCost:4,usedPercent:20,coverage:1,unknownCosts:0},
  {windowMinutes:10080,resetsAt:'2026-09-22T10:00:00Z',sourceObservedAt:'2026-09-15T12:00:00Z',estimatedLimit:80,windowCost:8,usedPercent:10,coverage:1,unknownCosts:0}];
 const windows=averageCostLimitWindows(points),first=windows[0];
 assert.equal(windows.length,3);assert.equal(first.measurements,2);assert.equal(first.estimatedLimit,12);assert.equal(first.minRoundingLimit,10.5);assert.equal(first.maxRoundingLimit,14.5);assert.equal(first.minEstimatedLimit,10);assert.equal(first.maxEstimatedLimit,14);assert.equal(first.windowCost,2);assert.equal(first.usedPercent,30);assert.equal(first.coverage,.75);assert.equal(first.incompleteMeasurements,1);assert.equal(first.sourceObservedAt,'2026-09-15T12:00:00Z');
});

test('cost-limit detail shows both temporal series and explains incomplete pricing',()=>{
 const history=[
  {id:'five',tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:50,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'},
  {id:'week',tool:'codex',windowMinutes:10080,resetsAt:'2026-09-22T10:00:00Z',usedPercent:25,sourceObservedAt:'2026-09-15T12:00:00Z',source:'session-log'}];
 const sessions=[{tool:'codex',events:[{time:'2026-09-15T10:00:00Z',cost:2},{time:'2026-09-15T11:00:00Z',cost:null}]}];
 const html=limitHistoryView({history,sessions,tool:'codex',mode:'cost',aggregation:'window',period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(html,/arithmetischen Mittelwert/);assert.match(html,/window-300/);assert.match(html,/window-10080/);assert.match(html,/\$4\.00/);assert.match(html,/\$8\.00/);assert.match(html,/unbekannten Modellpreisen/);assert.match(html,/2 Fenstermittel aus 2 Messpunkten/);assert.match(html,/Kostenlimit/);
 assert.match(html,/<option value="window" selected>Fenstermittel<\/option>/);
 assert.match(html,/aria-label="Geschätzte nutzbare Kostenlimits im Zeitverlauf"/);assert.doesNotMatch(html,/<title id="limit-cost-title">/);
 assert.equal((html.match(/class="limit-cost-center"/g)||[]).length,2,'a single reading per series still shows a short center line');
 assert.doesNotMatch(html,/limit-cost-whisker|limit-cost-trend-dot|limit-cost-hit/);
 const raw=limitHistoryView({history,sessions,tool:'codex',mode:'cost',aggregation:'raw',period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(raw,/<option value="raw" selected>Einzelmessungen<\/option>/);assert.match(raw,/2 Einzelmessungen/);assert.match(raw,/Jeder Punkt zeigt eine einzelne historische Hochrechnung/);assert.match(raw,/100%-Schätzung/);assert.doesNotMatch(raw,/2 Fenstermittel aus/);
 const defaultView=limitHistoryView({history,sessions,tool:'codex',mode:'cost',period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(defaultView,/<option value="raw" selected>Einzelmessungen<\/option>/);
 const fiveOnly=limitHistoryView({history,sessions,tool:'codex',mode:'cost',aggregation:'window',period:'all',visibleWindows:[300],now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(fiveOnly,/data-limit-history-window="10080" class="is-hidden" aria-pressed="false"/);assert.doesNotMatch(fiveOnly,/class="limit-cost-series window-10080"/);assert.doesNotMatch(fiveOnly,/>Wöchentlich<\/td>/);
 const fiveHourPath=markup=>markup.match(/class="limit-cost-center" d="([^"]+)"/)?.[1];
 assert.equal(fiveHourPath(fiveOnly),fiveHourPath(html));
});

test('cost chart renders a central curve and two rounding envelope curves',()=>{
 const history=[
  {tool:'claude',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:1,sourceObservedAt:'2026-09-15T12:00:00Z'},
  {tool:'claude',windowMinutes:300,resetsAt:'2026-09-15T20:00:00Z',usedPercent:10,sourceObservedAt:'2026-09-15T18:00:00Z'}];
 const sessions=[{tool:'claude',events:[{time:'2026-09-15T11:00:00Z',cost:.1},{time:'2026-09-15T17:00:00Z',cost:1}]}];
 for(const aggregation of ['window','raw']){
  const html=limitHistoryView({history,sessions,tool:'claude',mode:'cost',aggregation,period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
  assert.match(html,/class="limit-cost-band"/);
  assert.equal((html.match(/class="limit-cost-boundary"/g)||[]).length,2);
  assert.match(html,/class="limit-cost-center"/);
  assert.match(html,/Rundungsbereich/);
  assert.match(html,/\$6\.67 – \$20\.00/);
  if(aggregation==='raw'){
   const axisMaximum=Number(html.match(/<text x="72" y="24" text-anchor="end">\$([\d.]+)<\/text>/)?.[1]);
   assert.ok(axisMaximum<15,'raw axis follows the robust envelope, not the isolated 1% upper bound');
  }
 }
});

test('window averages keep their own dots but share the raw trend and envelope',()=>{
 const history=[
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:1,sourceObservedAt:'2026-09-15T12:00:00Z'},
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:10,sourceObservedAt:'2026-09-15T13:00:00Z'},
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-18T15:00:00Z',usedPercent:10,sourceObservedAt:'2026-09-18T12:00:00Z'},
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-18T15:00:00Z',usedPercent:11,sourceObservedAt:'2026-09-18T13:00:00Z'}];
 const sessions=[{tool:'codex',events:[
  {time:'2026-09-15T11:00:00Z',cost:1},
  {time:'2026-09-18T11:00:00Z',cost:1}]}];
 const options={history,sessions,tool:'codex',mode:'cost',period:'all',now:Date.parse('2026-09-18T14:00:00Z'),esc:String,date:String,money:value=>`$${value.toFixed(2)}`};
 const windowHtml=limitHistoryView({...options,aggregation:'window'});
 const rawHtml=limitHistoryView({...options,aggregation:'raw'});
 const paths=html=>[...html.matchAll(/class="limit-cost-(?:center|boundary|band)" d="([^"]+)"/g)].map(match=>match[0]);
 assert.deepEqual(paths(windowHtml),paths(rawHtml));
 assert.equal((windowHtml.match(/class="limit-cost-point"/g)||[]).length,2);
 assert.equal((rawHtml.match(/class="limit-cost-point"/g)||[]).length,4);
 assert.match(windowHtml,/\$55\.00/);
 assert.match(windowHtml,/Linien und Hüllkurven zeigen denselben robusten Trend/);
});

test('raw trend downweights low-usage spikes and incomplete prices without disappearing',()=>{
 const min=Date.parse('2026-09-15T10:00:00Z'),at=new Date(min+3600000).toISOString(),point=(estimate,usage,low,high,unknownCosts=0)=>({sourceObservedAt:at,estimatedLimit:estimate,usedPercent:usage,minRoundingLimit:low,maxRoundingLimit:high,unknownCosts});
 const trend=rawCostTrend([point(100,1,66,200),point(10,20,9.75,10.25),point(12,20,11.7,12.3),point(1000,50,900,1100,1)],min,min+6*3600000);
 assert.equal(trend.length,1);
 assert.equal(trend[0].estimatedLimit,11);
 assert.ok(trend[0].minRoundingLimit<trend[0].estimatedLimit);
 assert.ok(trend[0].maxRoundingLimit>trend[0].estimatedLimit);
 const incompleteOnly=rawCostTrend([point(30,5,27,null,1)],min,min+6*3600000);
 assert.equal(incompleteOnly.length,1);
 assert.equal(incompleteOnly[0].estimatedLimit,30);
 assert.equal(incompleteOnly[0].maxRoundingLimit,30);
});

test('raw chart keeps a continuous trend across distant readings',()=>{
 const history=[
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:1,sourceObservedAt:'2026-09-15T12:00:00Z'},
  {tool:'codex',windowMinutes:300,resetsAt:'2026-09-18T15:00:00Z',usedPercent:10,sourceObservedAt:'2026-09-18T12:00:00Z'}];
 const sessions=[{tool:'codex',events:[{time:'2026-09-15T11:00:00Z',cost:.1},{time:'2026-09-18T11:00:00Z',cost:1}]}];
 const html=limitHistoryView({history,sessions,tool:'codex',mode:'cost',aggregation:'raw',period:'all',now:Date.parse('2026-09-18T13:00:00Z'),esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(html,/class="limit-cost-series window-300 raw"/);
 assert.equal((html.match(/class="limit-cost-center"/g)||[]).length,1);
 assert.equal((html.match(/class="limit-cost-whisker"/g)||[]).length,0);
 assert.equal((html.match(/class="limit-cost-point"/g)||[]).length,2);
});

test('a single raw trend reading still draws a visible line',()=>{
 const history=[{tool:'codex',windowMinutes:300,resetsAt:'2026-09-15T15:00:00Z',usedPercent:5,sourceObservedAt:'2026-09-15T12:00:00Z'}];
 const sessions=[{tool:'codex',events:[{time:'2026-09-15T11:00:00Z',cost:.3},{time:'2026-09-15T11:30:00Z',cost:null}]}];
 const html=limitHistoryView({history,sessions,tool:'codex',mode:'cost',aggregation:'raw',period:'all',now,esc:String,date:String,money:value=>`$${value.toFixed(2)}`});
 assert.match(html,/class="limit-cost-center" d="M [^\"]+ L [^\"]+"/);
 assert.doesNotMatch(html,/limit-cost-whisker|limit-cost-trend-dot|limit-cost-hit/);
 assert.match(html,/class="limit-cost-point[^"]*"[^>]*data-tip="[^"]+"[^>]*><circle[^>]+r="3\.2"\/><\/g>/);
 assert.match(html,/Antworten ohne Preis/);
});

test('missing prices do not change the appearance of cost-chart markers',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\.limit-cost-point\.incomplete\b/);
 assert.doesNotMatch(css,/\.limit-cost-series\.raw \.limit-cost-point\.incomplete\b/);
});
