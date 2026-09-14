import test from 'node:test';
import assert from 'node:assert/strict';
import {chartScopedSessions} from '../public/analytics-core.js';
import {createDetailViews} from '../public/details.js';

const event=(time,input)=>({id:time,time,model:'gpt',tier:'standard',input,cache:0,write:0,output:0,reasoning:0,cost:.01});

test('table-scoped data drives session and aggregate details while the full session stays available',t=>{
 const descriptors={innerWidth:Object.getOwnPropertyDescriptor(globalThis,'innerWidth'),addEventListener:Object.getOwnPropertyDescriptor(globalThis,'addEventListener')};
 Object.defineProperty(globalThis,'innerWidth',{value:1000,configurable:true});Object.defineProperty(globalThis,'addEventListener',{value:()=>{},configurable:true});
 t.after(()=>{for(const [key,descriptor] of Object.entries(descriptors))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 const raw={id:'one',sessionId:'one',tool:'codex',repository:'repo',cwd:'repo',branch:'main',subagent:false,title:'Session',events:[event('2026-09-10T10:00:00Z',100),event('2026-09-11T10:00:00Z',200)]};
 const selected=chartScopedSessions([raw],'overview','2026-09-10','day'),listeners={};
 const dialog={open:false,classList:{add(){},remove(){}},addEventListener(type,handler){listeners[type]=handler;},showModal(){this.open=true;},close(){this.open=false;}};
 const content={innerHTML:'',contains:()=>false,querySelector:()=>null};
 const views=createDetailViews({dialog,content,getData:()=>({sessions:[raw]}),getFiltered:()=>selected,getScope:()=>({period:'all',selectedChartLabel:'Ausgewählter Tag',bounds:{start:0,end:Date.now()},tool:'all',repository:'all',query:''}),applyFilter:()=>{},esc:String,num:String,compact:String,money:String,date:String,basename:String,toolName:String,toolTag:String,costText:value=>String(value.cost)});
 views.aggregate('repository','repo');assert.match(content.innerHTML,/<span>Tokens<\/span><strong>100<\/strong>/);assert.match(content.innerHTML,/Ausgewählter Tag/);
 views.session('one');assert.match(content.innerHTML,/<span>Tokens<\/span><strong>100<\/strong>/);assert.match(content.innerHTML,/Ausgewählter Tag/);
 const scopeTarget={closest:selector=>selector==='[data-detail-scope]'?{dataset:{detailScope:'all'}}:null};listeners.click({target:scopeTarget});
 assert.match(content.innerHTML,/<span>Tokens<\/span><strong>300<\/strong>/);assert.match(content.innerHTML,/Gesamte Session/);
});
