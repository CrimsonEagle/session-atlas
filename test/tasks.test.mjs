import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenTaskNode,taskForest,taskRows,taskTreeForSession,taskView} from '../public/tasks.js';

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
 const fork=session('fork',{relationType:'fork'}),child=session('child',{parentId:'fork',relationType:'subagent'}),html=taskView({sessions:[fork,child],compact:String,num:String,costText:row=>String(row.cost),basename:value=>value,toolTag:value=>value,date:String});
 assert.match(html,/<strong>2<\/strong><small>Sessions<\/small>/);assert.match(html,/data-session="codex:child"/);assert.match(html,/Eigen/);assert.match(html,/Mit Kindern/);assert.equal(taskRows([fork,child]).roots.length,1);
});

test('a session resolves to its complete task tree at arbitrary nesting depth',()=>{
 const root=session('root'),child=session('child',{parentId:'root',relationType:'subagent'}),grandchild=session('grandchild',{parentId:'child',relationType:'subagent'}),greatGrandchild=session('great-grandchild',{parentId:'grandchild',relationType:'subagent'});
 const tree=taskTreeForSession(grandchild,[root,child,grandchild,greatGrandchild]);
 assert.equal(tree.root.session.sessionId,'root');
 assert.deepEqual(tree.nodes.map(({node,depth})=>[node.session.sessionId,depth]),[['root',0],['child',1],['grandchild',2],['great-grandchild',3]]);
 assert.equal(flattenTaskNode(tree.root).at(-1).depth,3);
});
