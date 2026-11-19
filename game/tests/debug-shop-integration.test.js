import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {Game} from '../src/game.js';
import {SaveManager,unpack} from '../src/save.js';
import {ITEMS,resolveEquipped,defaultEquipped} from '../src/shop.js';
import {generateMap} from '../src/map.js';
import {Race} from '../src/race.js';

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
const financial=profile=>structuredClone({coins:profile.coins,owned:profile.owned,equipped:profile.equipped});
const paid=()=>ITEMS.find(item=>item.price>0);

function gameFor(saves){
  const game=new Game(),calls={render:[],shops:[],downloads:[],toasts:[],balance:0};
  Object.assign(game,{saves,settings:structuredClone(saves.profile.settings),debugCosmetics:{},cosmeticEpoch:0,count:2,size:'small',finishing:false,accumulator:0});
  game.audio={play:()=>{},unlock:async()=>{}};
  game.ui={currentScreen:'home',navigationId:1,shopPage:0,prepare:()=>{},update:()=>{},balance:()=>calls.balance++,shop:(...args)=>calls.shops.push(args),toast:message=>calls.toasts.push(message),close(){this.navigationId++;},showScreen(screen){this.currentScreen=screen;this.navigationId++;},modal:()=>{}};
  game.renderer={setRace:(race,cosmetics)=>calls.render.push(structuredClone(cosmetics)),draw:()=>{},settings:game.settings};
  game.download=(text,name)=>calls.downloads.push({text,name});
  // No init(), browser, rendering engine or timer is needed. The actual Race,
  // Game methods, catalog rules, SaveManager and IndexedDB remain in the path.
  game.newRace({seed:'debug-shop-session'});
  return{game,calls};
}

