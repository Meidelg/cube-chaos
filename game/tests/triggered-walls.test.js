import test from 'node:test';
import assert from 'node:assert/strict';
import {Race} from '../src/race.js';
import {Body,box,overlaps} from '../src/physics.js';
import {U,STEP,GENERATOR_VERSION} from '../src/config.js';
import {compilePart,createPartDraft} from '../src/part-library.js';
import {createPartObject} from '../src/part-objects.js';
import {instantiateModule} from '../src/modules.js';
import {freshProfile,pack,unpack} from '../src/save.js';

const close=(a,b,label='coordinate')=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const marker=(id,x,y,dx,dy)=>({id,type:'wall-start',x:(x+.5)*U,y:(y+.5)*U,w:U,h:U,dx,dy,roomId:0,phase:0,authored:true});
function fixture(mechanisms=[marker('east',2,0,1,0),marker('south',5,3,0,1),marker('west',9,6,-1,0)]){
  const floor={x:0,y:0,w:12*U,h:12*U,roomId:0},finish={x:10*U,y:10*U,w:U,h:U,roomId:0};
  return{seed:'TRIGGER-WALLS',generatorVersion:GENERATOR_VERSION,size:'small',width:13*U,height:13*U,start:{x:5*U,y:8*U},finish,floors:[floor],walls:[{x:-U/2,y:6*U,w:U,h:14*U},{x:12.5*U,y:6*U,w:U,h:14*U},{x:6*U,y:-U/2,w:12*U,h:U},{x:6*U,y:12.5*U,w:12*U,h:U}],mechanisms,rooms:[{id:0,module:'trigger-fixture',kind:'start',x:0,y:0,wx:0,wy:0,w:12,h:12,width:12*U,height:12*U,grid:Array(12).fill('б'.repeat(12)),floors:[floor],links:[],ports:[],exit:{x:1,y:0},next:null,distance:0,navigationDistance:0,wallStart:0,sweeps:[{x:0,y:0,w:4*U,h:U,dx:1,dy:0,length:4*U,startOffset:0,next:null}],finish}]};
}
// Isolate front propagation from participant outcomes: the real Race snapshot
// and Matter bodies are used, while only the mechanism clock is advanced.
function advance(race,time){for(let tick=race.ticks+1;tick<=Math.round(time*1000/STEP);tick++){race.ticks=tick;race.mechanisms.update(race.time,STEP/1000);}}
const byTrigger=(race,id)=>race.mechanisms.fronts.find(f=>f.triggerId===id);
function states(race){return race.mechanisms.fronts.map(f=>({id:f.triggerId||`${f.roomId}:${f.index}`,active:f.active,amount:f.amount,w:f.physicalWidth??null,h:f.physicalHeight??null,x:f.body?.position.x??null,y:f.body?.position.y??null}));}
function equalStates(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)for(const key of Object.keys(a[i])){if(typeof a[i][key]==='number')close(a[i][key],b[i][key],`${a[i].id} ${key}`);else assert.equal(a[i][key],b[i][key]);}}

test('Extra wall starts remain dormant after the timer and ignore overlapping ordinary mechanisms',()=>{
  const start=marker('isolated',5,3,0,1),map=fixture([start,{id:'ordinary',type:'bumper',x:start.x,y:start.y,w:U,h:U,roomId:0}]),race=new Race(map,2);
  try{
    advance(race,40);const m=race.mechanisms.items.find(m=>m.id===start.id),bumper=race.mechanisms.items.find(m=>m.id==='ordinary');
    assert.ok(race.mechanisms.wallActive);assert.ok(overlaps(bumper.body.bounds,box(start.x,start.y,U,U)));
    assert.equal(m.removed,false);assert.deepEqual(race.mechanisms.snapshot().triggeredWallStarts,{});assert.equal(byTrigger(race,start.id).body,null);
  }finally{race.destroy();}
});

