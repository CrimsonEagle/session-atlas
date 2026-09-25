import {backgroundSize, BACKGROUND_VARIANTS} from './background.js';
import './vendor/pixi-csp-8.21.0.mjs';
import {WebGLRenderer, Container, Graphics, Sprite, Texture, Ticker} from './vendor/pixi-8.21.0.mjs';

const fract = value => value - Math.floor(value);
const hash = value => fract(Math.sin(value * 127.1 + 19.19) * 43758.5453);
const mixColor = (a,b,t) => {
 const channel = shift => Math.round(((a>>shift)&255)*(1-t)+((b>>shift)&255)*t);
 return (channel(16)<<16)|(channel(8)<<8)|channel(0);
};

function glowTexture(document, round = false) {
 const canvas = document.createElement('canvas');
 canvas.width = round ? 64 : 128;
 canvas.height = round ? 64 : 48;
 const ctx = canvas.getContext('2d');
 if (round) {
  const gradient = ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'#fff');
  gradient.addColorStop(.13,'#ffffffef');
  gradient.addColorStop(.4,'#ffffff70');
  gradient.addColorStop(1,'#ffffff00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,64,64);
 } else {
  ctx.scale(2,2);
  const gradient = ctx.createRadialGradient(48,12,0,40,12,26);
  gradient.addColorStop(0,'#fff');
  gradient.addColorStop(.18,'#ffffffe0');
  gradient.addColorStop(.5,'#ffffff55');
  gradient.addColorStop(1,'#ffffff00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,64,24);
 }
 return Texture.from(canvas);
}

function networkLayout() {
 const nodes = Array.from({length:48},(_,i) => ({
  x:.025 + hash(i * 2 + 1) * .95,
  y:.035 + hash(i * 2 + 2) * .93,
  phase:hash(i * 3 + 8) * Math.PI * 2,
 }));
 const edges = [];
 for (let i=0;i<nodes.length;i++) {
  const nearest = nodes.map((node,j) => ({j,d:(node.x-nodes[i].x)**2+(node.y-nodes[i].y)**2}))
   .filter(({j,d}) => j!==i && d<.075).sort((a,b) => a.d-b.d).slice(0,2);
  for (const {j} of nearest) if (j>i) edges.push([i,j]);
 }
 return {nodes,edges};
}
const NETWORK = networkLayout();

export async function createPixiScene({document, window, variant = 'streams'}) {
 // The app owns the only frame loop. PixiJS must never keep drawing in a hidden tab.
 for (const ticker of [Ticker.system, Ticker.shared]) { ticker.autoStart = false; ticker.stop(); }
 const renderer = new WebGLRenderer();
 let stage, streakTexture, pointTexture, layoutObserver, onScroll;
 try {
  await renderer.init({width:1,height:1,resolution:1,antialias:true,
   backgroundAlpha:0,powerPreference:'low-power',gcActive:false,
   eventMode:'none',eventFeatures:{move:false,globalMove:false,click:false,wheel:false}});
  stage = new Container();
  stage.eventMode = 'none';
  const haze = stage.addChild(new Graphics());
  const lines = stage.addChild(new Graphics());
  const accents = stage.addChild(new Graphics());
  streakTexture = glowTexture(document);
  pointTexture = glowTexture(document,true);
  const particles = Array.from({length:52},(_,i) => {
   const sprite = stage.addChild(new Sprite(i < 48 ? streakTexture : pointTexture));
   sprite.anchor.set(.5,.5);
   return sprite;
  });
  const canvas = renderer.canvas;
  canvas.setAttribute('aria-hidden','true');
  const host = document.querySelector('.atlas-background');
  host.appendChild(canvas);
  let width = 0,height = 0,renderWidth = 0,renderHeight = 0,compact = false;
  let colors = [], auroraColors = [], dark = false;
  layoutObserver = new window.ResizeObserver(updateLayout);
  for (const selector of ['main','.sidebar','.topbar','.page-heading','#filters']) {
   const element = document.querySelector(selector);
   if (element) layoutObserver.observe(element);
  }
  // Scrolling updates the CSS focus mask only; reduced motion never starts a render loop.
  onScroll = updateLayout;
  window.addEventListener('scroll',onScroll,{passive:true});
  let currentVariant = BACKGROUND_VARIANTS.includes(variant) ? variant : 'streams';
  let drawnVariant = '';

  function updateAppearance() {
   const style = window.getComputedStyle(document.documentElement);
   colors = [1,2,3,4].map(i => Number.parseInt(style.getPropertyValue(`--background-color-${i}`).trim().slice(1),16));
   auroraColors = [colors[2],colors[0],colors[1],colors[3]];
   dark = style.getPropertyValue('--background-dark').trim() === '1';
  }

  function updateLayout() {
   const heading = document.querySelector('.page-heading')?.getBoundingClientRect();
   const filters = document.querySelector('#filters')?.getBoundingClientRect();
   const top = Math.max(0,heading?.top || 0);
   const bottom = Math.max(0,heading?.bottom || 0,filters?.bottom || 0);
   const left = heading?.left || 0, right = heading?.right || window.innerWidth;
   // An offscreen heading removes the quiet zone instead of dimming unrelated content.
   host.style.setProperty('--background-focus-x',`${(left+right)/2}px`);
   host.style.setProperty('--background-focus-y',`${(top+bottom)/2}px`);
   host.style.setProperty('--background-focus-width',`${Math.max(1,(right-left)*.65)}px`);
   host.style.setProperty('--background-focus-height',`${bottom>top?(bottom-top)/2+65:1}px`);
  }

  function resize() {
   const size = backgroundSize(window.innerWidth,window.innerHeight,window.devicePixelRatio || 1);
   const left = Math.max(0,document.querySelector('main')?.getBoundingClientRect().left || 0);
   const availableWidth = Math.max(1,window.innerWidth-left);
   stage.position.set(left*size.width/window.innerWidth,0);
   host.style.setProperty('--background-left',`${left}px`);
   updateLayout();
   compact = window.innerWidth < 620;
   if (size.width===renderWidth && size.height===renderHeight && width===availableWidth && height===window.innerHeight) return;
   width=availableWidth; height=window.innerHeight;
   renderWidth=size.width; renderHeight=size.height;
   stage.scale.set(renderWidth/window.innerWidth,renderHeight/height);
   renderer.resize(renderWidth,renderHeight);
  }

  function streamPoint(x,lane,time) {
   return height * [.19,.30,.61,.86][lane]
    + Math.sin(x/width*7+time*.65+lane*1.8)*Math.min(height*.08,65)
    + Math.cos(x/width*3-time*.4+lane)*22;
  }
  function drawStreams(time) {
   const count=compact?24:48;
   const segments=Math.min(192,Math.max(64,Math.ceil(width/12)));
   for (let lane=0;lane<4;lane++) {
    for (let step=0;step<=segments;step++) {
     const x=step/segments*width;
     if (!step) lines.moveTo(x,streamPoint(x,lane,time));
     else lines.lineTo(x,streamPoint(x,lane,time));
    }
    lines.stroke({color:colors[lane],width:1.2,alpha:dark?.40:.46});
   }
   for (let i=0;i<count;i++) {
    const sprite=particles[i],lane=i%4;
    const speed=(48+lane*14)*Math.min(1,width/900);
    const x=((Math.floor(i/4)/(count/4)*(width+100)+time*speed+lane*71)%(width+100))-50;
    const y=streamPoint(x,lane,time);
    sprite.visible=true;sprite.texture=streakTexture;sprite.tint=colors[lane];
    sprite.position.set(x,y);
    sprite.rotation=Math.atan2(streamPoint(x+2,lane,time)-y,2);
    sprite.scale.set((.65+.15*Math.sin(time*1.3+i))/2,.25);
    sprite.alpha=.72+.24*Math.sin(time*1.5+i);
   }
  }

  function orbitPoint(angle,rx,ry,cx,cy,tilt) {
   const x=Math.cos(angle)*rx,y=Math.sin(angle)*ry;
   return {x:cx+x*Math.cos(tilt)-y*Math.sin(tilt),y:cy+x*Math.sin(tilt)+y*Math.cos(tilt)};
  }
  function traceOrbit(graphics,cx,cy,rx,ry,tilt,start,end,steps=90) {
   for (let step=0;step<=steps;step++) {
    const p=orbitPoint(start+(end-start)*step/steps,rx,ry,cx,cy,tilt);
    if (!step) graphics.moveTo(p.x,p.y); else graphics.lineTo(p.x,p.y);
   }
  }
  function drawOrbit(time) {
   const fields=[{x:.08,y:.43,tilt:-.23,offset:0,speed:.145},{x:.92,y:.61,tilt:.19,offset:.37,speed:.12}];
   for (let field=0;field<fields.length;field++) {
    const source=fields[field],cx=width*source.x,cy=height*source.y;
    for (let i=0;i<5;i++) {
     const phase=fract(i/5+time*source.speed+source.offset);
     const strength=Math.sin(Math.PI*phase)**.65;
     const rx=width*(.035+phase*.57),ry=height*(.045+phase*.73);
     const tilt=source.tilt+Math.sin(time*.18+field)*.045;
     const color=colors[(i+field)%4];
     traceOrbit(haze,cx,cy,rx,ry,tilt,0,Math.PI*2,88);
     haze.stroke({color,width:19,alpha:(dark?.055:.025)*strength});
     traceOrbit(lines,cx,cy,rx,ry,tilt,0,Math.PI*2,88);
     lines.stroke({color,width:1.6,alpha:(dark?.48:.40)*strength});
     const head=time*(.7+field*.12)+i*1.3+field*1.8;
     traceOrbit(accents,cx,cy,rx,ry,tilt,head,head+.46,15);
     accents.stroke({color,width:3.5,alpha:.75*strength});
     for (let j=0;j<2;j++) {
      const p=particles[field*10+i*2+j],point=orbitPoint(head-j*.18,rx,ry,cx,cy,tilt);
      p.visible=true;p.texture=pointTexture;p.tint=color;p.position.set(point.x,point.y);p.rotation=0;
      p.scale.set(j===0?.28:.16);p.alpha=(j===0?.9:.5)*strength;
     }
    }
    const core=particles[20+field];
    core.visible=true;core.texture=pointTexture;core.tint=colors[field?1:2];
    core.position.set(cx,cy);core.scale.set(1.45);core.alpha=.2+.07*Math.sin(time*1.5+field);
   }
  }

  function auroraPoint(x,lane,time) {
   const u=x/width;
   return height*(.07+lane*.22+u*.18)
    + Math.sin(u*6.2+time*.24+lane*1.5)*Math.min(height*.095,90)
    + Math.sin(u*12.7-time*.16+lane)*Math.min(height*.025,24);
  }
  function drawAurora(time) {
   const count=compact?8:11;
   for (let lane=0;lane<4;lane++) {
    for (let j=0;j<count;j++) {
     const u=j/(count-1),x=width*(-.08+u*1.16)+Math.sin(time*.35+j+lane)*width*.012;
     const y=auroraPoint(x,lane,time);
     const blend=.5+.5*Math.sin(u*3.5+time*.2+lane*.7);
     const p=particles[lane*count+j];
     p.visible=true;p.texture=pointTexture;
     p.tint=mixColor(auroraColors[lane],auroraColors[(lane+1)%4],blend*.7);
     p.position.set(x,y);p.rotation=-.22;
     p.scale.set(Math.max(2.5,width/(count-1)/64*3.1),compact?1.8:2.45);
     p.alpha=(dark?.18:.16)+.04*Math.sin(time*.7+u*5+lane);
    }
   }
  }

  function drawConstellation(time) {
   const count=compact?24:48;
   const points=NETWORK.nodes.slice(0,count).map((node,i) => {
    const ampX=Math.min(width*.043,52),ampY=Math.min(height*.065,46);
    const speed=.53+hash(i*7+3)*.54;
    return {
     x:Math.max(8,Math.min(width-8,node.x*width+Math.sin(time*speed+node.phase)*ampX+Math.sin(time*.39+node.phase*2)*ampX*.38)),
     y:Math.max(8,Math.min(height-8,node.y*height+Math.cos(time*speed*.84+node.phase)*ampY+Math.sin(time*.43+node.phase*1.6)*ampY*.34)),
    };
   });
   const edges=NETWORK.edges.filter(([a,b]) => a<count && b<count);
   for (const [a,b] of edges) {
    lines.moveTo(points[a].x,points[a].y);
    lines.lineTo(points[b].x,points[b].y);
   }
   lines.stroke({color:colors[0],width:1.2,alpha:dark?.38:.46});
   for (let i=0;i<Math.min(9,edges.length);i++) {
    const [a,b]=edges[(i*11)%edges.length],phase=fract(time*.28+i*.137);
    const start=Math.max(0,phase-.16),end=phase;
    const x1=points[a].x+(points[b].x-points[a].x)*start;
    const y1=points[a].y+(points[b].y-points[a].y)*start;
    const x2=points[a].x+(points[b].x-points[a].x)*end;
    const y2=points[a].y+(points[b].y-points[a].y)*end;
    accents.moveTo(x1,y1);accents.lineTo(x2,y2);
    accents.stroke({color:colors[i%4],width:2.4,alpha:.72});
   }
   for (let i=0;i<count;i++) {
    const p=particles[i],point=points[i];
    p.visible=true;p.texture=pointTexture;p.tint=colors[i%4];
    p.position.set(point.x,point.y);p.rotation=0;p.scale.set(i%7===0?.36:.19);
    p.alpha=.68+.24*Math.sin(time*.7+NETWORK.nodes[i].phase);
   }
  }

  function draw(time) {
   if (drawnVariant !== currentVariant) {
    for (const particle of particles) particle.anchor.set(currentVariant === 'streams' ? .75 : .5, .5);
    drawnVariant=currentVariant;
   }
   haze.clear();lines.clear();accents.clear();
   for (const particle of particles) particle.visible=false;
   if (currentVariant==='orbit') drawOrbit(time);
   else if (currentVariant==='aurora') drawAurora(time);
   else if (currentVariant==='constellation') drawConstellation(time);
   else drawStreams(time);
   renderer.render(stage);
  }
  return {canvas,resize,draw,updateAppearance,setVariant(value) { if (BACKGROUND_VARIANTS.includes(value)) currentVariant=value; },destroy() {
   layoutObserver.disconnect();window.removeEventListener('scroll',onScroll);
   stage.destroy({children:true});streakTexture.destroy(true);pointTexture.destroy(true);renderer.destroy(true);
  }};
 } catch (error) {
  layoutObserver?.disconnect();
  if (onScroll) window.removeEventListener('scroll',onScroll);
  try { stage?.destroy({children:true}); } catch {}
  try { streakTexture?.destroy(true); } catch {}
  try { pointTexture?.destroy(true); } catch {}
  try { renderer.destroy(true); } catch {}
  throw error;
 }
}
