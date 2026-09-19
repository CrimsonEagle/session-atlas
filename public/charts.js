// Shared chart building blocks: one bar-series renderer and one tooltip engine for every chart in
// the app. Native title attributes are deliberately not used anywhere: their delay makes a dense
// chart feel dead, they cannot show the provider split, and they never appear for keyboard users.
// Anything hoverable therefore carries a data-tip payload and lives inside a [data-tip-host], the
// element the floating box is positioned against.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tones=new Set(['codex','claude','input','cache','write','output','neutral']);

// payload: {title, rows:[[label,value,tone]], total:[label,value], note}
export function tipAttr(payload){return `data-tip="${esc(JSON.stringify(payload))}"`;}
export function tipLabel(payload){return [payload.title,...(payload.rows||[]).map(([label,value])=>`${label}: ${value}`),payload.total?`${payload.total[0]}: ${payload.total[1]}`:'',payload.note].filter(Boolean).join(' · ');}
function tipMarkup(payload){
 const line=([label,value,tone])=>`<div><span>${tones.has(tone)?`<i class="dot ${tone}"></i>`:''}${esc(label)}</span><b>${esc(value)}</b></div>`;
 return `${payload.title?`<strong>${esc(payload.title)}</strong>`:''}${(payload.rows||[]).map(line).join('')}${payload.total?`<div class="chart-tooltip-total"><span>${esc(payload.total[0])}</span><b>${esc(payload.total[1])}</b></div>`:''}${payload.note?`<small>${esc(payload.note)}</small>`:''}`;
}

// Delegated for the whole root, so re-rendered charts keep working without rebinding listeners.
export function attachTooltips(root){
 let hideTimer=0,active=null;
 function hideElement(element){
  element.hidden=true;
  if(active===element)active=null;
 }
 function boxFor(host){
  let element=host.querySelector(':scope>.chart-tooltip');
  if(!element){element=document.createElement('div');element.className='chart-tooltip';element.setAttribute('role','tooltip');element.hidden=true;host.appendChild(element);}
  return element;
 }
 function show(target,event){
  clearTimeout(hideTimer);hideTimer=0;
  const host=target.closest('[data-tip-host]');if(!host)return;
  let payload;try{payload=JSON.parse(target.dataset.tip);}catch{return;}
  const element=boxFor(host);if(active&&active!==element)hideElement(active);
  element.innerHTML=tipMarkup(payload);element.hidden=false;active=element;
  const hostBox=host.getBoundingClientRect(),targetBox=target.getBoundingClientRect(),pointer=event?.type?.startsWith('pointer');
  const x=pointer?event.clientX:targetBox.left+targetBox.width/2,y=pointer?event.clientY:targetBox.top+18,half=element.offsetWidth/2;
  element.style.left=`${Math.max(half+8,Math.min(hostBox.width-half-8,x-hostBox.left))}px`;
  element.style.top=`${Math.max(8,y-hostBox.top)}px`;
  element.classList.toggle('below',y-hostBox.top<element.offsetHeight+20);
 }
 function hide(delay=90){
  clearTimeout(hideTimer);hideTimer=0;if(!active)return;const element=active;
  if(delay)hideTimer=setTimeout(()=>{hideTimer=0;hideElement(element);},delay);else hideElement(element);
 }
 const find=event=>event.target instanceof Element?event.target.closest('[data-tip]'):null;
 root.addEventListener('pointerover',event=>{const target=find(event);if(target)show(target,event);});
 root.addEventListener('pointermove',event=>{const target=find(event);if(target)show(target,event);else hide(0);});
 root.addEventListener('pointerout',event=>{const target=find(event);if(target&&!target.contains(event.relatedTarget))hide();});
 root.addEventListener('pointerleave',()=>hide(0));
 root.addEventListener('pointercancel',()=>hide(0));
 root.addEventListener('focusin',event=>{const target=find(event);if(target)show(target,event);});
 root.addEventListener('focusout',event=>{if(find(event))hide(0);});
 return ()=>hide(0);
}

export function bucketLabel(key,period){
 const date=new Date(key+'T00:00:00');
 if(period==='month')return date.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
 if(period==='week')return `Woche ab ${date.toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}`;
 return date.toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}
export function axisLabel(key,period){
 const date=new Date(key+'T00:00:00');
 return period==='month'?date.toLocaleDateString('de-DE',{month:'short',year:'2-digit'}):date.toLocaleDateString('de-DE',{day:'2-digit',month:'short'});
}

