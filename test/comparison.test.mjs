import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonView} from '../public/comparison.js';

const event=(time,model,input,cost)=>({time,model,input,cache:0,write:0,output:0,reasoning:0,cost});
const helpers={
 esc:value=>String(value),num:value=>String(value),compact:value=>String(value),money:value=>`$${Number(value).toFixed(2)}`,basename:value=>value.split('/').at(-1),toolName:value=>value
};

test('comparison view exposes periods, metrics, dimensions and applicable filters',()=>{
 const currentSessions=[{id:'one',tool:'codex',repository:'C:/repo/atlas',events:[event('2026-09-15T10:00:00Z','gpt',200,.02)]}];
 const previousSessions=[{id:'one',tool:'codex',repository:'C:/repo/atlas',events:[event('2026-09-08T10:00:00Z','gpt',100,.01)]}];
 const html=comparisonView({currentSessions,previousSessions,currentRange:{start:Date.parse('2026-09-15'),end:Date.parse('2026-09-15T23:59:59Z')},previousRange:{start:Date.parse('2026-09-08'),end:Date.parse('2026-09-08T23:59:59Z')},...helpers});
 assert.match(html,/Zeiträume vergleichen/);assert.match(html,/data-comparison-metric="cost"/);assert.match(html,/data-comparison-dimension="model"/);
 assert.match(html,/data-comparison-filter="repository"/);assert.match(html,/\+100 %/);assert.match(html,/comparison-line previous/);
});

test('comparison view marks new contributions and incomplete cost coverage',()=>{
 const currentSessions=[{id:'one',tool:'claude',repository:'C:/repo/new',events:[event('2026-09-15T10:00:00Z','unknown',50,null)]}];
 const range={start:Date.parse('2026-09-15'),end:Date.parse('2026-09-15T23:59:59Z')};
 const html=comparisonView({currentSessions,previousSessions:[],currentRange:range,previousRange:{start:Date.parse('2026-09-14'),end:Date.parse('2026-09-14T23:59:59Z')},metric:'cost',...helpers});
 assert.match(html,/eingeschränkt vergleichbar/);assert.match(html,/Neu/);assert.match(html,/aktuell 1/);
});
