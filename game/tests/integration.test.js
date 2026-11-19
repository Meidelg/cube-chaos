import test from 'node:test';
import assert from 'node:assert/strict';
import {Camera} from '../src/camera.js';
import {Race} from '../src/race.js';
import {Body} from '../src/physics.js';
import {U,ROOM,STEP,SIZES,GENERATOR_VERSION} from '../src/config.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {hash} from '../src/random.js';
import {generateMap} from '../src/map.js';

const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);

test('Camera: hidden viewport can become visible in portrait and landscape without invalid transforms',()=>{
  const listeners=new Map(),size={w:0,h:0},transform={scale:1,x:0,y:0};
  const element={addEventListener:(name,handler)=>listeners.set(name,handler),setPointerCapture:()=>{},getBoundingClientRect:()=>({left:0,top:0})};
  const world={scale:{set:value=>{transform.scale=value;}},position:{set:(x,y)=>{transform.x=x;transform.y=y;}}};
  const camera=new Camera(element,world,()=>size,()=>{}),map={width:2400,height:1100};
  camera.setMap(map);camera.apply();
  assert.ok(Number.isFinite(camera.zoom)&&camera.zoom>0,'A hidden screen must not produce a negative or NaN zoom');
  for(const viewport of [{w:390,h:690},{w:844,h:270}]){
    Object.assign(size,viewport);camera.fit();
    assert.ok(Number.isFinite(transform.scale)&&transform.scale>0);
    assert.ok(transform.x>=0&&transform.y>=0,'The fitted map starts inside the visible viewport');
    assert.ok(transform.x+map.width*transform.scale<=size.w+1e-7);
    assert.ok(transform.y+map.height*transform.scale<=size.h+1e-7);
    camera.setZoom(camera.zoom*2,size.w/2,size.h/2);
    assert.ok(Number.isFinite(transform.x)&&Number.isFinite(transform.y));
    const old={...transform};size.w=0;size.h=0;camera.apply();
    assert.deepEqual(transform,old,'Hiding a screen must preserve its last valid camera transform');
  }
});

// A saved map from the original 14×10 grid contract. Deliberately no width,
// height, floorRects or modern module metadata on the room records.
function legacyMap(){
  const rooms=Array.from({length:5},(_,id)=>({id,x:id,y:0,wx:id*ROOM.w*U,wy:0,links:[...(id?[id-1]:[]),...(id<4?[id+1]:[])],module:'open',rotation:0,distance:4-id,navigationDistance:4-id,next:id<4?id+1:null,ports:[...(id?['W']:[]),...(id<4?['E']:[])],exit:{x:1,y:0},wallStart:id*ROOM.w*U/32}));
  const walls=[];
  for(const r of rooms){
    walls.push({x:r.wx+ROOM.w*U/2,y:U/2,w:ROOM.w*U,h:U,roomId:r.id},{x:r.wx+ROOM.w*U/2,y:(ROOM.h-.5)*U,w:ROOM.w*U,h:U,roomId:r.id});
    for(const side of ['W','E']){
      const x=r.wx+(side==='W'?.5:ROOM.w-.5)*U;
      if(r.ports.includes(side)){const end=(ROOM.h-ROOM.door)/2;walls.push({x,y:end*U/2,w:U,h:end*U,roomId:r.id},{x,y:(ROOM.h-end/2)*U,w:U,h:end*U,roomId:r.id});}
      else walls.push({x,y:ROOM.h*U/2,w:U,h:ROOM.h*U,roomId:r.id});
    }
  }
  return{seed:'LEGACY-FIXTURE',size:'small',generatorVersion:1,rooms,walls,floors:rooms.map(r=>({x:r.wx,y:0,w:ROOM.w*U,h:ROOM.h*U,roomId:r.id})),mechanisms:[{id:'legacy-press',type:'press',x:ROOM.w*U+5*U,y:3*U,w:U,h:3*U,dx:1,dy:0,travel:4,period:5,phase:.7,roomId:1}],start:{x:7*U,y:5*U},finish:{x:4*ROOM.w*U+10*U,y:2*U,w:3*U,h:6*U,roomId:4},width:5*ROOM.w*U,height:ROOM.h*U};
}