test('A marker starts at exact physical side contact, but a .01px gap and expanded broadphase bounds do not start it',()=>{
  const map=fixture([marker('contact',2,0,1,0)]),race=new Race(map,2);
  try{
    const justBefore=16.5-.01/32;race.mechanisms.update(justBefore,STEP/1000);
    const primary=race.mechanisms.fronts.find(f=>!f.triggerId),cell=map.mechanisms[0],bounds=race.mechanisms.frontBounds(primary);
    close(cell.x-U/2-bounds.max.x,.01,'physical gap');assert.equal(byTrigger(race,'contact').active,false);
    race.ticks=Math.round(16.5*1000/STEP);race.mechanisms.update(race.time,STEP/1000);
    close(race.mechanisms.frontBounds(primary).max.x,cell.x-U/2,'touching faces');
    assert.equal(race.mechanisms.snapshot().triggeredWallStarts.contact,race.time);assert.ok(byTrigger(race,'contact').body);assert.ok(race.mechanisms.items[0].removed);
  }finally{race.destroy();}
});

test('Three additional markers form an E → S → W chain with independent latched times and ordinary physical walls',()=>{
  const race=new Race(fixture(),2);
  try{
    advance(race,16.5);close(race.mechanisms.snapshot().triggeredWallStarts.east,16.5,'east start');assert.equal(byTrigger(race,'south').active,false);
    advance(race,18.75);close(race.mechanisms.snapshot().triggeredWallStarts.south,18.75,'south start');assert.equal(byTrigger(race,'west').active,false);
    advance(race,21);close(race.mechanisms.snapshot().triggeredWallStarts.west,21,'west start');advance(race,22);
    const starts=race.mechanisms.snapshot().triggeredWallStarts;assert.deepEqual(Object.keys(starts).sort(),['east','south','west']);
    for(const id of Object.keys(starts)){const f=byTrigger(race,id);assert.ok(f.active);assert.equal(f.body.isStatic,true);assert.equal(f.body.isSensor,false);assert.equal(f.body.plugin.crush,true);assert.ok(race.physics.moving.includes(f.body));assert.equal(race.mechanisms.items.find(m=>m.id===id).removed,true);}
    close(byTrigger(race,'west').physicalWidth,32,'one second of westward growth');close(byTrigger(race,'west').physicalHeight,12*U,'floor crossspan');
    const before=states(race),bodyCount=race.physics.moving.length;race.mechanisms.update(race.time,0);
    equalStates(states(race),before);assert.equal(race.physics.moving.length,bodyCount);assert.deepEqual(race.mechanisms.snapshot().triggeredWallStarts,starts);
  }finally{race.destroy();}
});

test('All four module rotations preserve the directional launch point, direction and 32px/s growth',()=>{
  const draft=createPartDraft(12,12);draft.id='rotating-wall-start';draft.grid=Array(12).fill('б'.repeat(12));draft.entry={x:0,y:6,side:'W',width:1};draft.exit={x:11,y:6,side:'E',width:1};draft.wallStart={x:0,y:6,direction:'E'};draft.objects=[createPartObject('wall-start',{x:4,y:5},{id:'rotated',direction:'E'})];
  const source=compilePart(draft),directions=[[1,0],[0,1],[-1,0],[0,-1]];
  for(let turns=0;turns<4;turns++){
    const local=instantiateModule(source,turns).mechanisms[0],m={...local,x:local.x*U,y:local.y*U,w:U,h:U,roomId:0},map=fixture([m]);
    map.rooms[0].sweeps=[{x:m.x-U/2-1,y:m.y-U/2,w:U+2,h:U,dx:1,dy:0,length:U+2,startOffset:0,next:null}];const race=new Race(map,2);
    try{
      race.ticks=Math.round(16*1000/STEP);race.mechanisms.update(race.time,STEP/1000);const f=byTrigger(race,'rotated');assert.ok(f.active);assert.deepEqual([f.sweep.dx,f.sweep.dy],directions[turns]);
      advance(race,17);const b=race.mechanisms.frontBounds(f),[dx,dy]=directions[turns];
      close(dx?f.physicalWidth:f.physicalHeight,32,'growth');close(dx?f.physicalHeight:f.physicalWidth,12*U,'crossspan');
      if(dx>0)close(b.min.x,m.x-U/2);if(dx<0)close(b.max.x,m.x+U/2);if(dy>0)close(b.min.y,m.y-U/2);if(dy<0)close(b.max.y,m.y+U/2);
    }finally{race.destroy();}
  }
});