// rows: [{key,codex,claude}] with every period between first and last present, so the hover zones
// tile the whole plot and an empty period reads as an explicit zero instead of a gap.
export function seriesChart({rows,format,period='day',width=730,height=220,idPrefix='chart',title='',selectable=false,selectedKey=null}){
 const max=Math.max(1,...rows.map(row=>row.codex+row.claude));
 const scale=[0,1,2,3].map(index=>format(max*(1-index/3)));
 // 84 is the tuned gutter of the overview chart; wider scale labels (money) push it out further.
 const left=Math.max(84,Math.min(124,Math.round(Math.max(...scale.map(label=>label.length))*6.2)+14));
 const top=17,plotW=width-14-left,plotH=height-65,step=plotW/Math.max(1,rows.length),bar=Math.min(28,step*.58);
 const every=Math.max(1,Math.ceil(rows.length/Math.max(4,Math.round(width/95))));
 let svg=`<defs><linearGradient id="${idPrefix}-codex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7390f3"/><stop offset="1" stop-color="#4868d8"/></linearGradient><linearGradient id="${idPrefix}-claude" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e99b7f"/><stop offset="1" stop-color="#d97757"/></linearGradient></defs>`;
 scale.forEach((label,index)=>{const y=top+plotH*index/3;svg+=`<line class="grid-line" x1="${left}" y1="${y}" x2="${width-14}" y2="${y}"/><text x="${left-9}" y="${y+4}" text-anchor="end">${esc(label)}</text>`;});
 svg+=`<line class="chart-axis" x1="${left}" y1="${top+plotH}" x2="${width-14}" y2="${top+plotH}"/>`;
 rows.forEach((row,index)=>{
  const x=left+index*step+(step-bar)/2,total=row.codex+row.claude;
  const codex=row.codex?Math.max(2,row.codex/max*plotH):0,claude=row.claude?Math.max(2,row.claude/max*plotH):0;
  const selected=selectable&&row.key===selectedKey;
  const payload={title:bucketLabel(row.key,period),rows:[['Codex',format(row.codex),'codex'],['Claude Code',format(row.claude),'claude']],total:['Gesamt',format(total)],note:selectable?(selected?'Ausgewählt · erneut anklicken, um den Filter aufzuheben':'Anklicken, um die Daten darunter zu filtern'):undefined};
  const interaction=selectable?` role="button" aria-pressed="${selected}" data-chart-bucket="${esc(row.key)}" data-chart-period="${esc(period)}"`:' role="img"';
  svg+=`<g class="chart-column${selectable?' selectable':''}${selected?' selected':''}" tabindex="0"${interaction} aria-label="${esc(tipLabel(payload))}" ${tipAttr(payload)}><rect class="chart-hover-zone" x="${left+index*step}" y="${top}" width="${step+.35}" height="${plotH}" rx="4"/><rect class="chart-bar codex" fill="url(#${idPrefix}-codex)" x="${x}" y="${top+plotH-codex}" width="${bar}" height="${codex}" rx="3"/><rect class="chart-bar claude" fill="url(#${idPrefix}-claude)" x="${x}" y="${top+plotH-codex-claude}" width="${bar}" height="${claude}" rx="3"/></g>`;
  if(index%every===0||(index===rows.length-1&&rows.length<8))svg+=`<text class="chart-x-label" x="${x+bar/2}" y="${top+plotH+25}" text-anchor="middle">${esc(axisLabel(row.key,period))}</text>`;
 });
 return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="${selectable?'group':'img'}" aria-label="${esc(title)}">${svg}</svg>`;
}

const tableCollator=new Intl.Collator('de-DE',{numeric:true,sensitivity:'base'});
export function compareValues(left,right){const leftMissing=left===null||left===undefined||Number.isNaN(left),rightMissing=right===null||right===undefined||Number.isNaN(right);if(leftMissing||rightMissing)return leftMissing===rightMissing?0:leftMissing?1:-1;if(typeof left==='number'&&typeof right==='number')return left-right;return tableCollator.compare(String(left),String(right));}
export function sortRows(rows,key,direction,valueFor){const factor=direction==='asc'?1:-1;return rows.map((row,index)=>({row,index,value:valueFor(row,key)})).sort((left,right)=>{const leftMissing=left.value===null||left.value===undefined||Number.isNaN(left.value),rightMissing=right.value===null||right.value===undefined||Number.isNaN(right.value);if(leftMissing||rightMissing)return leftMissing===rightMissing?left.index-right.index:leftMissing?1:-1;const result=compareValues(left.value,right.value);return result?result*factor:left.index-right.index;}).map(item=>item.row);}
export function nextSort(activeKey,direction,key,defaultDirection='asc'){return activeKey===key?{key,direction:direction==='asc'?'desc':'asc'}:{key,direction:defaultDirection};}
export function sortableHeader(label,key,{activeKey,direction='asc',context,numeric=false,defaultDirection=numeric?'desc':'asc'}={}){const active=activeKey===key,ariaSort=active?(direction==='asc'?'ascending':'descending'):'none',mark=active?(direction==='asc'?'↑':'↓'):'↕',ariaLabel=`${label} sortieren${active?`, aktuell ${direction==='asc'?'aufsteigend':'absteigend'}`:''}`;return `<th class="sortable${numeric?' numeric':''}${active?' sorted':''}" aria-sort="${ariaSort}"><button type="button" class="table-sort" data-sort-context="${context}" data-sort-key="${key}" data-sort-default="${defaultDirection}" aria-label="${ariaLabel}"><span>${label}</span><span class="sort-mark" aria-hidden="true">${mark}</span></button></th>`;}