test('Legacy v0.1/gen1 JSON restores its complete map, effects and participants under the new game version',()=>{
  const original=new Race(legacyMap(),6),profile=freshProfile();profile.coins=1730;profile.owned=['blueprint'];profile.equipped.theme='blueprint';
  original.select(3);original.start();
  for(const c of original.cubes)Body.setVelocity(c.body,{x:0,y:0});
  original.ticks=240;original.mechanisms.update(original.time,0);original.cubes[0].boostUntil=3;original.cubes[0].boostAmount=2;original.cubes[0].usedResize=['legacy-size-used'];original.physics.kill(original.cubes[5],1.5,'Лазер');
  const oldData=pack(profile,original.snapshot());oldData.gameVersion='0.1.0';const {checksum,...payload}=oldData;oldData.checksum=hash(JSON.stringify(payload)).toString(16);
  const read=unpack(JSON.parse(JSON.stringify(oldData))),restored=new Race(read.race.map,read.race.count,undefined,null,read.race);
  try{
    assert.equal(read.profile.coins,1730);assert.deepEqual(read.profile.owned,['blueprint']);assert.equal(restored.map.generatorVersion,1);assert.equal(restored.map.seed,'LEGACY-FIXTURE');
    assert.deepEqual(restored.map.walls,oldData.race.map.walls,'Legacy collider geometry must not be regenerated with the new generator');
    assert.equal(restored.map.rooms.length,5);assert.equal(restored.id,original.id);near(restored.time,2,'legacy time');assert.equal(restored.prediction.selected,3);assert.ok(restored.paused);
    assert.equal(restored.cubes[5].alive,false);assert.equal(restored.cubes[5].deathTime,1.5);assert.ok(!restored.physics.engine.world.bodies.includes(restored.cubes[5].body));
    assert.equal(restored.cubes[0].boostUntil,3);assert.deepEqual(restored.cubes[0].usedResize,['legacy-size-used']);
    for(let i=0;i<6;i++){near(restored.cubes[i].body.position.x,original.cubes[i].body.position.x,'restored x');near(restored.cubes[i].body.position.y,original.cubes[i].body.position.y,'restored y');}
    const press=restored.mechanisms.items[0].body,oldPress=original.mechanisms.items[0].body;near(press.position.x,oldPress.position.x,'press phase x');near(press.position.y,oldPress.position.y,'press phase y');
    restored.paused=false;restored.step();near(restored.time,2+STEP/1000,'continued time');
    const rewritten=unpack(JSON.parse(JSON.stringify(pack(read.profile,restored.snapshot()))));assert.equal(rewritten.race.map.generatorVersion,1);assert.equal(rewritten.profile.coins,1730);assert.deepEqual(rewritten.profile.owned,['blueprint']);
  }finally{original.destroy();restored.destroy();}
});