async function setup(t,{coins=0,debug=false}={}){
  const previous=Object.fromEntries(['indexedDB','localStorage','confirm'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),storage=new Map();
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,writable:true,value:new IDBFactory()});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  Object.defineProperty(globalThis,'confirm',{configurable:true,writable:true,value:()=>true});
  const managers=[],games=[],gates=[];
  const open=async()=>{const saves=await new SaveManager().open();managers.push(saves);return saves;};
  const make=saves=>{const session=gameFor(saves);games.push(session.game);return session;};
  t.after(async()=>{
    for(const gate of gates)gate.resolve();
    for(const game of games){clearTimeout(game.settingsTimeout);game.race?.destroy();}
    for(const manager of managers){await manager.queue.catch(()=>{});manager.db.close();}
    for(const [key,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  });
  const saves=await open();await saves.transaction(state=>{state.profile.coins=coins;state.profile.settings.debug=debug;});
  const session=make(saves);
  return{...session,saves,open,make,gate(){const pending=deferred();gates.push(pending);saves.queue=pending.promise;return pending;}};
}

function assertNoSessionFields(value){
  if(!value||typeof value!=='object')return;
  for(const [key,entry]of Object.entries(value)){assert.ok(!['debugCosmetics','cosmeticEpoch','previewEquipped','shopPreview'].includes(key),`Session-only ${key} must not enter a save`);assertNoSessionFields(entry);}
}

test('Debug shop previews every catalog item, including all free defaults, without a persistent purchase or equip',async t=>{
  const{game,saves,calls}=await setup(t,{debug:true}),before=structuredClone(saves.profile),beforeRace=game.race.snapshot();
  const transaction=saves.transaction.bind(saves);let writes=0;saves.transaction=update=>{writes++;return transaction(update);};
  assert.equal(ITEMS.filter(item=>item.price===0).length,4);
  for(const item of ITEMS){
    game.debugCosmetics={};await game.buy(item.id);assert.equal(game.effectiveCosmetics()[item.category],item.id,`${item.id} preview through Buy`);
    assert.deepEqual(saves.profile,before);
    game.debugCosmetics={};await game.equip(item.id);assert.equal(game.effectiveCosmetics()[item.category],item.id,`${item.id} preview through Equip`);
    assert.deepEqual(saves.profile,before);
  }
  assert.equal(writes,0,'Debug actions must not even enqueue a SaveManager transaction');assert.deepEqual(game.race.snapshot(),beforeRace,'Preview cannot alter the physical race state');
  const view=game.viewProfile();assert.notEqual(view.equipped,saves.profile.equipped);view.equipped.theme='not-a-purchase';assert.deepEqual(saves.profile,before);
  assert.ok(calls.render.length>=ITEMS.length*2);assertNoSessionFields(JSON.parse(saves.export()));
});

test('Debug session cosmetics survive a new race but disabling debug immediately restores the actually equipped owned items',async t=>{
  const{game,saves,calls}=await setup(t,{coins:10000});
  const owned=ITEMS.find(item=>item.category==='theme'&&item.price>0),preview=ITEMS.find(item=>item.category==='theme'&&item.price>0&&item.id!==owned.id);
  await game.buy(owned.id);await game.equip(owned.id);const actual=financial(saves.profile);
  game.setDebugMode(true);await game.buy(preview.id);assert.equal(game.effectiveCosmetics().theme,preview.id);
  const session=structuredClone(game.debugCosmetics);game.newRace({seed:'same-debug-session-new-race'});
  assert.deepEqual(game.debugCosmetics,session);assert.equal(game.effectiveCosmetics().theme,preview.id);assert.deepEqual(financial(saves.profile),actual);
  game.setDebugMode(false);assert.deepEqual(game.debugCosmetics,{});assert.deepEqual(game.effectiveCosmetics(),resolveEquipped(saves.profile));assert.deepEqual(calls.render.at(-1),resolveEquipped(saves.profile));assert.deepEqual(financial(saves.profile),actual);
});

test('Real settings, race autosave, Game export/import and a reopened session never persist a debug preview',async t=>{
  const{game,saves,calls,open,make}=await setup(t,{coins:50,debug:true}),before=financial(saves.profile),item=ITEMS.find(item=>item.category==='finish'&&item.price>0);
  await game.buy(item.id);assert.equal(game.effectiveCosmetics().finish,item.id);game.race.select(1);game.race.start();
  await saves.saveSettings(game.settings);await game.checkpoint();await game.action('export');
  assert.equal(calls.downloads.length,1);const text=calls.downloads[0].text,data=unpack(JSON.parse(text));
  assert.deepEqual(financial(data.profile),before);assert.equal(data.profile.settings.debug,true);assert.equal(data.race.id,game.race.id);assertNoSessionFields(data);
  await game.importFile({target:{files:[{size:text.length,text:async()=>text}],value:'selected'}});
  assert.ok(!calls.toasts.some(message=>message.startsWith('Импорт не выполнен')),calls.toasts.join('\n'));
  assert.deepEqual(game.debugCosmetics,{});assert.deepEqual(financial(saves.profile),before);assert.deepEqual(game.effectiveCosmetics(),resolveEquipped(saves.profile));
  const reloaded=await open(),fresh=make(reloaded).game;assert.equal(fresh.settings.debug,true);assert.deepEqual(fresh.debugCosmetics,{});assert.deepEqual(fresh.effectiveCosmetics(),resolveEquipped(reloaded.profile));assert.deepEqual(financial(reloaded.profile),before);assertNoSessionFields(JSON.parse(reloaded.export()));
});

test('Normal Game purchase debits the current new catalog price exactly once and a normal equip persists',async t=>{
  const item=paid(),balance=item.price*3+17,{game,saves,open}=await setup(t,{coins:balance});
  await game.buy(item.id);await game.buy(item.id);assert.equal(saves.profile.coins,balance-item.price);assert.deepEqual(saves.profile.owned,[item.id]);
  await game.equip(item.id);assert.equal(saves.profile.equipped[item.category],item.id);
  const reloaded=await open();assert.equal(reloaded.profile.coins,balance-item.price);assert.deepEqual(reloaded.profile.owned,[item.id]);assert.equal(reloaded.profile.equipped[item.category],item.id);
  const raw=unpack(JSON.parse(saves.export()));assert.equal(raw.profile.coins,balance-item.price);assert.equal(raw.profile.equipped[item.category],item.id);assertNoSessionFields(raw);
});

test('Normal unowned/free equip cannot grant a paid item or debit any currency',async t=>{
  const{game,saves}=await setup(t,{coins:0}),before=financial(saves.profile),item=paid();
  await game.equip(item.id);await game.buy(item.id);assert.deepEqual(financial(saves.profile),before);
  for(const free of ITEMS.filter(item=>item.price===0)){await game.equip(free.id);assert.equal(saves.profile.coins,0);assert.deepEqual(saves.profile.owned,[]);assert.equal(saves.profile.equipped[free.category],defaultEquipped()[free.category]);}
});

test('Queued normal purchases are cancelled after a debug epoch change, even if debug was turned back off before commit',async t=>{
  const item=paid(),{game,saves,gate}=await setup(t,{coins:item.price*4+1}),before=financial(saves.profile);
  const pendingGate=gate(),purchase=game.buy(item.id);game.setDebugMode(true);await game.equip(item.id);
  assert.equal(game.effectiveCosmetics()[item.category],item.id);game.setDebugMode(false);pendingGate.resolve();await purchase;await saves.queue;
  assert.deepEqual(financial(saves.profile),before);assert.deepEqual(game.debugCosmetics,{});assert.deepEqual(game.effectiveCosmetics(),resolveEquipped(saves.profile));
});

test('Queued normal equips cannot write a session preview after a debug toggle or make its unowned item permanent',async t=>{
  const item=paid(),{game,saves,gate}=await setup(t,{coins:10000});await game.buy(item.id);const before=financial(saves.profile);
  const pendingGate=gate(),equipping=game.equip(item.id);game.setDebugMode(true);const unowned=ITEMS.find(other=>other.price>0&&other.category===item.category&&other.id!==item.id);await game.buy(unowned.id);assert.equal(game.effectiveCosmetics()[item.category],unowned.id);
  game.setDebugMode(false);pendingGate.resolve();await equipping;await saves.queue;
  assert.deepEqual(financial(saves.profile),before);assert.ok(!saves.profile.owned.includes(unowned.id));assert.deepEqual(game.effectiveCosmetics(),resolveEquipped(saves.profile));
});
