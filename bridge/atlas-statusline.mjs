#!/usr/bin/env node
// Claude Code hands its status line JSON to this script on stdin. Only the rate limit block is
// written to a small file that Session Atlas reads; model, folder, branch and every other field
// of that payload are discarded. Nothing here may fail loudly: a broken bridge would take the
// user's status line down with it, so every step falls back to plain output.
//
//   node atlas-statusline.mjs                 write the file and print a compact status line
//   node atlas-statusline.mjs --quiet         write the file and print nothing
//   node atlas-statusline.mjs -- <command>    write the file, then let <command> render the line
//
// ATLAS_RATE_LIMIT_FILE overrides the target; by default it sits in the Claude configuration
// directory, where Session Atlas looks for it without further setup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const BRIDGE_FILE='session-atlas-limits.json';
function target() {
 return process.env.ATLAS_RATE_LIMIT_FILE||path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),BRIDGE_FILE);
}
function store(rateLimits) {
 const file=target(),tmp=`${file}.${process.pid}.tmp`;
 fs.mkdirSync(path.dirname(file),{recursive:true});
 // Atomic replace keeps a concurrent scan from reading a half-written measurement.
 fs.writeFileSync(tmp,JSON.stringify({version:1,observedAtMs:Date.now(),rate_limits:rateLimits}));
 fs.renameSync(tmp,file);
}
function summary(input) {
 const percent=w=>{const v=Number(w?.used_percentage);return Number.isFinite(v)?`${Math.round(v)} %`:'–';};
 const limits=input?.rate_limits;
 return [input?.model?.display_name,limits&&`5 h ${percent(limits.five_hour)}`,limits&&`Woche ${percent(limits.seven_day)}`].filter(Boolean).join(' · ');
}
const chunks=[];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw=Buffer.concat(chunks).toString('utf8');
let input=null;try {input=JSON.parse(raw);}catch{}
try {if(input?.rate_limits) store(input.rate_limits);}catch{}
const separator=process.argv.indexOf('--'),[command,...args]=separator===-1?[]:process.argv.slice(separator+1);
if(command) {
 const child=spawn(command,args,{stdio:['pipe','inherit','inherit']});
 child.on('error',()=>process.exit(0));
 child.on('exit',code=>process.exit(code??0));
 child.stdin.on('error',()=>{});
 child.stdin.end(raw);
} else if(!process.argv.includes('--quiet')) process.stdout.write(`${summary(input)}\n`);
