import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {limitHistoryView} from '../public/limit-history.js';
import {translateGerman} from '../public/i18n.js';

test('headless CLI readings are labeled honestly in history and settings',async()=>{
 const html=limitHistoryView({history:[{id:'cli',tool:'claude',windowMinutes:300,usedPercent:27,source:'claude-cli',sourceObservedAt:'2026-10-07T20:00:00Z',resetsAt:'2026-10-07T23:30:00Z'}],tool:'claude',period:'all'});
 assert.match(html,/Claude-Code-CLI/);
 assert.doesNotMatch(html,/<td>Session-Log<\/td>/);
 const app=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('function bridgePanel(){'),end=app.indexOf('\nfunction shellQuote',start);
 assert.ok(start>=0&&end>start);
 const context={data:{limits:{claude:{source:'claude-cli',observedAt:'2026-10-07T20:00:00Z'}}},esc:String,date:String};
 const panel=vm.runInNewContext(`${app.slice(start,end)}\nbridgePanel()`,context);
 assert.match(panel,/is-active/);
 assert.match(panel,/Letzter Messwert .*Claude-Code-CLI/);
 assert.match(panel,/Headless-Aufrufe/);
});

test('headless collector explanation translates without German fragments',()=>{
 assert.equal(translateGerman('Headless-Aufrufe über die CLI-Bridge erfassen Limits direkt aus dem offiziellen Ereignisstrom; eine Statusline ist dafür nicht nötig.'),'Headless calls through the CLI bridge capture limits directly from the official event stream; no status line is needed.');
 assert.equal(translateGerman('Ohne Statusline-Bridge, CLI-Bridge oder Cowork-Nutzung können die Werte aus .claude.json mehrere Tage alt sein.'),'Without the status-line bridge, CLI bridge or Cowork use, values from .claude.json may be several days old.');
});
