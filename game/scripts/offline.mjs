import {serviceWorkerSource} from './service-worker.mjs';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../dist/',import.meta.url);
async function list(path=''){const files=[];for(const e of await readdir(new URL(path,root),{withFileTypes:true})){if(e.isDirectory())files.push(...await list(path+e.name+'/'));else if(e.name!=='sw.js')files.push(path+e.name);}return files;}
const files=await list(),hash=createHash('sha256');for(const f of files)hash.update(await readFile(new URL(f,root)));const version=hash.digest('hex').slice(0,12);
const sw=serviceWorkerSource(version,files);
await writeFile(new URL('sw.js',root),sw);console.log('Offline build:',version,'·',files.length,'local resources');
