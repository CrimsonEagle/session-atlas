import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

export const STATE_FILES=['usage-cache.json','settings.json','model-prices.json','price-history.json','organization.json','saved-views.json'];
const validId=id=>typeof id==='string'&&/^[a-z0-9-]{8,80}$/i.test(id);
async function exists(file){try{await fs.stat(file);return true;}catch{return false;}}
async function writePointer(root,id){const file=path.join(root,'active-state.json');await fs.writeFile(file+'.tmp',JSON.stringify({version:1,id,activatedAt:new Date().toISOString()}));await fs.rename(file+'.tmp',file);}
export async function activeState(root){
 await fs.mkdir(root,{recursive:true});await fs.mkdir(path.join(root,'states'),{recursive:true});
 try{const pointer=JSON.parse(await fs.readFile(path.join(root,'active-state.json'),'utf8'));const dir=path.join(root,'states',pointer.id);if(pointer.version===1&&validId(pointer.id)&&await exists(dir))return {id:pointer.id,dir};}catch{}
 const id='state-'+randomBytes(8).toString('hex'),dir=path.join(root,'states',id);await fs.mkdir(dir,{recursive:true});
 for(const name of STATE_FILES){const source=path.join(root,name);if(await exists(source))await fs.copyFile(source,path.join(dir,name));}
 await writePointer(root,id);return {id,dir};
}
export async function prepareState(root,files){
 const id='state-'+randomBytes(8).toString('hex'),dir=path.join(root,'states',id);await fs.mkdir(dir,{recursive:false});
 for(const [name,content] of Object.entries(files)){if(!STATE_FILES.includes(name))throw Error(`Unbekannte Zustandsdatei: ${name}`);await fs.writeFile(path.join(dir,name),content);}
 return {id,dir};
}
export async function activateState(root,state){if(!validId(state?.id)||path.dirname(state.dir)!==path.join(root,'states'))throw Error('Ungültiger vorbereiteter Datenstand.');await writePointer(root,state.id);return state;}
export async function activateStateId(root,id){if(!validId(id)||!await exists(path.join(root,'states',id)))throw Error('Rückfallstand ist nicht verfügbar.');await writePointer(root,id);return {id,dir:path.join(root,'states',id)};}
