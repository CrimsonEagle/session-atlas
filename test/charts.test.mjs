import test from 'node:test';
import assert from 'node:assert/strict';
import {axisLabel,bucketLabel,seriesChart,tipAttr,tipLabel} from '../public/charts.js';

const rows=[{key:'2026-09-10',codex:10,claude:0},{key:'2026-09-11',codex:0,claude:0},{key:'2026-09-12',codex:5,claude:5}];
const format=value=>String(value);
const zones=svg=>[...svg.matchAll(/class="chart-hover-zone" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map(match=>({x:Number(match[1]),width:Number(match[2])}));

test('hover zones tile the plot so no period is dead to the pointer',()=>{
 const width=730,svg=seriesChart({rows,format,period:'day',width,height:220,idPrefix:'unit'});
 const hover=zones(svg);assert.equal(hover.length,rows.length);
 for(let index=1;index<hover.length;index++)assert.ok(hover[index-1].x+hover[index-1].width>=hover[index].x,'zones must not leave a gap');
 assert.ok(hover.at(-1).x+hover.at(-1).width<=width-13,'zones stay inside the plot');
});

test('every period carries a tooltip payload, an idle one included',()=>{
 const svg=seriesChart({rows,format,period:'day',width:730,height:220,idPrefix:'unit'});
 const payloads=[...svg.matchAll(/data-tip="([^"]*)"/g)].map(match=>JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&')));
 assert.equal(payloads.length,rows.length);
 assert.deepEqual(payloads[1].rows.map(([label,value])=>[label,value]),[['Codex','0'],['Claude Code','0']]);
 assert.deepEqual(payloads[2].total,['Gesamt','10']);
 assert.ok(payloads.every(payload=>payload.title));
});

test('selectable chart exposes bucket controls and its selected state',()=>{
 const svg=seriesChart({rows,format,period:'day',selectable:true,selectedKey:'2026-09-11'});
 assert.match(svg,/data-chart-bucket="2026-09-11"/);
 assert.match(svg,/role="group"/);
 assert.match(svg,/class="chart-column selectable selected"[^>]*role="button"[^>]*aria-pressed="true"/);
 assert.equal((svg.match(/aria-pressed="false"/g)||[]).length,2);
});

test('gradients are namespaced so two charts on one page keep their colors',()=>{
 const main=seriesChart({rows,format,period:'day',idPrefix:'chart-main'}),detail=seriesChart({rows,format,period:'day',idPrefix:'detail-series'});
 assert.match(main,/id="chart-main-codex"/);assert.match(main,/fill="url\(#chart-main-claude\)"/);
 assert.match(detail,/id="detail-series-codex"/);assert.ok(!detail.includes('chart-main'));
});

test('the scale gutter grows with the widest axis label',()=>{
 const short=seriesChart({rows,format:()=>'0',period:'day'}),long=seriesChart({rows,format:()=>'1.234.567,89 $',period:'day'});
 const gutter=svg=>Number(svg.match(/class="grid-line" x1="([\d.]+)"/)[1]);
 assert.equal(gutter(short),84);assert.ok(gutter(long)>gutter(short));
});

test('labels and aria text describe the bucket in German',()=>{
 assert.equal(bucketLabel('2026-09-10','month'),'September 2026');
 assert.match(bucketLabel('2026-09-10','week'),/^Woche ab 10\./);
 assert.match(axisLabel('2026-09-10','day'),/^10\./);
 assert.equal(tipLabel({title:'Heute',rows:[['Codex','3']],total:['Gesamt','3'],note:'Hinweis'}),'Heute · Codex: 3 · Gesamt: 3 · Hinweis');
 assert.match(tipAttr({title:'a"b'}),/^data-tip="{&quot;title&quot;:&quot;a\\&quot;b&quot;}"$/);
});
