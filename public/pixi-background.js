import {backgroundSize} from './background.js';
import './vendor/pixi-csp-8.18.0.mjs';
import {WebGLRenderer, Container, Graphics, Sprite, Texture, Ticker} from './vendor/pixi-8.18.0.mjs';

export async function createPixiScene({document, window}) {
 // This is the app's only PixiJS scene. Disable its scheduler/event tickers;
 // background.js owns all rendering, including the complete pause lifecycle.
 for (const ticker of [Ticker.system, Ticker.shared]) { ticker.autoStart = false; ticker.stop(); }
 const renderer = new WebGLRenderer();
 let stage, texture;
 try {
 await renderer.init({width:1, height:1, resolution:1, antialias:true,
  backgroundAlpha:0, powerPreference:'low-power', gcActive:false,
  eventMode:'none', eventFeatures:{move:false,globalMove:false,click:false,wheel:false}});
 stage = new Container();
 stage.eventMode = 'none';
 const lines = stage.addChild(new Graphics());
 const colors = [0x617dff, 0xb079e6, 0x43b9cf, 0x8877eb];
 // One tiny prepainted texture supplies soft light without a blur filter.
 const source = document.createElement('canvas');
 source.width = 128; source.height = 48;
 const ctx = source.getContext('2d');
 ctx.scale(2,2);
 const gradient = ctx.createRadialGradient(48,12,0,40,12,26);
 gradient.addColorStop(0,'#fff'); gradient.addColorStop(.18,'#ffffffe0');
 gradient.addColorStop(.5,'#ffffff55'); gradient.addColorStop(1,'#ffffff00');
 ctx.fillStyle = gradient; ctx.fillRect(0,0,64,24);
 texture = Texture.from(source);
 const particles = Array.from({length:48}, (_,i) => {
  const sprite = stage.addChild(new Sprite(texture));
  sprite.anchor.set(.75,.5); sprite.tint = colors[i % 4];
  return sprite;
 });
 const canvas = renderer.canvas;
 canvas.setAttribute('aria-hidden','true');
 document.querySelector('.atlas-background').appendChild(canvas);
 let width = 0, height = 0, renderWidth = 0, renderHeight = 0, compact = false;
 function resize() {
  const size = backgroundSize(window.innerWidth,window.innerHeight,window.devicePixelRatio || 1);
  compact = window.innerWidth < 620;
  if (size.width === renderWidth && size.height === renderHeight && width === window.innerWidth && height === window.innerHeight) return;
  width = window.innerWidth; height = window.innerHeight;
  renderWidth = size.width; renderHeight = size.height;
  // Keep the scene in CSS pixels: display density must not alter motion or size.
  stage.scale.set(renderWidth / width,renderHeight / height);
  renderer.resize(renderWidth,renderHeight);
 }
 function point(x,lane,time) {
  return height * [.19,.30,.61,.86][lane]
   + Math.sin(x / width * 7 + time * .65 + lane * 1.8) * Math.min(height * .08,65)
   + Math.cos(x / width * 3 - time * .4 + lane) * 22;
 }
 function draw(time) {
  const count = compact ? 24 : 48;
  const segments = Math.min(192,Math.max(64,Math.ceil(width / 12)));
  lines.clear();
  for (let lane = 0; lane < 4; lane++) {
   for (let step = 0; step <= segments; step++) {
    const x = step / segments * width;
    if (!step) lines.moveTo(x,point(x,lane,time));
    else lines.lineTo(x,point(x,lane,time));
   }
   lines.stroke({color:colors[lane],width:1.2,alpha:.32});
  }
  for (let i = 0; i < particles.length; i++) {
   const sprite = particles[i];
   sprite.visible = i < count;
   if (!sprite.visible) continue;
   const lane = i % 4;
   const speed = (48 + lane * 14) * Math.min(1,width / 900);
   const x = ((Math.floor(i / 4) / (count / 4) * (width + 100) + time * speed + lane * 71) % (width + 100)) - 50;
   const y = point(x,lane,time);
   sprite.position.set(x,y);
   sprite.rotation = Math.atan2(point(x + 2,lane,time) - y,2);
   sprite.scale.set((.65 + .15 * Math.sin(time * 1.3 + i)) / 2, .25);
   sprite.alpha = .72 + .24 * Math.sin(time * 1.5 + i);
  }
  renderer.render(stage);
 }
 return {canvas,resize,draw,destroy() {
  stage.destroy({children:true}); texture.destroy(true); renderer.destroy(true);
 }};
 } catch (error) {
  // Partial initialization must not retain a WebGL context or GPU resources.
  try { stage?.destroy({children:true}); } catch {}
  try { texture?.destroy(true); } catch {}
  try { renderer.destroy(true); } catch {}
  throw error;
 }
}
