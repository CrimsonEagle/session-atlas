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
 assert.equal(middle[0].displayTotals.tokens,170);
 assert.equal(middle[0].displayTotals.cost,.17);
 assert.equal(middle[1].displayTotals.tokens,50);
 assert.equal(middle[0].ownTotals.tokens,100);
 assert.equal(middle[1].ownTotals.tokens,40);
 const expanded=sessionTreeRows(all,all,new Set([root.id,child.id]));
 assert.deepEqual(expanded.map(row=>row.sessionId),['root','child','grandchild','sibling']);
 assert.equal(expanded[0].displayTotals.tokens,170);
 assert.equal(expanded[1].displayTotals.tokens,50);
 assert.equal(expanded[0].displayTotals.cost,.17);
 assert.deepEqual(sessionTreeRows(all,all,new Set([root.id])).map(row=>row.sessionId),middle.map(row=>row.sessionId));
 for(const row of [collapsed[0],middle[0],expanded[0]]){
  const html=sessionRow(row,helpers);
  assert.match(html,/<strong>170<\/strong><span class="row-subtitle">Eigen: 100<\/span>/);
  assert.match(html,/<td class="numeric">0\.17<span class="row-subtitle">Eigen: 0\.1<\/span><\/td>/);
  assert.match(html,/3 Sub-Sessions · Summe/);
 }
});

test('filtered descendants retain a zero-value context parent and sum only selected usage',()=>{
 const root=session('root','',100),child=session('child','root',40),grandchild=session('grandchild','child',10);
 const rows=sessionTreeRows([grandchild],[root,child,grandchild]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].contextOnly,true);
 assert.equal(rows[0].displayTotals.tokens,10);
 assert.equal(rows[0].displayTotals.cost,.01);
 assert.match(sessionRow(rows[0],helpers),/1 Sub-Session · Summe/);
 assert.match(sessionRow(rows[0],helpers),/Eigen: –/);
});

test('token and cost sorting keep parent positions stable when children open',()=>{
 const first=session('first','',100),child=session('child','first',250),second=session('second','',180),all=[first,child,second];
 second.events[0].cost=.05;
 const ids=rows=>rows.map(row=>row.sessionId);
 for(const sort of ['tokens','cost']){
  for(const direction of ['asc','desc']){
   const closed=ids(sessionTreeRows(all,all,new Set(),sort,direction));
   const open=ids(sessionTreeRows(all,all,new Set([first.id]),sort,direction)).filter(id=>id!=='child');
   assert.deepEqual(open,closed,`${sort} ${direction}`);
  }
 }
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set(),'tokens','desc')),['first','second']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([first.id]),'tokens','desc')),['first','child','second']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([first.id]),'cost','desc')),['first','child','second']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set(),'cost','asc')),['second','first']);
});

test('nested siblings reorder when an intermediate session is collapsed',()=>{
 const root=session('root','',5),small=session('small','root',10),grandchild=session('grandchild','small',500),medium=session('medium','root',100),all=[root,small,grandchild,medium];
 const ids=rows=>rows.map(row=>row.sessionId);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set(),'tokens','desc')),['root']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([root.id]),'tokens','desc')),['root','small','medium']);
 assert.deepEqual(ids(sessionTreeRows(all,all,new Set([root.id,small.id]),'tokens','desc')),['root','small','grandchild','medium']);
});

test('last activity sorts by newest descendant regardless of expansion and shows the parent time separately',()=>{
 const first=session('first','',20),child=session('child','first',10),second=session('second','',40),all=[first,child,second];
 first.lastActivity='2026-09-10T08:00:00Z';child.lastActivity='2026-09-20T09:00:00Z';second.lastActivity='2026-09-17T08:00:00Z';
 const closed=sessionTreeRows(all,all,new Set(),'activity','desc');
 const open=sessionTreeRows(all,all,new Set([first.id]),'activity','desc');
 assert.deepEqual(closed.map(row=>row.sessionId),['first','second']);
 assert.deepEqual(open.map(row=>row.sessionId),['first','child','second']);
 assert.equal(open[0].displayActivity,child.lastActivity);
 assert.match(sessionRow(open[0],helpers),/2026-09-20T09:00:00Z<span class="row-subtitle">Eigen: 2026-09-10T08:00:00Z<\/span>/);
});

test('secondary token count stays exact when the main family total is abbreviated',()=>{
 const root=session('root','',12345),child=session('child','root',40000);
 const row=sessionTreeRows([root,child],[root,child])[0];
 const html=sessionRow(row,{...helpers,compact:n=>`${Math.round(n/1000)}T`,num:n=>new Intl.NumberFormat('de-DE').format(n)});
 assert.match(html,/<strong>52T<\/strong><span class="row-subtitle">Eigen: 12\.345<\/span>/);
});

test('unassigned sessions join the same top-level numeric order',()=>{
 const root=session('root','',10),unassigned=session('unassigned','',1000);
 unassigned.relationType='ambiguous';
 assert.deepEqual(sessionTreeRows([root,unassigned],[root,unassigned],new Set(),'tokens','desc').map(row=>row.sessionId),['unassigned','root']);
});
