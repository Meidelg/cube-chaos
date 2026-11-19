import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {serviceWorkerSource} from '../scripts/service-worker.mjs';

function worker(scope){
  const handlers=new Map(),stores=new Map(),network=[],deleted=[];let fail=false;
  const absolute=url=>new URL(typeof url==='string'?url:url.url,scope).href;
  const caches={keys:async()=>[...stores.keys()],delete:async key=>{deleted.push(key);return stores.delete(key);},open:async key=>{
    if(!stores.has(key))stores.set(key,new Map());const store=stores.get(key);
    return{put:async(key,value)=>store.set(absolute(key),value),match:async key=>store.get(absolute(key).split('?')[0])};
  }};
  class Request {constructor(url){this.url=absolute(url);}}
  const self={location:new URL(scope+'sw.js'),registration:{scope,active:true},clients:{matchAll:async()=>[],claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers.set(name,fn)};
  vm.runInNewContext(serviceWorkerSource('test',['index.html','assets/game.js','manifest.webmanifest']),{self,caches,URL,Request,Response,fetch:async request=>{network.push(absolute(request));if(fail)throw Error('offline');return new Response('local asset');}});
  const install=async()=>{let work;handlers.get('install')({waitUntil:p=>work=p});await work;};
  const activate=async()=>{let work;handlers.get('activate')({waitUntil:p=>work=p});await work;};
  const fetch=async(url,mode='navigate')=>{let work;handlers.get('fetch')({request:{url,method:'GET',mode},respondWith:p=>work=p});return work?await work:null;};
  return{handlers,stores,deleted,network,install,activate,fetch,offline:()=>fail=true,caches};
}

test('PWA manifest and HTML use portable project-relative resources',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  for(const k of ['id','scope','start_url'])assert.equal(new URL(manifest[k],'https://meidelg.github.io/cube-chaos/manifest.webmanifest').pathname,'/cube-chaos/');
  for(const icon of manifest.icons)assert.ok(new URL(icon.src,'https://meidelg.github.io/cube-chaos/manifest.webmanifest').pathname.startsWith('/cube-chaos/'));
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(!/href="\//.test(html));
});

test('Service worker preloads and serves offline navigation inside root and project Pages scopes',async()=>{
  for(const path of ['/','/cube-chaos/']){
    const scope='https://meidelg.github.io'+path,w=worker(scope);await w.install();
    assert.ok(w.network.every(url=>url.startsWith(scope)));w.offline();
    assert.equal(await(await w.fetch(scope)).text(),'local asset');
    assert.equal(await(await w.fetch(scope+'assets/game.js','cors')).text(),'local asset');
    if(path!=='/')assert.equal(await w.fetch('https://meidelg.github.io/another-app/'),null);
  }
});

test('Cache replacement cleans only its scope and failed installs preserve the working version',async()=>{
  const scope='https://meidelg.github.io/cube-chaos/',w=worker(scope),prefix='cube-chaos-'+encodeURIComponent(scope)+'-';
  await w.caches.open(prefix+'old');await w.caches.open('cube-chaos-other-app');await w.install();await w.activate();
  assert.deepEqual(w.deleted,[prefix+'old']);assert.ok(w.stores.has('cube-chaos-other-app'));
  const failed=worker(scope);await failed.caches.open(prefix+'old');failed.offline();await assert.rejects(failed.install(),/offline/);assert.ok(failed.stores.has(prefix+'old'));assert.ok(!failed.stores.has(prefix+'test'));
});
