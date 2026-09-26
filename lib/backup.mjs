import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {STATE_FILES} from './state-set.mjs';

export const MAX_BACKUP_COMPRESSED=64*1024*1024;
export const MAX_BACKUP_UNCOMPRESSED=256*1024*1024;
const checksum=text=>createHash('sha256').update(text).digest('hex');
const category={
 'usage-cache.json':'Nutzungscache','settings.json':'Einstellungen','model-prices.json':'Aktuelle Preise','price-history.json':'Preisgeschichte','organization.json':'Projektgruppen und Tags','saved-views.json':'Gespeicherte Ansichten'
};
function inspectJson(name,text){const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${name} hat keinen gültigen Objekttyp.`);if(name==='usage-cache.json'&&![2,3,4,5,6,7].includes(value.version))throw Error('Die Cache-Version der Sicherung ist nicht kompatibel.');return value;}
export async function createBackup(stateDir,{sessionCount=0}={}){
 const files={},checksums={},categories=[];let uncompressedBytes=0;
 for(const name of STATE_FILES){try{const text=await fs.readFile(path.join(stateDir,name),'utf8');inspectJson(name,text);files[name]=text;checksums[name]=checksum(text);categories.push({file:name,label:category[name]});uncompressedBytes+=Buffer.byteLength(text);}catch(error){if(error.code!=='ENOENT')throw error;}}
 const createdAt=new Date().toISOString(),payload={format:'session-atlas-backup',version:1,createdAt,manifest:{categories,sessionCount,uncompressedBytes,checksums},files};
 const buffer=gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});if(buffer.length>MAX_BACKUP_COMPRESSED)throw Error('Die Sicherung überschreitet 64 MB komprimiert.');return {buffer,manifest:payload.manifest,createdAt};
}
export function parseBackup(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>MAX_BACKUP_COMPRESSED)throw Error('Die Sicherung überschreitet 64 MB oder ist ungültig.');
 let raw;try{raw=gunzipSync(buffer,{maxOutputLength:MAX_BACKUP_UNCOMPRESSED});}catch{throw Error('Die Sicherung ist beschädigt oder nicht gzip-komprimiert.');}
 let payload;try{payload=JSON.parse(raw.toString('utf8'));}catch{throw Error('Der Backup-Container enthält kein gültiges JSON.');}
 if(payload?.format!=='session-atlas-backup'||payload.version!==1||!Number.isFinite(Date.parse(payload.createdAt))||!payload.files||typeof payload.files!=='object')throw Error('Das Backupformat ist nicht kompatibel.');
 const names=Object.keys(payload.files);if(!names.includes('usage-cache.json')||!names.includes('settings.json')||names.some(name=>!STATE_FILES.includes(name)))throw Error('Die Sicherung ist nicht vollständig oder enthält unbekannte Datentypen.');
 const files={};let bytes=0;for(const name of names){const text=payload.files[name];if(typeof text!=='string')throw Error(`${name} hat einen ungültigen Inhalt.`);bytes+=Buffer.byteLength(text);if(bytes>MAX_BACKUP_UNCOMPRESSED)throw Error('Die entpackte Sicherung überschreitet 256 MB.');inspectJson(name,text);if(checksum(text)!==payload.manifest?.checksums?.[name])throw Error(`Prüfsumme für ${name} stimmt nicht.`);files[name]=text;}
 const cache=JSON.parse(files['usage-cache.json']),settings=JSON.parse(files['settings.json']),sessionIds=new Set([...Object.values(cache.files||{}),...Object.values(cache.hermesSources||{}).flatMap(source=>Object.values(source.sessions||{}))].map(item=>`${item.tool}:${item.id}`)),sourceRoots=[...(settings.claudeRoots||[]).map(value=>({tool:'claude',path:value})),...(settings.codexRoots||[]).map(value=>({tool:'codex',path:value})),...(settings.hermesRoots||[]).map(value=>({tool:'hermes',path:value}))];
 return {files,preview:{createdAt:payload.createdAt,compressedBytes:buffer.length,uncompressedBytes:bytes,sessionCount:sessionIds.size,categories:names.map(name=>({file:name,label:category[name]})),sourceRoots,version:payload.version}};
}
