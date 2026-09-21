#!/usr/bin/env node
// Claude Code hands its status line JSON to this script on stdin. Only the rate limit block is
// written to a current snapshot and, when changed, an immutable inbox entry that Session Atlas
// can import later; model, folder, branch and every other field are discarded. Nothing here may
// fail loudly: a broken bridge would take the user's status line down with it.
//
//   node atlas-statusline.mjs                 write the file and print a compact status line
//   node atlas-statusline.mjs --quiet         write the file and print nothing
//   node atlas-statusline.mjs -- <command>    write the file, then let <command> render the line
//
// ATLAS_RATE_LIMIT_FILE overrides the snapshot target and ATLAS_RATE_LIMIT_INBOX its sibling
// inbox; by default both sit in the Claude configuration directory where Atlas expects them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const BRIDGE_FILE='session-atlas-limits.json';
const INBOX_DIR='session-atlas-limit-inbox';
function target() {
 return process.env.ATLAS_RATE_LIMIT_FILE||path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),BRIDGE_FILE);
}
function inbox(file) {
 return process.env.ATLAS_RATE_LIMIT_INBOX||path.join(path.dirname(file),INBOX_DIR);
}
function sameLimits(previous,rateLimits) {
 try{return JSON.stringify(previous?.rate_limits)===JSON.stringify(rateLimits);}catch{return false;}
}
function store(rateLimits) {
 const file=target(),observedAtMs=Date.now(),state={version:1,observedAtMs,rate_limits:rateLimits},tmp=`${file}.${process.pid}.tmp`;
 fs.mkdirSync(path.dirname(file),{recursive:true});
 let previous=null;try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 // Atomic replace keeps a concurrent scan from reading a half-written measurement.
 fs.writeFileSync(tmp,JSON.stringify(state));
 fs.renameSync(tmp,file);
 // The snapshot above remains compatible with older Atlas versions. A changed measurement is
 // additionally spooled as an immutable file, so Atlas can import the complete sequence later.
 if(!sameLimits(previous,rateLimits)) {
  const dir=inbox(file),id=`${observedAtMs}-${process.pid}-${randomUUID()}`,event={...state,id},eventTmp=path.join(dir,`.${id}.tmp`),eventFile=path.join(dir,`${id}.json`);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(eventTmp,JSON.stringify(event));
  fs.renameSync(eventTmp,eventFile);
 }
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
