import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackground,backgroundSize,BACKGROUND_FPS,BACKGROUND_MAX_PIXELS} from '../public/background.js';

function setup({visible=true,reduced=false,saved=null,savedFps=null,blockedStorage=false,deferred=false,fail=false}={}) {
 const document=new EventTarget(),window=new EventTarget(),media=new EventTarget(),canvas=new EventTarget();
 const state={},button={setAttribute:(key,value)=>state[key]=value},hint={},fpsSelect={value:''};
 const frames=new Map(),draws=[];let id=0,initializations=0,destroyed=0,resolve;
 document.documentElement={dataset:{}};document.visibilityState=visible?'visible':'hidden';
 document.querySelector=selector=>({'#background-toggle':button,'#background-status':hint,'#background-fps':fpsSelect})[selector];
 media.matches=reduced;window.matchMedia=()=>media;
 window.setTimeout=()=>{throw Error('Animation must not create timers');};
 window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};window.cancelAnimationFrame=id=>frames.delete(id);
 const stored=new Map([['session-atlas-background',saved],['session-atlas-background-fps',savedFps]]);
 Object.defineProperty(window,'localStorage',{get:()=>{
  if(blockedStorage)throw Error('Storage blocked');
  return {getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
 }});
 const scene={canvas,resize(){},draw:time=>draws.push(time),destroy:()=>destroyed++};
 const createScene=()=>{initializations++;if(fail)return Promise.reject(Error('WebGL unavailable'));return deferred?new Promise(r=>resolve=r):Promise.resolve(scene);};
 const background=createBackground({document,window,createScene});
 return {document,window,media,canvas,background,stored,state,draws,frames,hint,fpsSelect,
  initializations:()=>initializations,destroyed:()=>destroyed,resolve:()=>resolve(scene),
  motion:()=>document.documentElement.dataset.backgroundMotion,
  visibility:value=>{document.visibilityState=value?'visible':'hidden';document.dispatchEvent(new Event('visibilitychange'));},
  frame:now=>{const [key,fn]=frames.entries().next().value;frames.delete(key);fn(now);},
  toggle:()=>{const event=new Event('click');Object.defineProperty(event,'target',{value:{closest:()=>button}});document.dispatchEvent(event);},
  changeFps:value=>{const event=new Event('change');Object.defineProperty(event,'target',{value:{id:'background-fps',value}});document.dispatchEvent(event);},
 };
}

test('hide/minimize cancels pending frames; stale callbacks never render',async()=>{
 const app=setup();await app.background.ready;
 assert.equal(app.motion(),'running');assert.equal(app.frames.size,1);
 const staleFrame=[...app.frames.values()][0],before=app.draws.length;
 app.visibility(false);assert.equal(app.frames.size,0);staleFrame(1000);
 assert.equal(app.draws.length,before);assert.equal(app.frames.size,0);
 app.visibility(true);assert.equal(app.frames.size,1);
});

test('animation progresses and resumes without a hidden-time jump or duplicate loops',async()=>{
 const app=setup();await app.background.ready;
 app.frame(1000);app.frame(1050);
 assert.ok(app.draws.at(-1)>app.draws.at(-2));
 const time=app.draws.at(-1);app.visibility(false);app.visibility(true);app.visibility(true);
 assert.equal(app.frames.size,1);app.frame(500000);
 assert.ok(app.draws.at(-1)-time<.1);
});

test('all FPS choices cap rendering at their limit or the available monitor frames',async()=>{
 for(const fps of ['30','60','120','144','monitor'])for(const hz of [30,60,75,120,144,240]){
  const app=setup({savedFps:fps});await app.background.ready;
  const initialDraws=app.draws.length;
  for(let frame=0;frame<hz;frame++)app.frame(frame*1000/hz);
  assert.equal(app.draws.length-initialDraws,fps==='monitor'?hz:Math.min(Number(fps),hz),`${fps} FPS at ${hz} Hz`);
  assert.equal(app.frames.size,1);
  app.background.stop();assert.equal(app.frames.size,0);
 }
});

test('FPS changes apply live, persist, and never create duplicate render loops',async()=>{
 const app=setup();await app.background.ready;
 assert.equal(app.background.fps,String(BACKGROUND_FPS));
 app.frame(0);app.changeFps('30');
 assert.equal(app.background.fps,'30');assert.equal(app.fpsSelect.value,'30');
 assert.equal(app.stored.get('session-atlas-background-fps'),'30');
 let before=app.draws.length;
 for(let i=0;i<144;i++)app.frame(1000+i*1000/144);
 assert.equal(app.draws.length-before,30);assert.equal(app.frames.size,1);
 app.changeFps('monitor');before=app.draws.length;
 for(let i=0;i<144;i++)app.frame(2000+i*1000/144);
 assert.equal(app.draws.length-before,144);assert.equal(app.frames.size,1);
 app.visibility(false);app.changeFps('120');assert.equal(app.frames.size,0);
 app.visibility(true);assert.equal(app.frames.size,1);
 app.toggle();app.changeFps('144');assert.equal(app.frames.size,0);
 app.toggle();assert.equal(app.frames.size,1);assert.equal(app.background.fps,'144');
});

