import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {readCodexSessionNames} from '../lib/session-names.mjs';

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
