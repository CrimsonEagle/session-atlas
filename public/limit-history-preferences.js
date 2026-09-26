const storageKey='session-atlas-limit-history';
const periods=new Set(['7','30','90','all','custom']);
const defaults={aggregation:'raw',period:'30',from:'',to:''};
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

function normalize(value) {
 return {
  aggregation:value?.aggregation==='window'?'window':'raw',
  period:periods.has(value?.period)?value.period:defaults.period,
  from:validDay(value?.from)?value.from:'',
  to:validDay(value?.to)?value.to:''
 };
}

export function readLimitHistoryPreferences(storage) {
 try{return normalize(JSON.parse((storage??globalThis.localStorage).getItem(storageKey)));}
 catch{return {...defaults};}
}

export function saveLimitHistoryPreferences(value,storage) {
 try{(storage??globalThis.localStorage).setItem(storageKey,JSON.stringify(normalize(value)));}
 catch{}
}
