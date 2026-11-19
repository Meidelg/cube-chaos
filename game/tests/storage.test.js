import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {SaveManager,pack,freshProfile} from '../src/save.js';
import {Race} from '../src/race.js';
import {generateMap} from '../src/map.js';

const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
function reset(){globalThis.indexedDB=new IDBFactory();storage.clear();}
function put(db,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
test('IndexedDB: concurrent result commits award once, persist statistics and clear active race atomically',async()=>{
  reset();const saves=await new SaveManager().open(),r=new Race(generateMap('transaction'),6);r.select(1);r.start();await saves.saveRace(r.snapshot());r.finish(r.cubes[0],'finish');await Promise.all([saves.finish(r),saves.finish(r)]);
  const reloaded=await new SaveManager().open();assert.equal(reloaded.profile.coins,360);assert.equal(reloaded.profile.stats.races,1);assert.equal(reloaded.race,null);assert.equal(reloaded.profile.completed.length,1);r.destroy();saves.db.close();reloaded.db.close();
});
test('IndexedDB: corrupted primary restores valid backup without automatically deleting purchases',async()=>{
  reset();const saves=await new SaveManager().open();await saves.transaction(s=>{s.profile.coins=1500;s.profile.owned=['blueprint'];});await saves.transaction(s=>{s.profile.coins=1600;});const bad=pack(freshProfile());bad.profile.coins=99;await put(saves.db,'current',bad);
  const restored=await new SaveManager().open();assert.ok(restored.recovered);assert.equal(restored.profile.coins,1500);assert.deepEqual(restored.profile.owned,['paper']);saves.db.close();restored.db.close();
});
test('IndexedDB: future primary blocks old game even when an old backup exists',async()=>{
  reset();const saves=await new SaveManager().open();await saves.transaction(s=>{s.profile.coins=100;});await saves.transaction(s=>{s.profile.coins=200;});const future=pack(saves.profile);future.gameVersion='99.0.0';await put(saves.db,'current',future);const oldGame=new SaveManager();await assert.rejects(()=>oldGame.open(),/новой версией/);saves.db.close();oldGame.db.close();
});
test('IndexedDB: import restores profile and unfinished race; bad import leaves original intact',async()=>{
  reset();const saves=await new SaveManager().open(),r=new Race(generateMap('import'),4);r.select(2);r.start();for(let i=0;i<50;i++)r.step();const profile=freshProfile();profile.coins=640;profile.owned=['comet'];await saves.import(JSON.stringify(pack(profile,r.snapshot())));assert.equal(saves.profile.coins,640);assert.equal(saves.race.id,r.id);assert.equal(saves.race.prediction.selected,2);
  assert.throws(()=>saves.import('{"bad":true}'));assert.equal(saves.profile.coins,640);const reload=await new SaveManager().open();assert.equal(reload.profile.coins,640);assert.equal(reload.race.ticks,50);r.destroy();saves.db.close();reload.db.close();
});
