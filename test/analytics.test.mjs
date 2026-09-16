import test from 'node:test';
import assert from 'node:assert/strict';
import {analytics,bucketSeries,chartScopedSessions,comparisonRange,comparisonRows,filterSessions,grouped,periodKey,rangeForPeriod,relativeSeries,selectGroup,selectPeriod,totals} from '../public/analytics-core.js';

const event=(time,model,tokens,cost=.01,extra={})=>({time,model,input:tokens,cache:0,write:0,output:0,reasoning:0,cost,tier:'standard',...extra});
const sessions=[
 {id:'one',tool:'codex',repository:'C:/repo-a',branch:'main',subagent:false,events:[event('2026-09-10T10:00:00Z','gpt',100),event('2026-09-11T10:00:00Z','gpt',200,null,{cache:50,input:150})]},
 {id:'two',tool:'claude',repository:'C:/repo-a',branch:'feature',subagent:true,events:[event('2026-09-11T11:00:00Z','sonnet',300,.03)]}
];

test('analytics reports efficiency, coverage and concentration',()=>{
 const result=analytics(sessions);assert.equal(result.tokens,600);assert.equal(result.sessionCount,2);assert.equal(result.activeDays,2);
 assert.equal(result.priceCoverage,2/3);assert.equal(result.averagePerSession,300);assert.equal(result.top3Share,1);
});

test('grouping and selection keep only events belonging to the requested model',()=>{
 const groups=grouped(sessions,'model');assert.deepEqual(groups.map(group=>group.name).sort(),['gpt','sonnet']);
 const selected=selectGroup(sessions,'model','gpt');assert.equal(selected.length,1);assert.equal(totals(selected[0].events).tokens,300);
});

test('period selection keeps only events and sessions from the selected chart bucket',()=>{
 const selected=selectPeriod(sessions,'2026-09-11','day');
 assert.equal(selected.length,2);assert.deepEqual(selected.map(session=>session.events.length),[1,1]);
 assert.equal(totals(selected.flatMap(session=>session.events)).tokens,500);
 assert.equal(periodKey('2026-09-10T10:00:00Z','month'),'2026-09-01');
});

test('overview chart selection is the shared scope for table and details',()=>{
 const selected=chartScopedSessions(sessions,'overview','2026-09-10','day');
 assert.equal(totals(selected.flatMap(session=>session.events)).tokens,100);
 assert.equal(totals(chartScopedSessions(sessions,'sessions','2026-09-10','day').flatMap(session=>session.events)).tokens,600);
});

test('series separates providers and supports request counts',()=>{
 const result=bucketSeries(sessions,'requests');assert.equal(result.rows.length,2);
 assert.deepEqual(result.rows.map(row=>[row.codex,row.claude]),[[1,0],[1,1]]);
});

test('series fills idle periods so the chart axis never skips time',()=>{
 const gapped=[{id:'three',tool:'codex',repository:'C:/repo-b',branch:'main',subagent:false,events:[event('2026-09-10T10:00:00Z','gpt',100),event('2026-09-14T10:00:00Z','gpt',100)]}];
 const result=bucketSeries(gapped,'requests');assert.equal(result.period,'day');
 assert.deepEqual(result.rows.map(row=>row.codex),[1,0,0,0,1]);
 const keys=result.rows.map(row=>row.key);assert.deepEqual([...keys].sort(),keys);
});

test('series chooses aggregation by touched calendar buckets and preserves all totals',()=>{
 const long=[{id:'long',tool:'codex',events:[event('2025-01-01T12:00:00Z','gpt',100),event('2026-02-25T12:00:00Z','gpt',100)]}];
 const result=bucketSeries(long,'tokens');assert.equal(result.period,'month');assert.equal(result.rows.reduce((sum,row)=>sum+row.codex+row.claude,0),200);
 assert.equal(result.rows[0].key,'2025-01-01');assert.equal(result.rows.at(-1).key,'2026-02-01');
});

test('series honors custom bucket limits without silently dropping earlier events',()=>{
 const range=[{id:'range',tool:'claude',events:[event('2026-01-31T12:00:00Z','sonnet',40),event('2026-03-01T12:00:00Z','sonnet',60)]}];
 const result=bucketSeries(range,'tokens',2);assert.equal(result.period,'month');assert.equal(result.rows.length,3);
 assert.equal(result.rows.reduce((sum,row)=>sum+row.codex+row.claude,0),100);
});

