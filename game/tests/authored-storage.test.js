import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDraft} from '../src/part-library.js';
import {createPartObject} from '../src/part-objects.js';
import {createPartPreview} from '../src/map.js';
import {Race} from '../src/race.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {VERSION} from '../src/config.js';

function fixture(){
  const part=createPartDraft(16,12);part.id='storage-objects';part.grid=Array(12).fill('б'.repeat(16));
  part.objects=[createPartObject('laser',{x:3,y:3},{id:'beam',end:{x:10,y:3}}),createPartObject('press',{x:3,y:7},{id:'press'}),createPartObject('portal',{x:10,y:7},{id:'portal-a',pair:'portal-b'}),createPartObject('portal',{x:13,y:7},{id:'portal-b',pair:'portal-a'})];
  const profile=freshProfile();profile.coins=1300;profile.owned=['blueprint'];profile.partLibrary=[part];
  const race=new Race(createPartPreview(part),4);const data=JSON.parse(JSON.stringify(pack(profile,race.snapshot())));race.destroy();return data;
}

test('Authored mechanism saves retain laser emitters, parameters and paired namespaced portals',()=>{
  const data=unpack(fixture()),laser=data.race.map.mechanisms.find(m=>m.type==='laser');
  assert.equal(Object.keys(data)[0],'gameVersion');assert.equal(data.gameVersion,VERSION);
  assert.equal(laser.emitters.length,2);assert.ok(laser.authored);assert.equal(laser.period,4);
  assert.equal(data.profile.coins,1300);assert.deepEqual(data.profile.owned,['blueprint']);
  const portals=data.race.map.mechanisms.filter(m=>m.type==='portal');assert.equal(portals.length,2);assert.equal(portals[0].pair,portals[1].id);assert.equal(portals[1].pair,portals[0].id);
});

test('Authored mechanism saves reject broken runtime laser geometry and invalid press timing',()=>{
  for(const mutate of [
    map=>{map.mechanisms.find(m=>m.type==='laser').emitters[1].y+=5;},
    map=>{map.mechanisms.find(m=>m.type==='laser').period=0;},
    map=>{map.mechanisms.find(m=>m.type==='press').period=0;},
    map=>{map.mechanisms.find(m=>m.type==='press').dx=2;},
    map=>{const p=map.mechanisms.find(m=>m.type==='portal');p.pair=p.id;},
  ]){const data=fixture();mutate(data.race.map);assert.throws(()=>unpack(pack(data.profile,data.race)),/авторские механизмы/);}
});

test('A dense authored library saves more than the old 200-mechanism limit without losing objects',async()=>{
  const {generateMap}=await import('../src/map.js');
  const part=createPartDraft(32,32);part.id='dense-wall-starts';part.grid=Array(32).fill('б'.repeat(32));
  part.objects=Array.from({length:128},(_,i)=>createPartObject('wall-start',{x:1+i%16,y:1+Math.floor(i/16)},{id:`start-${i}`}));
  const profile=freshProfile();profile.partLibrary=[part];
  const map=generateMap('dense-wall-save','medium',[part]);assert.ok(map.mechanisms.length>200);
  const race=new Race(map,2);
  try{const read=unpack(JSON.parse(JSON.stringify(pack(profile,race.snapshot()))));assert.equal(read.race.map.mechanisms.length,map.mechanisms.length);}finally{race.destroy();}
});

test('Object libraries export versioned format2 and retain import support for format1',async()=>{
  const {serializePartLibrary,parsePartLibrary}=await import('../src/part-library.js');
  const data=fixture(),parts=data.profile.partLibrary,exported=JSON.parse(serializePartLibrary(parts));
  assert.equal(Object.keys(exported)[0],'gameVersion');assert.equal(exported.formatVersion,2);
  assert.deepEqual(parsePartLibrary(exported),parts);
  assert.deepEqual(parsePartLibrary({type:'cube-chaos-parts',formatVersion:1,parts}),parts);
  exported.gameVersion='99.0.0';assert.throws(()=>parsePartLibrary(exported),/новой версией/);
});
