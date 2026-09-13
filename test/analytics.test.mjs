import test from 'node:test';
import assert from 'node:assert/strict';
import {analytics,bucketSeries,grouped,selectGroup,totals} from '../public/analytics-core.js';

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