test('series counts local calendar days across a daylight-saving boundary',()=>{
 const first=new Date(2026,2,28,12).toISOString(),last=new Date(2026,2,30,12).toISOString();
 const result=bucketSeries([{id:'dst',tool:'codex',events:[event(first,'gpt',25),event(last,'gpt',75)]}],'tokens',3);
 assert.equal(result.period,'day');assert.equal(result.rows.length,3);assert.equal(result.rows.reduce((sum,row)=>sum+row.codex,0),100);
});

test('shared period ranges follow local calendar boundaries',()=>{
 const now=new Date(2026,8,15,14,30).getTime();
 const week=rangeForPeriod('week',{now}),month=rangeForPeriod('month',{now}),rolling=rangeForPeriod('7',{now});
 assert.equal(new Date(week.start).getDay(),1);assert.equal(new Date(week.start).getDate(),14);
 assert.equal(new Date(month.start).getDate(),1);assert.equal(new Date(rolling.start).getDate(),9);
 assert.equal(week.end,now);
});

test('the twelve-month range keeps local calendar days and includes today',()=>{
 const now=new Date(2026,8,15,14,30).getTime(),range=rangeForPeriod('12months',{now});
 assert.equal(new Date(range.start).getFullYear(),2025);assert.equal(new Date(range.start).getMonth(),8);assert.equal(new Date(range.start).getDate(),16);
 assert.equal(range.end,now);
});

test('previous comparisons retain elapsed local time across daylight-saving changes',()=>{
 const current=rangeForPeriod('7',{now:new Date(2026,2,30,14,15).getTime()});
 const previous=comparisonRange(current,'previous');
 assert.equal(new Date(previous.start).getHours(),0);assert.equal(new Date(previous.end).getHours(),14);
 assert.equal(new Date(previous.start).getDate(),17);assert.equal(new Date(previous.end).getDate(),23);
});

test('running calendar months compare the same elapsed section of the previous month',()=>{
 const current=rangeForPeriod('month',{now:new Date(2026,2,31,16,0).getTime()});
 const previous=comparisonRange(current,'month');
 assert.equal(new Date(previous.start).getMonth(),1);assert.equal(new Date(previous.start).getDate(),1);
 assert.equal(new Date(previous.end).getMonth(),1);assert.equal(new Date(previous.end).getDate(),28);
 assert.equal(new Date(previous.end).getHours(),16);
});

test('the default comparison also matches elapsed month sections',()=>{
 const current=rangeForPeriod('month',{now:new Date(2026,8,15,11,30).getTime()});
 const previous=comparisonRange(current);
 assert.equal(new Date(previous.start).getMonth(),7);assert.equal(new Date(previous.start).getDate(),1);
 assert.equal(new Date(previous.end).getMonth(),7);assert.equal(new Date(previous.end).getDate(),15);assert.equal(new Date(previous.end).getHours(),11);
});

test('shared filtering applies model selection to events while retaining other controls',()=>{
 const range={start:new Date('2026-09-11T00:00:00Z').getTime(),end:new Date('2026-09-12T00:00:00Z').getTime()};
 const selected=filterSessions(sessions,{tool:'all',repository:'C:/repo-a',model:'gpt',query:''},range);
 assert.equal(selected.length,1);assert.equal(selected[0].events.length,1);assert.equal(selected[0].events[0].model,'gpt');
});

test('comparison contributions add up to the total change for one dimension',()=>{
 const current=filterSessions(sessions,{tool:'all',repository:'all',model:'all',query:''},{start:Date.parse('2026-09-11T00:00:00Z'),end:Date.parse('2026-09-12T00:00:00Z')});
 const previous=filterSessions(sessions,{tool:'all',repository:'all',model:'all',query:''},{start:Date.parse('2026-09-10T00:00:00Z'),end:Date.parse('2026-09-11T00:00:00Z')-1});
 const rows=comparisonRows(current,previous,'model','tokens');
 assert.equal(rows.reduce((sum,row)=>sum+row.delta,0),totals(current.flatMap(s=>s.events)).tokens-totals(previous.flatMap(s=>s.events)).tokens);
});

test('relative comparison series keeps idle local days explicit',()=>{
 const range={start:new Date(2026,8,10).getTime(),end:new Date(2026,8,12,23,59).getTime()};
 const selected=filterSessions(sessions,{tool:'all',repository:'all',model:'all',query:''},range);
 const rows=relativeSeries(selected,range,'requests');
 assert.equal(rows.length,3);assert.deepEqual(rows.map(row=>row.value),[1,2,0]);
});