// The v2 format stored disjoint floor rectangles and world-space ports/sweeps,
// before canonical grid strings or individual wallTiles existed.
function legacyV2Map(){
  const floor=(x,y,w,h,roomId)=>({x:x*U,y:y*U,w:w*U,h:h*U,roomId});
  const wall=(x,y,w,h)=>({x:(x+w/2)*U,y:(y+h/2)*U,w:w*U,h:h*U,roomId:0});
  const startFloors=[floor(0,0,14,10,0)],turnFloors=[floor(14,2,6,6,1),floor(20,2,6,6,1),floor(20,8,6,6,1)];
  const finish={x:21*U,y:9*U,w:3*U,h:4*U,roomId:1};
  const rooms=[
    {id:0,module:'start',kind:'start',x:0,y:0,wx:0,wy:0,w:14,h:10,width:14*U,height:10*U,links:[1],ports:[{id:'out',x:14*U,y:5*U,width:6*U,direction:{x:1,y:0},link:1}],floors:startFloors,next:1,exit:{x:1,y:0},distance:1,navigationDistance:14*U,wallStart:0,wallLength:14*U,sweeps:[{...startFloors[0],dx:1,dy:0,length:14*U,startOffset:0,next:null}]},
    {id:1,module:'legacy-terminal-turn',kind:'finish',x:14,y:2,wx:14*U,wy:2*U,w:12,h:12,width:12*U,height:12*U,links:[0],ports:[{id:'in',x:14*U,y:5*U,width:6*U,direction:{x:-1,y:0},link:0}],floors:turnFloors,next:null,exit:{x:0,y:1},distance:0,navigationDistance:0,wallStart:14*U/32,wallLength:18*U,finish,sweeps:[{...turnFloors[0],dx:1,dy:0,length:6*U,startOffset:0,next:1},{...turnFloors[1],dx:0,dy:1,length:6*U,startOffset:6*U,next:2},{...turnFloors[2],dx:0,dy:1,length:6*U,startOffset:12*U,next:null}]},
  ];
  return{seed:'LEGACY-V2-FLOORS',generatorVersion:2,size:'small',rooms,floors:[...startFloors,...turnFloors],walls:[wall(0,-1,14,1),wall(0,10,14,1),wall(-1,0,1,10),wall(14,0,1,2),wall(14,8,1,2),wall(15,1,11,1),wall(26,2,1,12),wall(15,8,5,1),wall(19,9,1,5),wall(20,14,6,1)],mechanisms:[{id:'v2-press',type:'press',x:23*U,y:10*U,w:U,h:2*U,dx:1,dy:0,travel:1,period:5,phase:.2,roomId:1}],start:{x:7*U,y:5*U},finish,width:27*U,height:15*U};
}

test('Legacy v0.2/gen2 floor/port/sweep JSON restores without requiring or generating a v3 tile grid',()=>{
  const original=new Race(legacyV2Map(),6),profile=freshProfile();profile.coins=840;profile.owned=['mint'];original.select(2);original.start();original.ticks=210;
  Body.setVelocity(original.cubes[0].body,{x:1.25,y:-2.75});original.mechanisms.update(original.time,0);
  const raw=pack(profile,original.snapshot());raw.gameVersion='0.2.0';const{checksum,...payload}=raw;raw.checksum=hash(JSON.stringify(payload)).toString(16);
  const read=unpack(JSON.parse(JSON.stringify(raw))),restored=new Race(read.race.map,read.race.count,undefined,null,read.race);
  try{
    assert.equal(read.gameVersion,'0.2.0');assert.equal(restored.map.generatorVersion,2);assert.ok(!('wallTiles'in restored.map));assert.ok(restored.map.rooms.every(part=>!('grid'in part)));
    assert.deepEqual(restored.map.floors,raw.race.map.floors);assert.deepEqual(restored.map.walls,raw.race.map.walls);assert.deepEqual(restored.map.rooms.map(p=>p.sweeps),raw.race.map.rooms.map(p=>p.sweeps));
    assert.equal(read.profile.coins,840);assert.deepEqual(read.profile.owned,['mint']);assert.ok(restored.paused);assert.equal(restored.prediction.selected,2);assert.equal(restored.ticks,210);
    near(restored.cubes[0].body.velocity.x,1.25,'v2 saved velocity x');near(restored.cubes[0].body.velocity.y,-2.75,'v2 saved velocity y');near(restored.mechanisms.items[0].body.position.x,original.mechanisms.items[0].body.position.x,'v2 press phase');
    restored.paused=false;restored.step();assert.equal(restored.ticks,211);const savedAgain=unpack(JSON.parse(JSON.stringify(pack(read.profile,restored.snapshot()))));assert.equal(savedAgain.race.map.generatorVersion,2);assert.equal(savedAgain.profile.coins,840);
  }finally{original.destroy();restored.destroy();}
});

