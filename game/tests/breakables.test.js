import test from 'node:test';
import assert from 'node:assert/strict';
import {Breakables} from '../src/breakables.js';
import {Physics,Bodies,Body,Composite} from '../src/physics.js';
import {Race} from '../src/race.js';
import {generateMap} from '../src/map.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {BASE_SPEED,COLORS,STEP,U,SIZES} from '../src/config.js';

const types=['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall'];
const duration=STEP/1000;
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);

function physicalFixture(type,{hits=type.endsWith('-wall')?3:1,color='#6078ed',cubes=[{id:1,x:-2*U,y:0,color:'#6078ed',vx:BASE_SPEED,vy:0}]}={}){
  const physics=new Physics({walls:[]});
  const item={id:'barrier',type,x:0,y:0,w:U,h:type.endsWith('-wall')?6*U:U,hits,remainingHits:hits,damageColor:color,colorSlot:0,roomId:0,removed:false,pulse:0};
  item.body=Bodies.rectangle(item.x,item.y,item.w,item.h,{isStatic:true,restitution:1,friction:0,frictionStatic:0,slop:.015});
  item.body.plugin={crush:false,motion:{x:0,y:0}};physics.addMoving(item.body);
  const participants=cubes.map(c=>physics.addCube(c.id,c.x,c.y,c.color,{x:c.vx,y:c.vy}));
  const sounds=[],controller=new Breakables(physics,[item],{play:name=>sounds.push(name)});
  let ticks=0;
  const tick=()=>{controller.beforeStep();physics.step();controller.afterStep(++ticks*duration);};
  const separate=(cube=participants[0])=>{Body.setPosition(cube.body,{x:-4*U,y:0});Body.setVelocity(cube.body,{x:0,y:0});for(let i=0;i<3;i++)tick();};
  const strike=(cube=participants[0])=>{
    Body.setPosition(cube.body,{x:-2*U,y:0});Body.setVelocity(cube.body,{x:BASE_SPEED,y:0});
    for(let i=0;i<60;i++){tick();if(cube.body.velocity.x<-.1)return;}
    assert.fail('The cube must visibly bounce from the solid barrier within 60 fixed steps');
  };
  return{physics,item,cubes:participants,controller,tick,separate,strike,sounds,destroy:()=>physics.destroy()};
}

test('A universal block disappears only after its real Matter collision has reflected the cube',()=>{
  const f=physicalFixture('breakable-block');
  try{
    const cube=f.cubes[0];f.strike();
    assert.ok(cube.body.velocity.x<0,'The final hit must send the cube back rather than carry it through');
    assert.ok(cube.body.position.x<0,'Destruction does not teleport the cube to the other side');
    assert.equal(f.item.remainingHits,0);assert.ok(f.item.removed);
    assert.ok(!Composite.allBodies(f.physics.engine.world).includes(f.item.body));
    assert.ok(!f.physics.moving.includes(f.item.body),'A broken block must stop blocking resize and safe-position checks');
    const x=cube.body.position.x;f.tick();assert.ok(cube.body.position.x<x,'The following step continues the already reflected motion');
  }finally{f.destroy();}
});

test('A vertical incoming impact also bounces before destroying a block',()=>{
  const f=physicalFixture('breakable-block',{cubes:[{id:1,x:0,y:-2*U,color:'#6078ed',vx:0,vy:BASE_SPEED}]});
  try{for(let i=0;i<60&&!f.item.removed;i++)f.tick();assert.ok(f.item.removed);assert.equal(f.item.remainingHits,0);assert.ok(f.cubes[0].body.velocity.y<0,'Normal orientation must work on the y axis as well as x');}
  finally{f.destroy();}
});

test('A one-cell-thick row of breakable blocks loses only the struck cell, not the whole group',()=>{
  const physics=new Physics({walls:[]}),items=[-1,0,1].map((offset,i)=>{
    const item={id:`row-${i}`,groupId:'cell-row',type:'breakable-block',x:0,y:offset*U,w:U,h:U,hits:1,remainingHits:1,removed:false,roomId:0,pulse:0};
    item.body=Bodies.rectangle(item.x,item.y,U,U,{isStatic:true,restitution:1,friction:0,frictionStatic:0,slop:.015});item.body.plugin={crush:false,motion:{x:0,y:0}};physics.addMoving(item.body);return item;
  }),cube=physics.addCube(1,-2*U,0,'#6078ed',{x:BASE_SPEED,y:0}),controller=new Breakables(physics,items);
  try{
    for(let tick=1;tick<=60&&!items[1].removed;tick++){controller.beforeStep();physics.step();controller.afterStep(tick*duration);}
    assert.ok(items[1].removed);assert.equal(items[1].remainingHits,0);assert.ok(cube.body.velocity.x<0);
    for(const item of [items[0],items[2]]){assert.ok(!item.removed);assert.equal(item.remainingHits,1);assert.ok(Composite.allBodies(physics.engine.world).includes(item.body));}
  }finally{physics.destroy();}
});

