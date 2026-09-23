import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {cleanSessionName,readCodexSessionNames} from '../lib/session-names.mjs';

test('Long names keep the first 200 normalized characters',()=>{
 assert.equal(cleanSessionName(`${' \u200b\n'.repeat(1000)}First\tname ${'x'.repeat(50000)}`),`First name ${'x'.repeat(189)}`);
 assert.equal(cleanSessionName(` ${'a'.repeat(201)} end`),'a'.repeat(200));
});

test('Codex names use explicit names before generated titles',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-codex-names-')),sessions=path.join(home,'sessions'),database=path.join(home,'state_5.sqlite');
 t.after(()=>fs.rm(home,{recursive:true,force:true}));await fs.mkdir(sessions);
 const db=new DatabaseSync(database);db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT NOT NULL)');
 const insert=db.prepare('INSERT INTO threads (id, name, title) VALUES (?, ?, ?)');
 insert.run('explicit','  Named\nTask  ','Generated task');insert.run('generated',null,'Generated only');db.close();
 const warnings=[],result=await readCodexSessionNames([sessions],warnings);
 assert.equal(result.databaseCount,1);assert.equal(warnings.length,0);
 assert.deepEqual(result.names.get('explicit'),{name:'Named Task',source:'codex.state.threads.name',priority:3});
 assert.deepEqual(result.names.get('generated'),{name:'Generated only',source:'codex.state.threads.title',priority:2});
});

test('Cached Codex names follow changes written only to the SQLite WAL',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-codex-names-')),sessions=path.join(home,'sessions'),database=path.join(home,'state_5.sqlite');
 await fs.mkdir(sessions);
 const db=new DatabaseSync(database);t.after(async()=>{db.close();await fs.rm(home,{recursive:true,force:true});});
 db.exec('PRAGMA journal_mode=WAL; CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT NOT NULL)');
 db.prepare('INSERT INTO threads (id, name, title) VALUES (?, ?, ?)').run('thread','First name','Generated');
 const cache=new Map(),first=await readCodexSessionNames([sessions],[],cache);
 assert.equal(first.names.get('thread').name,'First name');
 assert.equal((await readCodexSessionNames([sessions],[],cache)).names.get('thread').name,'First name');
 db.prepare('UPDATE threads SET name = ? WHERE id = ?').run('Updated name','thread');
 const second=await readCodexSessionNames([sessions],[],cache);
 assert.equal(second.names.get('thread').name,'Updated name');
});
