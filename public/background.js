export const BACKGROUND_FPS = 60;
export const BACKGROUND_FPS_OPTIONS = ['30','60','120','144','monitor'];
export const BACKGROUND_VARIANTS = ['streams','orbit','aurora','constellation'];
export const BACKGROUND_VARIANT_DETAILS = {
 streams: {name:'Datenströme'},
 orbit: {name:'Resonanz'},
 aurora: {name:'Aurora'},
 constellation: {name:'Konstellation'},
};
export const BACKGROUND_MAX_PIXELS = 3840 * 2160;
export function backgroundSize(width, height, pixelRatio = 1) {
 // Native display density up to 2x, bounded to one 4K framebuffer.
 const scale = Math.min(Math.max(1, pixelRatio), 2, Math.sqrt(BACKGROUND_MAX_PIXELS / (width * height)));
 return {width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale))};
}
const loadScene = async options => (await import('./pixi-background.js')).createPixiScene(options);

// Vsync-aligned frames honor the selected cap, or follow every browser frame
// in monitor mode. Cancelling the single frame handle fully pauses the loop.
export function createBackground({document, window, createScene = loadScene}) {
 const root = document.documentElement;
 const media = window.matchMedia('(prefers-reduced-motion: reduce)');
 const key = 'session-atlas-background';
 const fpsKey = 'session-atlas-background-fps';
 const variantKey = 'session-atlas-background-variant';
 let fps = String(BACKGROUND_FPS);
 let variant = BACKGROUND_VARIANTS[0];
 let enabled = true, stopped = false, hidden = false, lost = false;
 let scene = null, loading = null, failed = false, frame = null, last = null, nextFrameAt = null, elapsed = 0;
 try { enabled = window.localStorage.getItem(key) !== 'off'; } catch {}
 try {
  const saved = window.localStorage.getItem(fpsKey);
  if (BACKGROUND_FPS_OPTIONS.includes(saved)) fps = saved;
 } catch {}
 try {
  const saved = window.localStorage.getItem(variantKey);
  if (BACKGROUND_VARIANTS.includes(saved)) variant = saved;
 } catch {}
 const visible = () => enabled && !stopped && !hidden && document.visibilityState === 'visible';
 const active = () => visible() && !media.matches && !lost && !failed && !!scene;
 const status = () => failed ? 'WebGL ist nicht verfügbar. Der Hintergrund konnte nicht gestartet werden.'
  : !enabled ? 'Hintergrund ausgeschaltet.' : lost ? 'Grafik wird wiederhergestellt …'
  : media.matches ? 'Systemeinstellung „Reduzierte Bewegung“ aktiv: Das Motiv bleibt still.'
  : `${BACKGROUND_VARIANT_DETAILS[variant].name} · pausiert automatisch in unsichtbaren Tabs.`;
 function controls() {
  root.dataset.background = enabled ? 'on' : 'off';
  root.dataset.backgroundVariant = variant;
  root.dataset.backgroundMotion = active() ? 'running' : 'paused';
  document.querySelector('#background-toggle')?.setAttribute('aria-checked', String(enabled));
  const fpsSelect = document.querySelector('#background-fps');
  if (fpsSelect) fpsSelect.value = fps;
  document.querySelectorAll?.('[data-background-choice]').forEach(button => {
   const selected = button.dataset.backgroundChoice === variant;
   button.classList.toggle('active', selected);
   button.setAttribute('aria-pressed', String(selected));
  });
  const hint = document.querySelector('#background-status');
  if (hint) hint.textContent = status();
 }
 function pause() {
  if (frame !== null) window.cancelAnimationFrame(frame);
  frame = last = nextFrameAt = null;
  root.dataset.backgroundMotion = 'paused';
 }
 function schedule() {
  if (!active() || frame !== null) return;
  frame = window.requestAnimationFrame(now => {
   frame = null;
   if (!active()) return;
   const interval = fps === 'monitor' ? 0 : 1000 / Number(fps);
   // Tolerate timestamp rounding on nominally 60 Hz displays without allowing
   // a second draw in the same vsync. Deadlines avoid a 144 Hz -> 48 FPS cadence.
   if (interval === 0 || nextFrameAt === null || now >= nextFrameAt - .1) {
    elapsed += last === null ? 0 : Math.min((now - last) / 1000, .1);
    last = now;
    nextFrameAt = nextFrameAt === null || now - nextFrameAt > interval
     ? now + interval : nextFrameAt + interval;
    scene.draw(elapsed);
   }
   schedule();
  });
 }
 async function init() {
  try {
   const created = await createScene({document, window, variant});
   if (stopped) { created.destroy(); return; }
   scene = created;
   scene.setVariant?.(variant);
   scene.canvas.addEventListener('webglcontextlost', contextLost);
   scene.canvas.addEventListener('webglcontextrestored', contextRestored);
   // Initialization may complete after hiding or disabling the scene.
   sync();
  } catch (error) {
   window.console?.warn('PixiJS background initialization failed:', error);
   failed = true;
   controls();
  }
 }
 function sync() {
  if (!active()) pause();
  controls();
  if (!visible() || failed || lost) return;
  if (!scene) { loading ||= init(); return; }
  scene.resize();
  scene.draw(elapsed);
  if (active()) schedule();
 }
 function hide() { hidden = true; pause(); }
 function show() { hidden = false; sync(); }
 function contextLost(event) { event.preventDefault(); lost = true; pause(); controls(); }
 function contextRestored() { lost = false; sync(); }
 function toggle(event) {
  if (!event.target.closest?.('#background-toggle')) return;
  enabled = !enabled;
  try { window.localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {}
  sync();
 }
 function changeFps(event) {
  if (event.target.id !== 'background-fps' || !BACKGROUND_FPS_OPTIONS.includes(event.target.value)) return;
  fps = event.target.value;
  try { window.localStorage.setItem(fpsKey,fps); } catch {}
  pause();
  sync();
 }
 function changeVariant(event) {
  const choice = event.target.closest?.('[data-background-choice]')?.dataset?.backgroundChoice;
  if (!BACKGROUND_VARIANTS.includes(choice) || choice === variant) return;
  variant = choice;
  try { window.localStorage.setItem(variantKey, variant); } catch {}
  scene?.setVariant?.(variant);
  sync();
 }
 const listeners = [[document,'visibilitychange',sync], [document,'click',toggle], [document,'click',changeVariant], [document,'change',changeFps],
  [window,'pagehide',hide], [window,'pageshow',show], [window,'resize',sync], [media,'change',sync]];
 for (const [target,type,handler] of listeners) target.addEventListener(type,handler);
 sync();
 return {
  get enabled() { return enabled; },
  get fps() { return fps; },
  get variant() { return variant; },
  get status() { return status(); },
  get ready() { return loading || Promise.resolve(); },
  stop() {
   stopped = true;
   pause();
   for (const [target,type,handler] of listeners) target.removeEventListener(type,handler);
   if (scene) {
    scene.canvas.removeEventListener('webglcontextlost',contextLost);
    scene.canvas.removeEventListener('webglcontextrestored',contextRestored);
    scene.destroy();
    scene = null;
   }
  },
 };
}
