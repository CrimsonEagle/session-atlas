import test from 'node:test';
import assert from 'node:assert/strict';
import {
 attachTooltips,
 axisLabel,
 bucketLabel,
 compareValues,
 nextSort,
 seriesChart,
 sortableHeader,
 sortRows,
 tipAttr,
 tipLabel,
} from '../public/charts.js';

class FakeElement {
 constructor({tip=null,host=false,parent=null}={}){this.dataset=tip===null?{}:{tip:JSON.stringify(tip)};this.host=host;this.parent=parent;this.children=[];this.hidden=false;this.offsetWidth=180;this.offsetHeight=80;this.style={};this.classList={toggle:()=>{}};if(parent)parent.children.push(this);}
 closest(selector){for(let element=this;element;element=element.parent){if(selector==='[data-tip]'&&element.dataset.tip!==undefined)return element;if(selector==='[data-tip-host]'&&element.host)return element;}return null;}
 contains(other){for(let element=other;element;element=element.parent)if(element===this)return true;return false;}
 querySelector(selector){return selector===':scope>.chart-tooltip'?this.children.find(child=>child.className==='chart-tooltip')||null:null;}
 appendChild(child){child.parent=this;this.children.push(child);}
 setAttribute(){}
 getBoundingClientRect(){return {left:0,top:0,width:500,height:220};}
}

function tooltipFixture(){
 const listeners={},root=new FakeElement(),firstHost=new FakeElement({host:true,parent:root}),secondHost=new FakeElement({host:true,parent:root});
 root.addEventListener=(type,listener)=>{listeners[type]=listener;};
 const first=new FakeElement({tip:{title:'Erstes Diagramm'},parent:firstHost}),second=new FakeElement({tip:{title:'Zweites Diagramm'},parent:secondHost}),outside=new FakeElement({parent:root});
 const emit=(type,target,relatedTarget=null)=>listeners[type]({type,target,relatedTarget,clientX:100,clientY:100});
 return {root,firstHost,secondHost,first,second,outside,emit};
}

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

test('switching chart hosts cannot leave the previous tooltip visible',()=>{
 const originalElement=globalThis.Element,originalDocument=globalThis.document;
 globalThis.Element=FakeElement;globalThis.document={createElement:()=>new FakeElement()};
 try{
  const fixture=tooltipFixture();attachTooltips(fixture.root);
  fixture.emit('pointerover',fixture.first);const firstTooltip=fixture.firstHost.children.at(-1);assert.equal(firstTooltip.hidden,false);
  fixture.emit('pointerout',fixture.first,fixture.outside);
  fixture.emit('pointerover',fixture.second);const secondTooltip=fixture.secondHost.children.at(-1);
  assert.equal(firstTooltip.hidden,true);assert.equal(secondTooltip.hidden,false);
 }finally{globalThis.Element=originalElement;globalThis.document=originalDocument;}
});

test('moving beyond a chart target hides its tooltip even without pointerout',()=>{
 const originalElement=globalThis.Element,originalDocument=globalThis.document;
 globalThis.Element=FakeElement;globalThis.document={createElement:()=>new FakeElement()};
 try{
  const fixture=tooltipFixture();attachTooltips(fixture.root);
  fixture.emit('pointerover',fixture.first);const tooltip=fixture.firstHost.children.at(-1);assert.equal(tooltip.hidden,false);
  fixture.emit('pointermove',fixture.outside);assert.equal(tooltip.hidden,true);
 }finally{globalThis.Element=originalElement;globalThis.document=originalDocument;}
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

test('a hidden provider is absent from bars, gradients and tooltip rows',()=>{
 const svg=seriesChart({rows,format,period:'day',idPrefix:'visible',tools:['claude']});
 assert.ok(!svg.includes('visible-codex'));assert.ok(!svg.includes('chart-bar codex'));assert.ok(!svg.includes('Codex'));
 assert.match(svg,/visible-claude/);assert.match(svg,/chart-bar claude/);assert.match(svg,/Claude Code/);
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

test('table rows sort numbers stably while missing values stay at the bottom',()=>{
 const values=[
  {name:'Zehn',value:10},
  {name:'Zwei',value:2},
  {name:'Fehlt',value:null},
  {name:'Noch zwei',value:2},
 ];
 const pick=(row,key)=>row[key];
 assert.deepEqual(sortRows(values,'value','asc',pick).map(row=>row.name),['Zwei','Noch zwei','Zehn','Fehlt']);
 assert.deepEqual(sortRows(values,'value','desc',pick).map(row=>row.name),['Zehn','Zwei','Noch zwei','Fehlt']);
 assert.ok(compareValues('Alpha','Beta')<0);
});

test('sortable table headers expose direction and toggle their active column',()=>{
 assert.deepEqual(nextSort('activity','desc','tokens','desc'),{key:'tokens',direction:'desc'});
 assert.deepEqual(nextSort('tokens','desc','tokens','desc'),{key:'tokens',direction:'asc'});
 const header=sortableHeader('Tokens','tokens',{activeKey:'tokens',direction:'desc',context:'main',numeric:true});
 assert.match(header,/aria-sort="descending"/);
 assert.match(header,/data-sort-context="main"/);
 assert.match(header,/data-sort-key="tokens"/);
 assert.match(header,/class="sortable numeric sorted"/);
});
