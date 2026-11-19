import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {ITEMS,getCategoryItems,defaultEquipped,resolveEquipped,migrateCatalog,purchase,equip} from '../src/shop.js';
import {freshProfile,SaveManager,pack,unpack} from '../src/save.js';
import {generateMap} from '../src/map.js';
import {Race} from '../src/race.js';

const expected={
  classic:0,night:250,paper:500,neon:1000,
  'skin-classic':0,outline:250,'colored-outline':250,stripe:250,'black-eyes':500,mad:1000,round:2500,
  'trail-classic':0,tail:250,line:500,ghost:1000,fire:2500,
  'finish-classic':0,silver:1000,gold:2500,diamond:2500,emerald:2500,ruby:2500,
};
function legacyProfile(){
  const profile=freshProfile();profile.coins=1730;profile.earned=2400;
  profile.owned=['blueprint','paper','candy','comet','spark','mint','outline','gold','future-item'];
  profile.equipped={theme:'blueprint',skin:'classic',trail:'comet',finish:'mint'};
  return profile;
}
function installStorage(t){
  const previous={indexedDB:globalThis.indexedDB,localStorage:globalThis.localStorage},values=new Map();
  globalThis.indexedDB=new IDBFactory();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  t.after(()=>{for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
}
function put(db,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function get(db,key){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}

test('The catalog has the requested 22 items and exact rarity prices with one free item first per category',()=>{
  assert.equal(ITEMS.length,22);assert.equal(new Set(ITEMS.map(item=>item.id)).size,22);assert.deepEqual(Object.fromEntries(ITEMS.map(item=>[item.id,item.price])),expected);
  const labels={0:'Бесплатная',250:'Обычная',500:'Редкая',1000:'Эпическая',2500:'Легендарная'};
  for(const item of ITEMS){assert.equal(item.rarity,labels[item.price]);assert.ok(item.color&&item.description&&item.style);}
  for(const category of ['theme','skin','trail','finish']){
    const items=getCategoryItems(category);assert.equal(items.filter(item=>item.price===0).length,1);assert.equal(items[0].id,defaultEquipped()[category]);assert.equal(items[0].name,'Обычная');assert.equal(items[0].rarity,'Бесплатная');
    assert.deepEqual(items.map(item=>item.price),items.map(item=>item.price).sort((a,b)=>a-b));items.reverse();assert.equal(getCategoryItems(category)[0].price,0);
  }
  assert.deepEqual(getCategoryItems('unknown'),[]);
});

test('Free appearance is always available and each category toggles to its own default',()=>{
  const profile=freshProfile();assert.deepEqual(profile.equipped,defaultEquipped());
  for(const id of Object.values(defaultEquipped())){assert.equal(equip(profile,id),true);assert.equal(purchase(profile,id),false);}
  assert.equal(profile.coins,0);assert.deepEqual(profile.owned,[]);
  profile.coins=250;assert.equal(purchase(profile,'outline'),true);assert.equal(equip(profile,'outline'),true);assert.equal(profile.equipped.skin,'outline');assert.equal(equip(profile,'outline'),true);assert.equal(profile.equipped.skin,'skin-classic');
  const defaults=defaultEquipped();defaults.skin='round';assert.equal(defaultEquipped().skin,'skin-classic');
});

test('Purchases debit once, aliases cannot double-charge, and extra debug arguments never grant ownership',()=>{
  const profile=freshProfile(),before=structuredClone(profile);assert.equal(purchase(profile,'gold',true),false);assert.equal(equip(profile,'gold',true),false);assert.deepEqual(profile,before);
  profile.coins=500;assert.equal(purchase(profile,'blueprint'),true);assert.equal(profile.coins,0);assert.deepEqual(profile.owned,['paper']);assert.equal(purchase(profile,'paper'),false);assert.equal(purchase(profile,'blueprint'),false);assert.equal(equip(profile,'blueprint'),true);assert.equal(profile.equipped.theme,'paper');
  profile.coins=2500;assert.equal(purchase(profile,'gold'),true);assert.equal(profile.coins,0);assert.equal(equip(profile,'gold'),true);assert.equal(profile.equipped.finish,'gold');assert.equal(purchase(profile,'ruby'),false);assert.equal(profile.coins,0);
});

test('Migration preserves currency, purchase entitlements and unrelated progress while detaching old checksummed profiles',()=>{
  const profile=legacyProfile(),raw=pack(profile),before=JSON.stringify(raw);assert.equal(unpack(raw),raw);
  const migrated=migrateCatalog(raw.profile);assert.equal(migrated.coins,1730);assert.equal(migrated.earned,2400);assert.deepEqual(migrated.owned,['paper','neon','tail','ghost','emerald','outline','gold','future-item']);
  assert.deepEqual(migrated.equipped,{theme:'paper',skin:'skin-classic',trail:'tail',finish:'emerald'});assert.deepEqual(migrated.stats,profile.stats);assert.deepEqual(migrated.settings,profile.settings);assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(migrateCatalog(migrated),migrated);migrated.settings.master=.1;assert.equal(raw.profile.settings.master,.6);
  assert.deepEqual(resolveEquipped({owned:[],equipped:{theme:'neon',skin:'round',trail:'fire',finish:'ruby'}}),defaultEquipped());
  const unusual={...profile,owned:['constructor','toString']};assert.deepEqual(migrateCatalog(unusual).owned,['constructor','toString']);
});

test('SaveManager opens an old valid checksum before migrating and persists canonical IDs on its next transaction',async t=>{
  installStorage(t);const setup=await new SaveManager().open(),raw=pack(legacyProfile()),before=JSON.stringify(raw);await put(setup.db,'current',raw);setup.db.close();
  const saves=await new SaveManager().open();t.after(()=>saves.db.close());assert.deepEqual(saves.profile,migrateCatalog(raw.profile));assert.equal(JSON.stringify(raw),before);assert.deepEqual(await get(saves.db,'current'),raw);
  await saves.transaction(()=>{});const stored=await get(saves.db,'current');assert.equal(unpack(stored),stored);assert.deepEqual(stored.profile.owned,saves.profile.owned);assert.equal(stored.profile.coins,1730);assert.deepEqual(await get(saves.db,'backup'),raw);
});

test('Import migrates purchased cosmetics without changing an unfinished race or persisting unowned previews',async t=>{
  installStorage(t);const saves=await new SaveManager().open(),race=new Race(generateMap('catalog-import'),2);race.select(1);race.start();const snapshot=JSON.parse(JSON.stringify(race.snapshot())),raw=pack(legacyProfile(),snapshot),before=JSON.stringify(raw);t.after(()=>{race.destroy();saves.db.close();});
  await saves.import(JSON.stringify(raw));assert.equal(saves.profile.coins,1730);assert.deepEqual(saves.profile.equipped,{theme:'paper',skin:'skin-classic',trail:'tail',finish:'emerald'});assert.deepEqual(saves.race,snapshot);assert.equal(JSON.stringify(raw),before);
  await saves.transaction(state=>{state.profile.equipped.skin='round';assert.equal(equip(state.profile,'ruby',true),false);});assert.equal(saves.profile.equipped.skin,'skin-classic');assert.equal(saves.profile.coins,1730);assert.equal(saves.profile.owned.includes('round'),false);assert.equal(saves.profile.owned.includes('ruby'),false);
  const bad=structuredClone(raw);bad.profile.coins=0;assert.throws(()=>saves.import(JSON.stringify(bad)),/целостность/);assert.equal(saves.profile.coins,1730);assert.deepEqual(saves.race,snapshot);
});

test('Save validation accepts legacy or partial generation settings and rejects non-boolean supported switches',()=>{
  const profile=freshProfile();assert.equal(unpack(pack(profile)).profile.settings.generationOptions,undefined);
  profile.settings.generationOptions={laser:false,resize:true,futureOption:'ignored'};assert.deepEqual(unpack(pack(profile)).profile.settings.generationOptions,profile.settings.generationOptions);
  for(const invalid of[null,[],{laser:0},{resize:'false'},{breakables:null}]){profile.settings.generationOptions=invalid;assert.throws(()=>unpack(pack(profile)),/настройки генерации/);}
});