test('The wrong cube color bounces from a colored block without damaging it',()=>{
  const f=physicalFixture('breakable-color-block',{color:'#6078ed',cubes:[{id:1,x:-2*U,y:0,color:'#f07171',vx:BASE_SPEED,vy:0}]});
  try{f.strike();assert.ok(f.cubes[0].body.velocity.x<0);assert.equal(f.item.remainingHits,1);assert.equal(f.item.removed,false);assert.ok(Composite.allBodies(f.physics.engine.world).includes(f.item.body));}
  finally{f.destroy();}
});

test('Colored blocks match the actual color case-insensitively, independent of participant number',()=>{
  const f=physicalFixture('breakable-color-block',{color:'#6078ed',cubes:[{id:7,x:-2*U,y:0,color:'#6078ED',vx:BASE_SPEED,vy:0}]});
  try{f.strike();assert.equal(f.item.remainingHits,0);assert.ok(f.item.removed);assert.ok(f.cubes[0].body.velocity.x<0);}
  finally{f.destroy();}
});

test('A colored barrier binds a configured palette slot to an existing participant when N is smaller than 12',()=>{
  const f=physicalFixture('breakable-color-wall',{cubes:[{id:1,x:-4*U,y:-2*U,color:'#f07171',vx:0,vy:0},{id:2,x:-4*U,y:2*U,color:'#6078ed',vx:0,vy:0}]});
  try{f.item.colorSlot=11;f.controller.bindParticipants(f.cubes);assert.equal(f.item.damageColor.toLowerCase(),f.cubes[1].color.toLowerCase());}
  finally{f.destroy();}
});

for(const type of ['breakable-wall','breakable-color-wall'])test(`${type}: one impact counts once while continuously pressed, and fresh impacts count after separation`,()=>{
  const f=physicalFixture(type,{hits:3}),cube=f.cubes[0];
  try{
    f.strike();assert.equal(f.item.remainingHits,2);assert.ok(!f.item.removed);
    // This sustained inward pressure recreates a conveyor or a mechanism holding
    // the cube against the same wall. New ticks must not become new strikes.
    for(let i=0;i<24;i++){Body.setPosition(cube.body,{x:-U+.1,y:0});Body.setVelocity(cube.body,{x:.25,y:0});f.tick();}
    assert.equal(f.item.remainingHits,2,'Persistent contact must not consume the remaining hits');
    f.separate();f.strike();assert.equal(f.item.remainingHits,1);assert.ok(!f.item.removed);
    f.separate();f.strike();assert.equal(f.item.remainingHits,0);assert.ok(f.item.removed);assert.ok(cube.body.velocity.x<0);
  }finally{f.destroy();}
});

test('The colored wall ignores a wrong-color impact and accepts a later eligible impact after separation',()=>{
  const f=physicalFixture('breakable-color-wall',{hits:3,color:'#6078ed',cubes:[{id:1,x:-2*U,y:0,color:'#f07171',vx:BASE_SPEED,vy:0}]}),cube=f.cubes[0];
  try{f.strike();assert.equal(f.item.remainingHits,3);assert.ok(cube.body.velocity.x<0);f.separate();cube.color='#6078ed';f.strike();assert.equal(f.item.remainingHits,2);assert.ok(cube.body.velocity.x<0);}
  finally{f.destroy();}
});

test('Two simultaneous final impacts both bounce before the shared wall is removed once',()=>{
  for(const hits of [1,2]){
    const f=physicalFixture('breakable-wall',{hits,cubes:[{id:1,x:-2*U,y:-1.5*U,color:'#6078ed',vx:BASE_SPEED,vy:0},{id:2,x:2*U,y:1.5*U,color:'#f07171',vx:-BASE_SPEED,vy:0}]});
    try{
      for(let i=0;i<60&&!f.item.removed;i++)f.tick();
      assert.ok(f.item.removed,'Two distinct simultaneous impacts must exhaust a two-hit wall');assert.equal(f.item.remainingHits,0,'The shared counter must never underflow');
      assert.ok(f.cubes[0].body.velocity.x<0,'The left-side cube must reflect');assert.ok(f.cubes[1].body.velocity.x>0,'The right-side cube must reflect in the same step');
      assert.ok(!Composite.allBodies(f.physics.engine.world).includes(f.item.body));
      for(let i=0;i<5;i++)f.tick();assert.equal(f.item.remainingHits,0);
    }finally{f.destroy();}
  }
});

test('A newly resting cube does not destroy a block without an incoming impact',()=>{
  const f=physicalFixture('breakable-block',{cubes:[{id:1,x:-U+.01,y:0,color:'#6078ed',vx:0,vy:0}]});
  try{for(let i=0;i<30;i++)f.tick();assert.equal(f.item.remainingHits,1);assert.ok(!f.item.removed);}
  finally{f.destroy();}
});

