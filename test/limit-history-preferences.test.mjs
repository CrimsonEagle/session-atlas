import test from 'node:test';
import assert from 'node:assert/strict';
import {readLimitHistoryPreferences,saveLimitHistoryPreferences} from '../public/limit-history-preferences.js';

test('limit history defaults to individual measurements and 30 days',()=>{
 const storage={getItem:()=>null};
 assert.deepEqual(readLimitHistoryPreferences(storage),{aggregation:'raw',period:'30',from:'',to:''});
});

test('limit history preserves grouping, date range and custom dates',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const selection={aggregation:'window',period:'custom',from:'2026-08-01',to:'2026-08-31'};
 saveLimitHistoryPreferences(selection,storage);
 assert.deepEqual(readLimitHistoryPreferences(storage),selection);
 saveLimitHistoryPreferences({...selection,aggregation:'raw',period:'90'},storage);
 assert.deepEqual(readLimitHistoryPreferences(storage),{...selection,aggregation:'raw',period:'90'});
});

test('invalid or unavailable browser storage falls back safely',()=>{
 const corrupted={getItem:()=>'{'};
 assert.deepEqual(readLimitHistoryPreferences(corrupted),{aggregation:'raw',period:'30',from:'',to:''});
 const invalid={getItem:()=>JSON.stringify({aggregation:'other',period:'forever',from:'2026-02-30',to:'"><script>'})};
 assert.deepEqual(readLimitHistoryPreferences(invalid),{aggregation:'raw',period:'30',from:'',to:''});
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.deepEqual(readLimitHistoryPreferences(blocked),{aggregation:'raw',period:'30',from:'',to:''});
 assert.doesNotThrow(()=>saveLimitHistoryPreferences({aggregation:'window',period:'all'},blocked));
});
