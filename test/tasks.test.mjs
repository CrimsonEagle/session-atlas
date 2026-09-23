import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenTaskNode,taskForest,taskRows,taskTreeForSession,taskView} from '../public/tasks.js';
import {groupSelect} from '../public/group-select.js';

const event=(id,tokens,time='2026-09-15T10:00:00Z',model='gpt')=>({id,time,model,input:tokens,cache:0,write:0,output:0,reasoning:0,cost:tokens/1000});
const session=(id,{parentId='',relationType='',events=[event(id,10)],lastActivity='2026-09-15T10:00:00Z'}={})=>({id:`codex:${id}`,sessionId:id,tool:'codex',title:id,cwd:'C:/repo',repository:'C:/repo',parentId,relationType,subagent:Boolean(parentId),events,lastActivity});

test('task rows sum every session once and expose own versus inclusive usage',()=>{
 const root=session('root',{events:[event('root',100)]}),child=session('child',{parentId:'root',relationType:'subagent',events:[event('child',40)]}),grandchild=session('grandchild',{parentId:'child',relationType:'guardian_review',events:[event('grandchild',10)]});
 const rows=taskRows([root,child,grandchild]);
 assert.equal(rows.roots.length,1);assert.equal(rows.roots[0].own.tokens,100);assert.equal(rows.roots[0].total.tokens,150);assert.equal(rows.roots[0].contributing,3);
 assert.equal(rows.roots[0].children[0].own.tokens,40);assert.equal(rows.roots[0].children[0].total.tokens,50);
});

test('a filtered child keeps its parent as zero-value orientation',()=>{
 const root=session('root',{events:[event('root',100)]}),child=session('child',{parentId:'root',relationType:'subagent',events:[event('child',40)]});
 const rows=taskRows([child],[root,child]);
 assert.equal(rows.roots.length,1);assert.equal(rows.roots[0].session.id,'codex:root');assert.equal(rows.roots[0].contextOnly,true);assert.equal(rows.roots[0].own.tokens,0);assert.equal(rows.roots[0].total.tokens,40);assert.equal(rows.roots[0].contributing,1);
});

test('missing parents, conflicts, self references and cycles stay unassigned without recursion',()=>{
 const missing=session('missing',{parentId:'gone',relationType:'subagent'}),ambiguous=session('ambiguous',{relationType:'ambiguous'}),self=session('self',{parentId:'self',relationType:'subagent'}),a=session('a',{parentId:'b',relationType:'subagent'}),b=session('b',{parentId:'a',relationType:'subagent'});
 const forest=taskForest([missing,ambiguous,self,a,b]);
 assert.equal(forest.roots.length,0);assert.deepEqual(new Set(forest.unassigned.map(node=>node.session.sessionId)),new Set(['missing','ambiguous','self','a','b']));
});

test('forks remain independent tasks and markup offers session navigation',()=>{
 const fork=session('fork',{relationType:'fork'}),child=session('child',{parentId:'fork',relationType:'subagent'}),html=taskView({sessions:[fork,child],expandedTasks:new Set([fork.id]),compact:String,num:String,costText:row=>String(row.cost),basename:value=>value,toolTag:value=>value,date:String});
 assert.match(html,/<table class="task-table">/);assert.match(html,/<strong>2<\/strong><span class="row-subtitle">Sessions<\/span>/);assert.match(html,/data-session="codex:child"/);assert.match(html,/Eigen/);assert.match(html,/Mit Kindern/);assert.equal(taskRows([fork,child]).roots.length,1);
});

test('expanded tasks stay open when their markup is rendered again',()=>{
 const root=session('root'),closed=taskView({sessions:[root]}),open=taskView({sessions:[root],expandedTasks:new Set([root.id])});
 assert.match(closed,/data-task-fold="codex:root" aria-expanded="false"/);
 assert.match(open,/data-task-fold="codex:root" aria-expanded="true"/);
 assert.doesNotMatch(closed,/Verteilung auf Agents<\/h3>/);
 assert.match(open,/Verteilung auf Agents<\/h3>/);
});

test('task columns replace the sort dropdown and follow the selected direction',()=>{
 const small=session('small',{events:[event('small',10)]}),large=session('large',{events:[event('large',100)]});
 const ascending=taskView({sessions:[small,large],sort:'tokens',sortDirection:'asc'});
 const descending=taskView({sessions:[small,large],sort:'tokens',sortDirection:'desc'});
 assert.match(ascending,/<option value="tasks" selected>Aufgaben mit Agents<\/option>/);
 assert.doesNotMatch(ascending,/<select id="sort"/);
 assert.match(ascending,/data-sort-key="tokens"[^>]*aria-label="Tokens sortieren, aktuell aufsteigend"/);
 assert.ok(ascending.indexOf('data-task-id="codex:small"')<ascending.indexOf('data-task-id="codex:large"'));
 assert.ok(descending.indexOf('data-task-id="codex:large"')<descending.indexOf('data-task-id="codex:small"'));
});

test('task and session tables offer the same group choices with one visible provider',()=>{
 const taskMarkup=taskView({sessions:[session('root')],showToolGroup:false});
 const taskOptions=[...taskMarkup.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]);
 const sessionOptions=[...groupSelect('sessions',false).matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(taskOptions,sessionOptions);
 assert.equal(taskOptions.length,6);
 assert.ok(!taskOptions.includes('tool'));
 assert.match(taskMarkup,/<option value="tasks" selected>Aufgaben mit Agents<\/option>/);
 const twoProviderOptions=[...groupSelect('tool',true).matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(twoProviderOptions.length,7);
 assert.ok(twoProviderOptions.includes('tool'));
 assert.match(groupSelect('tool',true),/<option value="tool" selected>Nach KI-Tool<\/option>/);
});

test('task pages count roots while expanded descendants stay with their parent',()=>{
 const roots=Array.from({length:13},(_,index)=>session(`root-${index}`));
 const child=session('child',{parentId:'root-0',relationType:'subagent'});
 const first=taskView({sessions:[...roots,child],sort:'name',sortDirection:'asc',page:0,pageSize:12,expandedTasks:new Set([roots[0].id])});
 const second=taskView({sessions:[...roots,child],sort:'name',sortDirection:'asc',page:1,pageSize:12,expandedTasks:new Set([roots[0].id])});
 assert.match(first,/1–12 von 13 Aufgaben/);
 assert.match(first,/data-session="codex:child"/);
 assert.match(second,/13–13 von 13 Aufgaben/);
 assert.doesNotMatch(second,/data-session="codex:child"/);
});

test('a session resolves to its complete task tree at arbitrary nesting depth',()=>{
 const root=session('root'),child=session('child',{parentId:'root',relationType:'subagent'}),grandchild=session('grandchild',{parentId:'child',relationType:'subagent'}),greatGrandchild=session('great-grandchild',{parentId:'grandchild',relationType:'subagent'});
 const tree=taskTreeForSession(grandchild,[root,child,grandchild,greatGrandchild]);
 assert.equal(tree.root.session.sessionId,'root');
 assert.deepEqual(tree.nodes.map(({node,depth})=>[node.session.sessionId,depth]),[['root',0],['child',1],['grandchild',2],['great-grandchild',3]]);
 assert.equal(flattenTaskNode(tree.root).at(-1).depth,3);
});
