import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartObject,getPartObjectBounds,OBJECT_TYPES} from '../src/part-objects.js';
import {compilePart,validatePartDraft} from '../src/part-library.js';
import {instantiateModule} from '../src/modules.js';
import {createPartPreview,generateMap} from '../src/map.js';
import {Race} from '../src/race.js';
import {Body,Composite} from '../src/physics.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {U,BASE_SPEED,STEP} from '../src/config.js';

const near=(actual,expected,label='value')=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} differs from ${expected}`);
const clone=value=>JSON.parse(JSON.stringify(value));
function object(type,x,y,options={}){return createPartObject(type,{x,y},{id:type,...options});}
function objects(){
  return[
    object('spinner',3,4,{length:3,speed:.75,phase:.3}),
    object('press',10,3,{w:2,h:1,direction:'S',travel:3,period:6,phase:.25}),
    object('bumper',20,4),object('conveyor',3,23,{w:3,h:2,direction:'N'}),
    object('boost',10,23,{w:2,h:2,multiplier:2}),object('slow',16,23,{w:2,h:2,multiplier:.4,duration:2}),
    object('resize',23,23),object('laser',20,14,{end:{x:28,y:14},period:4,on:1.5}),
    object('breakable-color-block',3,14,{colorSlot:1}),object('breakable-block',7,14),
    object('breakable-color-wall',11,14,{h:3,hits:3,colorSlot:1}),object('breakable-wall',15,14,{h:3,hits:3}),
    object('portal',27,3,{id:'portal-a',pair:'portal-b'}),object('portal',27,8,{id:'portal-b',pair:'portal-a'}),
    object('wall-start',4,29,{direction:'E'}),
  ];
}
function draft(side='W',authored=objects()){
  const entry={W:{x:0,y:15},N:{x:15,y:0},E:{x:31,y:15},S:{x:15,y:31}}[side];
  const opposite={W:'E',E:'W',N:'S',S:'N'},exit={W:{x:0,y:15},N:{x:15,y:0},E:{x:31,y:15},S:{x:15,y:31}}[opposite[side]];
  return{id:`authored-${side}`,name:'Механизмы автора',enabled:true,grid:Array(32).fill('б'.repeat(32)),entry:{...entry,side,width:1},exit:{...exit,side:opposite[side],width:1},wallStart:{x:1,y:15,direction:'E'},objects:authored};
}
function rotatePoint(point,turns,w=32,h=32){let{x,y}=point;for(let i=0;i<turns;i++){[x,y]=[h-y,x];[w,h]=[h,w];}return{x,y};}
function rotateDirection(vector,turns){let{x,y}=vector;for(let i=0;i<turns;i++)[x,y]=[-y,x];return{x:x||0,y:y||0};}
function authoredItem(race,id){return race.mechanisms.items.find(item=>item.authored&&item.sourceId===id);}
function putCube(race,id,cube=race.cubes[0],time=0,velocity={x:BASE_SPEED,y:0}){
  const item=authoredItem(race,id);assert.ok(item,`Missing authored object ${id}`);
  Body.setPosition(cube.body,{x:item.x,y:item.y});Body.setVelocity(cube.body,velocity);
  cube.inside=[];cube.conveyor={x:0,y:0};cube.boostUntil=0;cube.boostAmount=0;cube.slowUntil=0;
  race.mechanisms.apply(cube,time);return item;
}
function separate(race,cube=race.cubes[0]){
  Body.setPosition(cube.body,{...race.map.start});Body.setVelocity(cube.body,{x:0,y:0});
  for(let i=0;i<3;i++)race.step();
}
function strike(race,id,cube=race.cubes[0]){
  const item=authoredItem(race,id);assert.ok(item?.body);
  Body.setPosition(cube.body,{x:item.x-2*U,y:item.y});Body.setVelocity(cube.body,{x:BASE_SPEED,y:0});
  cube.inside=[];
  for(let i=0;i<60;i++){race.step();if(cube.body.velocity.x<-.1)return item;}
  assert.fail(`The actual authored ${id} must reflect the incoming cube`);
}

test('Authored mechanisms: real preview assembly rotates and scales every object and physical body in all four orientations',()=>{
  const expectedTurns={W:0,N:3,E:2,S:1},seen=new Set();
  for(const side of ['W','N','E','S']){
    const source=draft(side),before=clone(source),validation=validatePartDraft(source);
    assert.equal(validation.valid,true,validation.errors.join('\n'));
    assert.equal(new Set(source.objects.map(item=>item.type)).size,OBJECT_TYPES.length);
    const local=compilePart(source).mechanisms,map=createPartPreview(source),section=map.rooms.find(part=>part.kind==='custom');
    const race=new Race(map,2),turns=expectedTurns[side];seen.add(section.rotation);
    try{
      assert.equal(section.rotation,turns);assert.equal(map.mechanisms.length,source.objects.length);
      for(const spec of local){
        const actual=authoredItem(race,spec.id),p=rotatePoint(spec,turns),direction=rotateDirection({x:spec.dx,y:spec.dy},turns);
        assert.ok(actual?.authored);assert.equal(actual.roomId,section.id);assert.equal(actual.id,`authored:${section.id}:${spec.id}`);
        near(actual.x,section.wx+p.x*U,`${spec.id} x`);near(actual.y,section.wy+p.y*U,`${spec.id} y`);
        near(actual.w,(turns%2?spec.h:spec.w)*U,`${spec.id} width`);near(actual.h,(turns%2?spec.w:spec.h)*U,`${spec.id} height`);
        assert.equal(actual.dx,direction.x);assert.equal(actual.dy,direction.y);
        for(const field of ['travel','length','period','duration','multiplier','hits','colorSlot'])if(spec[field]!==undefined)assert.equal(actual[field],spec[field]);
        for(const field of ['start','end'])if(spec[field]){const point=rotatePoint(spec[field],turns);near(actual[field].x,section.wx+point.x*U);near(actual[field].y,section.wy+point.y*U);}
        if(spec.emitters)for(let i=0;i<spec.emitters.length;i++){const point=rotatePoint(spec.emitters[i],turns);near(actual.emitters[i].x,section.wx+point.x*U);near(actual.emitters[i].y,section.wy+point.y*U);}
        if(actual.type==='spinner')near(actual.phase,((spec.phase+turns*Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2));
        if(actual.body){
          const initialTravel=actual.type==='press'?(1-Math.cos(actual.phase))*.5*actual.travel*U:0;
          near(actual.body.position.x,actual.x+actual.dx*initialTravel);near(actual.body.position.y,actual.y+actual.dy*initialTravel);
          assert.ok(Composite.allBodies(race.physics.engine.world).includes(actual.body));
        }
      }
      const portal=authoredItem(race,'portal-a'),target=authoredItem(race,'portal-b');assert.equal(portal.pair,target.id);assert.equal(target.pair,portal.id);
      race.mechanisms.update(.5,.5);
      const spinner=authoredItem(race,'spinner'),press=authoredItem(race,'press');
      near(spinner.body.angle,spinner.phase+.5*spinner.speed);
      const displacement=(1-Math.cos(.5*Math.PI*2/press.period+press.phase))*.5*press.travel*U;
      near(press.body.position.x,press.x+press.dx*displacement);near(press.body.position.y,press.y+press.dy*displacement);
      assert.deepEqual(source,before,'Preview must never mutate the editor draft');
    }finally{race.destroy();}
  }
  assert.deepEqual([...seen].sort(),[0,1,2,3]);
});

test('Authored mechanisms: effects, teleports, resize and laser use the real Race mechanisms after generation',()=>{
  const race=new Race(createPartPreview(draft()),2),cube=race.cubes[0];
  try{
    putCube(race,'conveyor',cube,0,{x:BASE_SPEED,y:0});near(cube.body.velocity.x,BASE_SPEED);near(cube.body.velocity.y,-.9);
    const boost=putCube(race,'boost');near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED*boost.multiplier);
    race.mechanisms.apply(cube,.5);near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED*(1+(boost.multiplier-1)*.5));
    race.mechanisms.apply(cube,1);near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED);
    const slow=putCube(race,'slow');near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED*slow.multiplier);
    race.mechanisms.apply(cube,slow.duration+.1);near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED);
    const bumper=putCube(race,'bumper');
    Body.setPosition(cube.body,{x:bumper.x+U/4,y:bumper.y});cube.inside=[];race.mechanisms.apply(cube,0);
    assert.ok(cube.boostUntil>0);near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED*2);
    putCube(race,'portal-a');const portal=authoredItem(race,'portal-b');near(cube.body.position.x,portal.x);near(cube.body.position.y,portal.y);
    race.mechanisms.apply(cube,.1);near(cube.body.position.x,portal.x);near(cube.body.position.y,portal.y);assert.equal(cube.portalUntil,1);
    const resize=putCube(race,'resize');assert.equal(cube.size,2);assert.deepEqual(cube.usedResize,[resize.id]);assert.equal(cube.body.mass,1);
    Body.setPosition(cube.body,{...race.map.start});race.mechanisms.apply(cube,.2);putCube(race,'resize',cube,.3);assert.equal(cube.size,2);
    const victim=race.cubes[1];race.mechanisms.update(.1,.1);putCube(race,'laser',victim,.1);assert.equal(victim.alive,false);assert.equal(victim.reason,'Лазер');
  }finally{race.destroy();}
});

test('Authored mechanisms: all four breakable variants bounce before counting or destroying and obey their authored colors',()=>{
  const race=new Race(createPartPreview(draft()),2);race.select(1);race.start();
  try{
    const cube=race.cubes[0];
    for(const id of ['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall']){
      const item=authoredItem(race,id),maximum=item.remainingHits;
      if(id.includes('-color-')){
        cube.color='#000001';strike(race,id);assert.equal(item.remainingHits,maximum);assert.equal(item.removed,false);separate(race);
        cube.color=item.damageColor;
      }
      strike(race,id);assert.equal(item.remainingHits,maximum-1);assert.ok(cube.body.velocity.x<0);
      if(id.endsWith('-block')){assert.equal(item.removed,true);assert.equal(race.physics.moving.includes(item.body),false);}
      else{assert.equal(item.removed,false);assert.ok(Composite.allBodies(race.physics.engine.world).includes(item.body));}
      separate(race);
    }
  }finally{race.destroy();}
});

test('Authored mechanisms: repeated sections namespace every ID and pair without randomizing authored parameters',()=>{
  const source=draft(),before=clone(source);let map;
  for(let i=0;i<4;i++){map=generateMap(`authored-repeat-${i}`,'medium',[source]);if(map.rooms.filter(part=>part.kind==='custom').length>1)break;}
  const sections=map.rooms.filter(part=>part.kind==='custom');assert.ok(sections.length>1);
  assert.equal(new Set(map.mechanisms.map(item=>item.id)).size,map.mechanisms.length);
  for(const section of sections){
    const items=map.mechanisms.filter(item=>item.roomId===section.id);assert.equal(items.length,source.objects.length);assert.ok(items.every(item=>item.authored));
    for(const item of items){assert.equal(item.id,`authored:${section.id}:${item.sourceId}`);if(item.type==='portal'){const partner=map.mechanisms.find(other=>other.id===item.pair);assert.ok(partner);assert.equal(partner.roomId,section.id);assert.equal(partner.pair,item.id);}}
  }
  assert.deepEqual(source,before);assert.deepEqual(map,generateMap(map.seed,'medium',[clone(source)]));
});

test('Authored mechanisms: seam sealing preserves complete press trajectories, laser emitters/beam and conveyor cells',()=>{
  const source={id:'edge-objects',name:'Объекты у края',enabled:true,grid:Array(10).fill('б'.repeat(12)),entry:{x:0,y:4,side:'W',width:1},exit:{x:11,y:4,side:'E',width:1},wallStart:{x:0,y:4,direction:'E'},objects:[
    object('press',0,1,{direction:'E',travel:11,period:5}),object('conveyor',0,6,{w:12,h:1}),object('laser',0,8,{end:{x:11,y:8}}),
  ]};
  assert.equal(validatePartDraft(source).valid,true);
  for(const seed of ['edge-objects-0','edge-objects-1']){
    const map=generateMap(seed,'medium',[source]);
    for(const section of map.rooms.filter(part=>part.kind==='custom'))for(const local of instantiateModule(compilePart(source),section.rotation).mechanisms){
      const b=getPartObjectBounds(local);
      for(let y=Math.floor(b.y+1e-7);y<Math.ceil(b.y+b.h-1e-7);y++)for(let x=Math.floor(b.x+1e-7);x<Math.ceil(b.x+b.w-1e-7);x++){
        const point={x:section.wx+(x+.5)*U,y:section.wy+(y+.5)*U};
        assert.ok(map.floors.some(f=>point.x>f.x&&point.x<f.x+f.w&&point.y>f.y&&point.y<f.y+f.h),`${local.type} envelope tile ${x},${y} was sealed`);
      }
    }
  }
});

test('Authored mechanisms: JSON restores partial damage, destroyed bodies, portal/resize state and moving mechanism phases',()=>{
  const source=draft(),original=new Race(createPartPreview(source),2);let restored;
  original.select(1);original.start();
  try{
    original.ticks=120;strike(original,'breakable-wall');separate(original);strike(original,'breakable-block');separate(original);
    assert.equal(authoredItem(original,'breakable-wall').remainingHits,2);assert.equal(authoredItem(original,'breakable-block').removed,true);
    putCube(original,'resize',original.cubes[0],original.time);
    putCube(original,'portal-a',original.cubes[1],original.time);
    original.mechanisms.update(original.time,0);
    const profile=freshProfile();profile.coins=840;profile.owned=['comet'];profile.partLibrary=[source];
    const saved=unpack(clone(pack(profile,original.snapshot())));
    restored=new Race(saved.race.map,saved.race.count,undefined,null,saved.race);
    assert.deepEqual(restored.map,original.map);assert.equal(saved.profile.coins,840);assert.deepEqual(saved.profile.owned,['comet']);
    assert.equal(restored.paused,true);assert.equal(restored.prediction.selected,1);assert.equal(restored.ticks,original.ticks);
    assert.equal(authoredItem(restored,'breakable-wall').remainingHits,2);
    const destroyed=authoredItem(restored,'breakable-block');assert.equal(destroyed.removed,true);assert.equal(restored.physics.moving.includes(destroyed.body),false);
    assert.equal(Composite.allBodies(restored.physics.engine.world).includes(destroyed.body),false);
    assert.equal(restored.cubes[0].size,2);assert.deepEqual(restored.cubes[0].usedResize,original.cubes[0].usedResize);
    assert.equal(restored.cubes[1].portalUntil,original.cubes[1].portalUntil);
    for(const id of ['spinner','press']){const expected=authoredItem(original,id).body,actual=authoredItem(restored,id).body;near(actual.position.x,expected.position.x);near(actual.position.y,expected.position.y);near(actual.angle,expected.angle);}
    const before=restored.time;restored.paused=false;restored.step();near(restored.time,before+STEP/1000);assert.equal(authoredItem(restored,'breakable-wall').remainingHits,2);
  }finally{original.destroy();restored?.destroy();}
});
