import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function runtimeRevision(root){
 const files=['server.mjs',...fs.readdirSync(path.join(root,'lib')).filter(name=>name.endsWith('.mjs')).sort().map(name=>`lib/${name}`)];
 const hash=createHash('sha256');
 for(const file of files)hash.update(file).update('\0').update(fs.readFileSync(path.join(root,file))).update('\0');
 return hash.digest('hex').slice(0,16);
}