function raceFixture(type='breakable-color-wall',hits=3){
  const map=generateMap('breakable-race-fixture','small'),x=map.start.x+3*U,y=map.start.y;
  map.mechanisms=[{id:'saved-barrier',type,x,y,w:U,h:6*U,hits,colorSlot:0,roomId:0,phase:0}];
  const race=new Race(map,2);race.select(1);race.start();
  Body.setPosition(race.cubes[0].body,{x:x-2*U,y});Body.setVelocity(race.cubes[0].body,{x:BASE_SPEED,y:0});
  Body.setPosition(race.cubes[1].body,{x:map.start.x-3*U,y:map.start.y+3*U});Body.setVelocity(race.cubes[1].body,{x:0,y:0});
  return race;
}
const itemOf=race=>race.mechanisms.items.find(m=>m.id==='saved-barrier');
const savedRace=race=>unpack(JSON.parse(JSON.stringify(pack(freshProfile(),race.snapshot())))).race;
function raceStrike(race){const item=itemOf(race),cube=race.cubes[0];Body.setPosition(cube.body,{x:item.x-2*U,y:item.y});Body.setVelocity(cube.body,{x:BASE_SPEED,y:0});for(let i=0;i<60;i++){race.step();if(cube.body.velocity.x<-.1)return;}assert.fail('The race integration must physically bounce the cube');}
function raceSeparate(race){const item=itemOf(race),cube=race.cubes[0];Body.setPosition(cube.body,{x:item.x-4*U,y:item.y});Body.setVelocity(cube.body,{x:0,y:0});for(let i=0;i<3;i++)race.step();}

test('Race JSON restore keeps partial wall damage, bound color and destroyed state without ghost colliders',()=>{
  const original=raceFixture();let restored,brokenRestore;
  try{
    raceStrike(original);assert.equal(itemOf(original).remainingHits,2);
    const saved=savedRace(original),differentPalette=COLORS.map(()=> '#010101');
    restored=new Race(saved.map,saved.count,differentPalette,null,saved);
    assert.ok(restored.paused);assert.equal(itemOf(restored).remainingHits,2);assert.equal(itemOf(restored).damageColor,itemOf(original).damageColor);assert.equal(restored.cubes[0].color,original.cubes[0].color);
    assert.ok(Composite.allBodies(restored.physics.engine.world).includes(itemOf(restored).body));
    restored.paused=false;raceSeparate(restored);raceStrike(restored);assert.equal(itemOf(restored).remainingHits,1);raceSeparate(restored);raceStrike(restored);assert.ok(itemOf(restored).removed);assert.equal(itemOf(restored).remainingHits,0);
    const broken=savedRace(restored);brokenRestore=new Race(broken.map,broken.count,undefined,null,broken);
    assert.ok(itemOf(brokenRestore).removed);assert.equal(itemOf(brokenRestore).remainingHits,0);assert.ok(!Composite.allBodies(brokenRestore.physics.engine.world).includes(itemOf(brokenRestore).body));
  }finally{original.destroy();restored?.destroy();brokenRestore?.destroy();}
});

test('Restoring a saved active wall contact does not charge another hit in the fresh Matter engine',()=>{
  const original=raceFixture();let restored;
  try{
    raceStrike(original);const item=itemOf(original),cube=original.cubes[0];assert.equal(item.remainingHits,2);
    // Save while the existing contact is under inward pressure. Merely observing
    // the restored outgoing bounce would not expose a missing contact snapshot.
    Body.setPosition(cube.body,{x:item.x-U+.1,y:item.y});Body.setVelocity(cube.body,{x:.25,y:0});
    const saved=savedRace(original);assert.ok(saved.mechanisms.breakables.contacts.length>0,'Active contacts must be represented in the snapshot');
    restored=new Race(saved.map,saved.count,undefined,null,saved);restored.paused=false;restored.step();
    assert.equal(itemOf(restored).remainingHits,2,'Recreated collision pairs are not fresh user impacts');
    raceSeparate(restored);raceStrike(restored);assert.equal(itemOf(restored).remainingHits,1,'A genuine new encounter after separation still counts');
  }finally{original.destroy();restored?.destroy();}
});

test('The pursuit front consumes every breakable type and removes all of their physical bodies',()=>{
  const map=generateMap('pursuit-breakable-fixture','small'),room=map.rooms[0],y=map.start.y;
  map.mechanisms=types.map((type,i)=>({id:`absorbed-${i}`,type,x:room.wx+(2+i*2)*U,y,w:U,h:type.endsWith('-wall')?3*U:U,hits:3,colorSlot:0,roomId:0,phase:0}));
  const race=new Race(map,2);
  try{
    const bodies=race.mechanisms.items.map(m=>m.body);assert.ok(bodies.every(Boolean));
    race.mechanisms.update(SIZES.small.wall+room.wallStart+room.wallLength/32+1,0);
    assert.ok(race.mechanisms.items.every(m=>m.removed));
    const world=Composite.allBodies(race.physics.engine.world);for(const body of bodies){assert.ok(!world.includes(body));assert.ok(!race.physics.moving.includes(body));}
  }finally{race.destroy();}
});
