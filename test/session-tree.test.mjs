import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionTreeRows} from '../public/session-tree.js';
import {sessionRow} from '../public/session-row.js';

const session=(id,parentId='',tokens=10)=>({id:`codex:${id}`,sessionId:id,tool:'codex',title:id,repository:'C:/repo',parentId,relationType:parentId?'subagent':'',subagent:!!parentId,lastActivity:'2026-09-15T10:00:00Z',events:[{time:'2026-09-15T10:00:00Z',model:'gpt',input:tokens,cache:0,write:0,output:0,reasoning:0,cost:tokens/1000}]});
const helpers={esc:String,compact:String,costText:row=>String(row.cost),date:String,basename:String,toolTag:String,num:String};

test('session tree starts collapsed and opening any level keeps descendant totals correct',()=>{
 const root=session('root','',100),child=session('child','root',40),grandchild=session('grandchild','child',10),sibling=session('sibling','root',20),all=[root,child,grandchild,sibling];
 const collapsed=sessionTreeRows(all,all);
 assert.deepEqual(collapsed.map(row=>row.sessionId),['root']);
 assert.equal(collapsed[0].displayTotals.tokens,170);
 assert.equal(collapsed[0].displayTotals.cost,.17);
 assert.equal(collapsed[0].descendantCount,3);
 assert.match(sessionRow(collapsed[0],helpers),/aria-expanded="false"/);
 assert.match(sessionRow(collapsed[0],helpers),/3 Sub-Sessions · Summe/);
 assert.match(sessionRow(collapsed[0],helpers),/<strong>170<\/strong>/);
 const middle=sessionTreeRows(all,all,new Set([root.id]));
 assert.deepEqual(middle.map(row=>row.sessionId),['root','child','sibling']);
 assert.equal(middle[0].displayTotals.tokens,100);
 assert.equal(middle[1].displayTotals.tokens,50);
 const expanded=sessionTreeRows(all,all,new Set([root.id,child.id]));
 assert.deepEqual(expanded.map(row=>row.sessionId),['root','child','grandchild','sibling']);
 assert.deepEqual(sessionTreeRows(all,all,new Set([root.id])).map(row=>row.sessionId),middle.map(row=>row.sessionId));
});

test('filtered descendants retain a zero-value context parent and sum only selected usage',()=>{
 const root=session('root','',100),child=session('child','root',40),grandchild=session('grandchild','child',10);
 const rows=sessionTreeRows([grandchild],[root,child,grandchild]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].contextOnly,true);
 assert.equal(rows[0].displayTotals.tokens,10);
 assert.equal(rows[0].displayTotals.cost,.01);
 assert.match(sessionRow(rows[0],helpers),/1 Sub-Session · Summe/);
});

test('token and cost sorting use each row’s visible own or inclusive value',()=>{
 const first=session('first','',100),child=session('child','first',250),second=session('second','',180),all=[first,child,second];
 second.events[0].cost=.05;
 const ids=rows=>rows.map(row=>row.sessionId);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set(),'tokens','desc')),['first','second']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([first.id]),'tokens','desc')),['second','first','child']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([first.id]),'cost','desc')),['first','child','second']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set(),'cost','asc')),['second','first']);
});

test('nested siblings reorder when an intermediate session is collapsed',()=>{
 const root=session('root','',5),small=session('small','root',10),grandchild=session('grandchild','small',500),medium=session('medium','root',100),all=[root,small,grandchild,medium];
 const ids=rows=>rows.map(row=>row.sessionId);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set(),'tokens','desc')),['root']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([root.id]),'tokens','desc')),['root','small','medium']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([root.id,small.id]),'tokens','desc')),['root','medium','small','grandchild']);
});

test('unassigned sessions join the same top-level numeric order',()=>{
 const root=session('root','',10),unassigned=session('unassigned','',1000);
 unassigned.relationType='ambiguous';
 assert.deepEqual(sessionTreeRows([root,unassigned],[root,unassigned],new Set(),'tokens','desc').map(row=>row.sessionId),['unassigned','root']);
});
