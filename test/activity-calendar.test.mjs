import test from 'node:test';
import assert from 'node:assert/strict';
import {activityCalendarView,activityDays,calendarMetricValue} from '../public/activity-calendar.js';

const event=(date,input,cost=.01)=>({time:date.toISOString(),input,cache:0,write:0,output:0,reasoning:0,cost,model:'test'});
const helpers={num:value=>String(value),compact:value=>String(value),money:value=>`$${Number(value).toFixed(2)}`};

test('calendar aggregates by local day across a daylight-saving change',()=>{
 const range={start:new Date(2026,2,28).getTime(),end:new Date(2026,2,30,23,59).getTime()};
 const sessions=[
  {id:'one',tool:'codex',events:[event(new Date(2026,2,28,22),20),event(new Date(2026,2,29,22),30,null)]},
  {id:'two',tool:'claude',events:[event(new Date(2026,2,29,12),50)]}
 ];
 const days=activityDays(sessions,range,new Date(2026,2,30,12));
 assert.equal(days.length,3);assert.deepEqual(days.map(day=>day.requests),[1,2,0]);
 assert.equal(days[1].tokens,80);assert.equal(days[1].sessionCount,2);assert.equal(days[1].unknown,1);
 assert.equal(days[1].tools.codex.requests,1);assert.equal(days[1].tools.claude.requests,1);
 assert.equal(days.reduce((sum,day)=>sum+calendarMetricValue(day,'tokens'),0),100);
});

test('calendar markup distinguishes selection, unknown costs, zero and future days',()=>{
 const range={start:new Date(2026,8,14).getTime(),end:new Date(2026,8,17,23,59).getTime()},now=new Date(2026,8,15,12).getTime();
 const sessions=[{id:'one',tool:'codex',events:[event(new Date(2026,8,14,10),10,null),event(new Date(2026,8,15,10),20,.02)]}];
 const html=activityCalendarView({sessions,range,now,selectedKey:'2026-09-15',metric:'cost',rangeMode:'2026',years:[2026],...helpers});
 assert.match(html,/data-overview-visual="chart"/);assert.match(html,/data-calendar-metric="requests"/);assert.match(html,/unknown-cost/);
 assert.match(html,/calendar-day level-4 selected/);assert.match(html,/calendar-day level-0 future" disabled/);
 assert.match(html,/Kalenderjahr 2026/);assert.match(html,/1 ohne Preis/);
});

test('calendar declines unbounded multi-year grids',()=>{
 const range={start:new Date(2025,0,1).getTime(),end:new Date(2026,11,31).getTime()};
 const html=activityCalendarView({sessions:[],range,years:[2026,2025],...helpers});
 assert.match(html,/höchstens 12 Monate/);
});

test('calendar includes leap day in a selected leap year',()=>{
 const range={start:new Date(2028,0,1).getTime(),end:new Date(2028,11,31,23,59).getTime()};
 const days=activityDays([],range,new Date(2028,11,31));
 assert.equal(days.length,366);assert.ok(days.some(day=>day.key==='2028-02-29'));
});
