import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist=path.join(root,'dist');await fs.mkdir(dist,{recursive:true});
// Explicit allowlist: personal caches, settings and logs never enter the ZIP.
// ZIP generation uses only Node, even when PowerShell archive modules are blocked.
const entries=[];
async function collect(name) {
 const absolute=path.join(root,name),stat=await fs.lstat(absolute);
 if(stat.isSymbolicLink())throw Error('Symlinks werden nicht verpackt.');
 if(stat.isDirectory()){for(const child of await fs.readdir(absolute))await collect(path.join(name,child));}
 else entries.push({name:'Session-Atlas/'+name.replaceAll('\\','/'),data:await fs.readFile(absolute)});
}
for(const name of ['package.json','server.mjs','launcher.mjs','Start.cmd','Start.sh','README.md','LICENSE','lib','public','bridge','scripts/package.mjs','scripts/benchmark-scan.mjs','docs/scan-performance.md','docs/e2-logformat-audit.md'])await collect(name);
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const local=[],central=[];let offset=0;
for(const entry of entries) {
 const name=Buffer.from(entry.name,'utf8'),data=entry.data,compressed=deflateRawSync(data),crc=crc32(data);
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x5d2b,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
 local.push(header,name,compressed);
 const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE((3<<8)|20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(8,10);dir.writeUInt16LE(0x5d2b,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(((entry.name.endsWith('/Start.sh')?0o100755:0o100644)<<16)>>>0,38);dir.writeUInt32LE(offset,42);central.push(dir,name);
 offset+=header.length+name.length+compressed.length;
}
const centralSize=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
const target=path.join(dist,'Session-Atlas-portable.zip');
await fs.writeFile(target,Buffer.concat([...local,...central,end]));
console.log(`Portable ZIP ohne persönliche Daten: ${target}`);