function frontState(race){return race.mechanisms.fronts.map(f=>({roomId:f.roomId,index:f.index,active:f.active,amount:f.amount,width:f.physicalWidth,height:f.physicalHeight,bounds:f.body?{min:{x:Math.min(...f.body.vertices.map(v=>v.x)),y:Math.min(...f.body.vertices.map(v=>v.y))},max:{x:Math.max(...f.body.vertices.map(v=>v.x)),y:Math.max(...f.body.vertices.map(v=>v.y))}}:null}));}
function compareFronts(actual,expected){
  assert.equal(actual.length,expected.length);
  for(let i=0;i<actual.length;i++){
    const a=actual[i],b=expected[i];assert.equal(a.roomId,b.roomId);assert.equal(a.index,b.index);assert.equal(a.active,b.active);near(a.amount,b.amount,`front ${i} amount`);
    assert.equal(!!a.bounds,!!b.bounds,`front ${i} existence`);
    if(a.bounds){near(a.width,b.width,`front ${i} physical width`);near(a.height,b.height,`front ${i} physical height`);for(const edge of ['min','max'])for(const axis of ['x','y'])near(a.bounds[edge][axis],b.bounds[edge][axis],`front ${i} ${edge}.${axis}`);}
  }
}

test('Current tiled snapshot restores active section sweeps, consumed mechanisms and portal wall handoff without a jump',()=>{
  const map=generateMap('integration-variable-0','medium');
  assert.equal(map.generatorVersion,GENERATOR_VERSION);assert.ok(Array.isArray(map.wallTiles));assert.ok(map.rooms.every(part=>Array.isArray(part.grid)));assert.ok(new Set(map.rooms.map(p=>`${p.width}x${p.height}`)).size>1);
  assert.ok(map.rooms.some(p=>p.sweeps.length>1),'Exercise a nonrectangular section with several front bodies');
  const original=new Race(map,12);original.select(4);original.start();
  let checkpoint=false;
  // Advance the mechanism clock independently of racer physics: this isolates the
  // save/restore of a wall after many section transitions and portal consumption.
  for(let tick=1;tick<=120*300;tick++){
    original.ticks=tick;original.mechanisms.update(original.time,STEP/1000);
    const m=original.mechanisms;
    if(original.time>SIZES.medium.wall+20&&m.wallStarts.some(t=>t!==null)&&m.items.some(i=>i.removed)&&m.fronts.some(f=>f.active&&f.amount>1&&f.amount<f.sweep.length-1)){checkpoint=true;break;}
  }
  assert.ok(checkpoint,'A portal handoff and a partially moving wall must be reached');
  const profile=freshProfile();profile.coins=700;profile.owned=['comet'];
  const data=unpack(JSON.parse(JSON.stringify(pack(profile,original.snapshot()))));
  const expected=frontState(original),restored=new Race(data.race.map,data.race.count,undefined,null,data.race);
  try{
    assert.ok(restored.paused);near(restored.time,original.time,'checkpoint time');compareFronts(frontState(restored),expected);
    assert.deepEqual(restored.mechanisms.snapshot().wallStarts,original.mechanisms.snapshot().wallStarts);
    const removed=r=>r.mechanisms.items.filter(m=>m.removed).map(m=>m.id).sort();assert.deepEqual(removed(restored),removed(original));
    for(const m of restored.mechanisms.items)if(m.removed&&m.body)assert.ok(!restored.physics.engine.world.bodies.includes(m.body),`Consumed ${m.id} cannot reappear as a collider`);
    original.ticks++;restored.ticks++;original.mechanisms.update(original.time,STEP/1000);restored.mechanisms.update(restored.time,STEP/1000);
    compareFronts(frontState(restored),frontState(original));assert.deepEqual(removed(restored),removed(original));
    const reexported=unpack(JSON.parse(JSON.stringify(pack(data.profile,restored.snapshot()))));assert.equal(reexported.profile.coins,700);assert.deepEqual(reexported.profile.owned,['comet']);
  }finally{original.destroy();restored.destroy();}
});