test('invalid FPS choices fall back safely and blocked storage leaves controls usable',async()=>{
 for(const savedFps of [null,'0','Infinity','999','<script>']){
  const app=setup({savedFps});await app.background.ready;
  assert.equal(app.background.fps,'60');app.changeFps('invalid');assert.equal(app.background.fps,'60');
  app.background.stop();
 }
 const app=setup({blockedStorage:true});await app.background.ready;app.changeFps('120');
 assert.equal(app.background.fps,'120');assert.equal(app.frames.size,1);
 const disabled=setup({saved:'off'});disabled.changeFps('monitor');
 assert.equal(disabled.initializations(),0);assert.equal(disabled.frames.size,0);
 const reduced=setup({reduced:true});await reduced.background.ready;reduced.changeFps('monitor');
 assert.equal(reduced.frames.size,0);
});

test('hidden or disabled startup is lazy; late initialization cannot start hidden work',async()=>{
 for(const options of [{visible:false},{saved:'off'}]){
  const app=setup(options);await app.background.ready;
  assert.equal(app.initializations(),0);assert.equal(app.frames.size,0);
 }
 const app=setup({deferred:true});app.visibility(false);app.resolve();await app.background.ready;
 assert.equal(app.draws.length,0);assert.equal(app.frames.size,0);
 app.visibility(true);assert.equal(app.draws.length,1);assert.equal(app.frames.size,1);
});

test('reduced motion draws a still frame and responds to live preference changes',async()=>{
 const app=setup({reduced:true});await app.background.ready;
 assert.equal(app.draws.length,1);assert.equal(app.frames.size,0);assert.match(app.hint.textContent,/Reduzierte Bewegung/);
 app.media.matches=false;app.media.dispatchEvent(new Event('change'));assert.equal(app.frames.size,1);
 app.media.matches=true;app.media.dispatchEvent(new Event('change'));assert.equal(app.frames.size,0);
 app.visibility(false);const count=app.draws.length;app.window.dispatchEvent(new Event('resize'));assert.equal(app.draws.length,count);
});

test('switch persists and blocked storage does not break pause or resume',async()=>{
 for(const blockedStorage of [false,true]){
  const app=setup({blockedStorage});await app.background.ready;app.toggle();
  assert.equal(app.frames.size,0);assert.equal(app.background.enabled,false);
  assert.equal(app.document.documentElement.dataset.background,'off');assert.equal(app.state['aria-checked'],'false');
  if(!blockedStorage)assert.equal(app.stored.get('session-atlas-background'),'off');
  app.toggle();assert.equal(app.frames.size,1);
 }
});

test('BFCache and WebGL context loss stop rendering; disposal releases the scene',async()=>{
 const app=setup();await app.background.ready;
 app.window.dispatchEvent(new Event('pagehide'));app.visibility(true);assert.equal(app.frames.size,0);
 app.window.dispatchEvent(new Event('pageshow'));assert.equal(app.frames.size,1);
 app.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(app.frames.size,0);
 app.visibility(false);app.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(app.frames.size,0);
 app.visibility(true);assert.equal(app.frames.size,1);
 app.background.stop();assert.equal(app.frames.size,0);assert.equal(app.destroyed(),1);
 app.visibility(true);app.toggle();app.window.dispatchEvent(new Event('pageshow'));assert.equal(app.frames.size,0);
 const pending=setup({deferred:true});pending.background.stop();pending.resolve();await pending.background.ready;
 assert.equal(pending.destroyed(),1);assert.equal(pending.draws.length,0);
});

test('WebGL failure is nonfatal and exposes a useful status',async()=>{
 const app=setup({fail:true});await app.background.ready;
 assert.equal(app.frames.size,0);assert.match(app.background.status,/WebGL/);
 app.visibility(true);assert.equal(app.initializations(),1);
});

test('render resolution stays bounded, including high DPI and ultra-wide displays',()=>{
 for(const [width,height] of [[390,844],[1920,1080],[3840,2160],[7680,4320],[10000,1000]]){
  for(const dpr of [1,1.25,1.5,2,3]){
   const size=backgroundSize(width,height,dpr);
   assert.ok(size.width*size.height<=BACKGROUND_MAX_PIXELS);
   assert.ok(size.width<=width*Math.min(dpr,2)&&size.height<=height*Math.min(dpr,2));
  }
 }
 assert.deepEqual(backgroundSize(1920,1080),{width:1920,height:1080});
 assert.deepEqual(backgroundSize(1920,1080,2),{width:3840,height:2160});
 assert.deepEqual(backgroundSize(3840,2160),{width:3840,height:2160});
 assert.deepEqual(backgroundSize(390,844,3),{width:780,height:1688});
});
