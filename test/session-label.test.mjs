import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionLabel,sessionName,sessionSecondaryId} from '../public/session-label.js';

test('session names are primary and IDs remain secondary',()=>{
 const session={sessionId:'1234567890abcdefghijkl',name:'Readable task name',title:'Readable task name'};
 assert.equal(sessionName(session),'Readable task name');
 assert.equal(sessionLabel(session),'Readable task name');
 assert.equal(sessionSecondaryId(session),'1234567890abcdefgh');
});

test('session ID is the fallback without a distinct name',()=>{
 const session={sessionId:'session-id',title:'session-id'};
 assert.equal(sessionName(session),'');assert.equal(sessionLabel(session),'session-id');assert.equal(sessionSecondaryId(session),'');
});