test('A triggered wall stops at fixed geometry and kills only after the physical closing gap becomes crushing',()=>{
  const map=fixture([marker('east',2,0,1,0)]);map.walls.push({x:6.5*U,y:6*U,w:U,h:12*U});const race=new Race(map,2);
  try{
    const cube=race.cubes[0];Body.setPosition(cube.body,{x:5.5*U,y:6*U});Body.setVelocity(cube.body,{x:0,y:0});
    advance(race,18.75);race.physics.checkCrush(cube,race.time);assert.ok(cube.alive,'Simple contact leaves a complete cube-width gap');
    advance(race,18.9);race.physics.checkCrush(cube,race.time);assert.equal(cube.alive,false);assert.equal(cube.reason,'Раздавлен');
    advance(race,30);const f=byTrigger(race,'east');close(f.sweep.length,4*U);close(race.mechanisms.frontBounds(f).max.x,6*U,'fixed wall face');
  }finally{race.destroy();}
});

test('Race JSON restores a partially triggered chain and keeps the next marker dormant until a later physical contact',()=>{
  const race=new Race(fixture(),2);race.select(1);race.start();advance(race,20);
  const data=unpack(JSON.parse(JSON.stringify(pack(freshProfile(),race.snapshot())))),restored=new Race(data.race.map,data.race.count,undefined,null,data.race);
  try{
    assert.ok(restored.paused);equalStates(states(restored),states(race));assert.deepEqual(restored.mechanisms.snapshot().triggeredWallStarts,race.mechanisms.snapshot().triggeredWallStarts);
    assert.equal(byTrigger(restored,'west').body,null);assert.equal(restored.mechanisms.items.find(m=>m.id==='west').removed,false);
    advance(race,22);advance(restored,22);equalStates(states(restored),states(race));assert.deepEqual(restored.mechanisms.snapshot().triggeredWallStarts,race.mechanisms.snapshot().triggeredWallStarts);
    assert.equal(restored.mechanisms.items.filter(m=>m.type==='wall-start'&&m.removed).length,3);
  }finally{race.destroy();restored.destroy();}
  const old=new Race(fixture([marker('old-dormant',5,3,0,1)]),2),saved=old.snapshot();delete saved.mechanisms.triggeredWallStarts;const compatible=new Race(saved.map,saved.count,undefined,null,saved);
  try{assert.deepEqual(compatible.mechanisms.snapshot().triggeredWallStarts,{});assert.equal(byTrigger(compatible,'old-dormant').body,null);}finally{old.destroy();compatible.destroy();}
});

test('An active extra wall in a portal destination cannot suppress the destination primary front handoff',()=>{
  const m=marker('destination-marker',22,3,0,1);m.roomId=1;
  const map=fixture([{id:'portal-source',type:'portal',pair:'portal-destination',x:2.5*U,y:.5*U,w:U,h:U,roomId:0},{id:'portal-destination',type:'portal',pair:'portal-source',x:26*U,y:9.5*U,w:U,h:U,roomId:1},m]);
  const floor={x:20*U,y:0,w:12*U,h:12*U,roomId:1};map.rooms.push({id:1,wx:20*U,wy:0,width:12*U,height:12*U,exit:{x:1,y:0},wallStart:1000,floors:[floor],sweeps:[{...floor,dx:1,dy:0,length:12*U,startOffset:0}]});map.floors.push(floor);map.width=33*U;const race=new Race(map,2);
  try{
    race.mechanisms.restore({triggeredWallStarts:{'destination-marker':15},removed:['destination-marker']});race.ticks=Math.round(15*1000/STEP);race.mechanisms.update(race.time,0);assert.ok(byTrigger(race,m.id).active);
    advance(race,17);assert.ok(race.mechanisms.wallStarts[1]>=15&&race.mechanisms.wallStarts[1]<17);assert.ok(race.mechanisms.fronts.some(f=>!f.triggerId&&f.roomId===1&&f.active));
  }finally{race.destroy();}
});

test('Pursuit absorption includes a whole-cell laser emitter even when its thin beam is outside the wall crossspan',()=>{
  const laser={id:'edge-emitter',type:'laser',x:4.5*U,y:1.5*U,w:5*U,h:.2*U,emitters:[{x:2.5*U,y:1.5*U},{x:6.5*U,y:1.5*U}],period:4,on:1.5,phase:0,roomId:0};
  const map=fixture([laser]);map.rooms[0].sweeps[0].y=.5*U;map.rooms[0].sweeps[0].h=.6*U;const race=new Race(map,2);
  try{advance(race,17);assert.equal(race.mechanisms.items[0].removed,true);}finally{race.destroy();}
});
