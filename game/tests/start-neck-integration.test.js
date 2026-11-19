import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartPreview,generateMap,buildWallGeometry} from '../src/map.js';
import {Physics,Body,Query} from '../src/physics.js';
import {Race} from '../src/race.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {hash} from '../src/random.js';
import {U,BASE_SPEED,SIZES,STEP} from '../src/config.js';

const WIDTHS=[1,3,5,6,32],json=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,label='value')=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} differs from ${expected}`);
function part(width){
  const height=Math.max(4,Math.min(32,width+2)),top=Math.floor((height-width)/2);
  return{id:`neck-integration-${width}`,name:`Проход ${width}`,enabled:true,grid:Array.from({length:height},(_,y)=>(y>=top&&y<top+width?'б':'а').repeat(5)),entry:{x:0,y:top,side:'W',width},exit:{x:4,y:top,side:'E',width},wallStart:{x:0,y:top+Math.floor(width/2),direction:'E'},objects:[]};
}
function physicalBounds(body){
  return{min:{x:Math.min(...body.vertices.map(v=>v.x)),y:Math.min(...body.vertices.map(v=>v.y))},max:{x:Math.max(...body.vertices.map(v=>v.x)),y:Math.max(...body.vertices.map(v=>v.y))}};
}

test('Start neck integration: widths 1/3/5/6/32 produce exactly three real air cells of length with solid side walls',()=>{
  for(const width of WIDTHS){
    const map=generateMap(`neck-physical-${width}`,'small',[part(width)]),start=map.rooms[0],{chamber,neck}=start;
    assert.equal(start.kind,'start');assert.equal(start.module,`start-neck-${width}`);
    assert.deepEqual(map.start.chamber,chamber);assert.deepEqual(map.start.neck,neck);
    near(chamber.w,14*U);near(chamber.h,Math.max(10,width+2)*U);
    near(neck.x,chamber.x+14*U);near(neck.w,3*U);near(neck.h,width*U);
    near(map.start.x,chamber.x+7*U);near(map.start.y,chamber.y+chamber.h/2);
    const out=start.ports.find(port=>port.link!==null),first=map.rooms[out.link],entry=first.ports.find(port=>port.link===0);
    near(out.x,neck.x+3*U);near(out.y,neck.y+neck.h/2);near(out.width,width*U);
    assert.deepEqual(out.connection,entry.connection);near(entry.width,width*U);
    assert.ok(map.rooms.length>=SIZES.small.min&&map.rooms.length<=SIZES.small.max,'The neck is part of the start, not an extra counted section');
    const physics=new Physics(map);
    try{
      const solid=point=>Query.point(physics.walls,point).length>0;
      for(let x=0;x<3;x++)for(let y=0;y<width;y++)assert.equal(solid({x:neck.x+(x+.5)*U,y:neck.y+(y+.5)*U}),false,`Width ${width}, neck air cell ${x},${y}`);
      for(let x=0;x<3;x++)for(const y of [neck.y-U/2,neck.y+neck.h+U/2])assert.equal(solid({x:neck.x+(x+.5)*U,y}),true,'The neck sides must contain physical walls');
      for(let y=0;y<chamber.h/U;y++){
        const center=chamber.y+(y+.5)*U;if(center>neck.y&&center<neck.y+neck.h)continue;
        assert.equal(solid({x:chamber.x+14.5*U,y:center}),true,'The start cannot retain a wide unmarked opening beside the neck');
      }
    }finally{physics.destroy();}
  }
});

test('Start neck integration: a real full-size Matter cube travels from the chamber through every neck width',()=>{
  for(const width of WIDTHS){
    const map=createPartPreview(part(width)),neck=map.start.neck,physics=new Physics(map);
    const cube=physics.addCube(1,neck.x-U,neck.y+neck.h/2,'#6078ed',{x:BASE_SPEED,y:0});
    try{
      assert.equal(physics.canPlace(cube,cube.body.position),true);let crossed=false;
      for(let tick=1;tick<=180;tick++){
        physics.normalize(cube,tick*STEP/1000);physics.step();
        const bounds=physicalBounds(cube.body);near(bounds.max.x-bounds.min.x,U);near(bounds.max.y-bounds.min.y,U);
        assert.equal(cube.size,1);assert.equal(cube.body.angle,0);
        if(bounds.min.x>neck.x+neck.w){crossed=true;break;}
      }
      assert.equal(crossed,true,`A one-unit cube must physically traverse the width-${width} neck`);
    }finally{physics.destroy();}
  }
});

test('Start neck integration: all participant counts spawn inside the original chamber center clear of walls',()=>{
  for(const width of WIDTHS){
    const map=createPartPreview(part(width)),chamber=map.start.chamber;
    for(let count=2;count<=12;count++){
      const race=new Race(map,count);
      try{
        near(map.start.x-chamber.x,7*U);
        for(const cube of race.cubes){
          const bounds=physicalBounds(cube.body);
          assert.ok(bounds.min.x>=chamber.x&&bounds.max.x<=chamber.x+chamber.w);
          assert.ok(bounds.min.y>=chamber.y&&bounds.max.y<=chamber.y+chamber.h);
          assert.equal(race.physics.canPlace(cube,cube.body.position),true,`Count ${count}, neck ${width}, cube ${cube.id}`);
          assert.equal(Query.collides(cube.body,race.physics.walls).some(contact=>contact.depth>1e-7),false);
        }
      }finally{race.destroy();}
    }
  }
});

test('Start neck integration: seeded first-part selection reproduces the matching neck without editing the library',()=>{
  const library=WIDTHS.map(part),before=json(library);
  for(const size of ['small','medium','large'])for(let seed=0;seed<3;seed++){
    const map=generateMap(`neck-repeat-${seed}`,size,library),again=generateMap(`neck-repeat-${seed}`,size,json(library));
    assert.deepEqual(map,again);assert.deepEqual(library,before);
    const start=map.rooms[0],first=map.rooms[start.ports[0].link],entry=first.ports.find(port=>port.link===0);
    assert.equal(first.kind,'custom');near(start.neck.h,entry.width);near(start.ports[0].width,entry.width);
    near(start.ports[0].connection.width,entry.width);assert.equal(map.rooms.filter(room=>room.kind==='start').length,1);
  }
});

test('Start neck integration: the real pursuing wall fills the narrow outlet while staying inside its physical sides',()=>{
  for(const width of WIDTHS){
    const map=createPartPreview(part(width)),room=map.rooms[0],neck=room.neck,race=new Race(map,2);
    try{
      const front=race.mechanisms.fronts.find(f=>f.roomId===0&&f.sweep.dx===1&&Math.abs(f.sweep.y-neck.y)<1e-7&&Math.abs(f.sweep.h-neck.h)<1e-7&&f.sweep.x<=neck.x&&f.sweep.x+f.sweep.w>=neck.x+neck.w);
      assert.ok(front,'The neck must be part of an actual horizontal pursuing front');
      const middle=neck.x+1.5*U,elapsed=(front.sweep.startOffset+middle-front.sweep.x)/32;
      const base=SIZES.small.wall+room.wallStart;race.mechanisms.update(base+elapsed,0);
      assert.equal(front.active,true);const bounds=physicalBounds(front.body);
      near(bounds.max.x,middle);near(bounds.min.y,neck.y);near(bounds.max.y,neck.y+neck.h);
      assert.equal(Query.point([front.body],{x:neck.x+U/2,y:neck.y+neck.h/2}).length,1);
      const activeBodies=race.mechanisms.fronts.filter(f=>f.roomId===0&&f.body).map(f=>f.body);
      for(const y of [neck.y-U/2,neck.y+neck.h+U/2])assert.equal(Query.point(activeBodies,{x:middle-U/2,y}).length,0,'Pursuit must not extend into the solid neck sides');
      race.mechanisms.update(base+room.wallLength/32+1,0);
      const completed=race.mechanisms.fronts.filter(f=>f.roomId===0&&f.body).map(f=>f.body);
      for(let x=0;x<3;x++)for(let y=0;y<width;y++)assert.ok(Query.point(completed,{x:neck.x+(x+.5)*U,y:neck.y+(y+.5)*U}).length>0);
    }finally{race.destroy();}
  }
});

// An explicit old gen7 layout: the original 14×10 start with a six-cell
// boundary opening and no chamber/neck metadata, joined to a saved finish.
function legacyGen7Map(){
  const floor=(x,roomId)=>({x:x*U,y:0,w:14*U,h:10*U,roomId}),floors=[floor(0,0),floor(14,1)];
  const finish={x:26*U,y:3*U,w:2*U,h:4*U,roomId:1};
  const rooms=floors.map((f,id)=>({id,module:id?'finish':'start',kind:id?'finish':'start',label:id?'Финиш':'Старт',rotation:0,grid:Array(10).fill('б'.repeat(14)),x:id*14,y:0,wx:f.x,wy:0,w:14,h:10,width:14*U,height:10*U,links:[1-id],ports:[{id:id?'in':'out',x:14*U,y:5*U,width:6*U,direction:{x:id?-1:1,y:0},link:1-id}],floors:[f],areas:[f],next:id?null:1,exit:{x:1,y:0},distance:1-id,navigationDistance:id?0:14*U,wallStart:id*14*U/32,wallLength:14*U,sweeps:[{...f,dx:1,dy:0,length:14*U,startOffset:0,next:null}],...(id?{finish}:{})}));
  const geometry=buildWallGeometry(floors);
  return{seed:'GEN7-SAVED-WITHOUT-NECK',size:'small',generatorVersion:7,rooms,floors,walls:geometry.walls,wallTiles:geometry.wallTiles,mechanisms:[],start:{x:7*U,y:5*U},finish,width:29*U,height:11*U};
}
function wallState(race){return race.mechanisms.fronts.map(front=>({roomId:front.roomId,index:front.index,active:front.active,amount:front.amount,bounds:front.body?physicalBounds(front.body):null}));}
test('Start neck integration: a saved gen7 race restores its original start and active wall without inserting a neck',()=>{
  const original=new Race(legacyGen7Map(),6);let restored;original.select(2);original.start();
  try{
    original.ticks=1920;original.mechanisms.update(original.time,0);
    Body.setVelocity(original.cubes[0].body,{x:1.25,y:-.75});Body.setVelocity(original.cubes[1].body,{x:0,y:0});
    const profile=freshProfile();profile.coins=840;profile.owned=['comet'];profile.partLibrary=[part(32)];
    const data=pack(profile,original.snapshot());data.gameVersion='0.7.0';const{checksum,...payload}=data;data.checksum=hash(JSON.stringify(payload)).toString(16);
    const saved=unpack(json(data));restored=new Race(saved.race.map,saved.race.count,undefined,null,saved.race);
    assert.equal(restored.map.generatorVersion,7);assert.deepEqual(restored.map,original.map);
    assert.equal('neck' in restored.map.start,false);assert.equal('chamber' in restored.map.rooms[0],false);
    assert.deepEqual(restored.map.start,{x:7*U,y:5*U});near(restored.map.rooms[0].width,14*U);
    assert.deepEqual(wallState(restored),wallState(original));assert.equal(wallState(restored).some(front=>front.active),true);
    assert.equal(restored.paused,true);assert.equal(restored.id,original.id);assert.equal(restored.prediction.selected,2);
    near(restored.cubes[0].body.velocity.x,1.25);near(restored.cubes[0].body.velocity.y,-.75);near(restored.cubes[1].body.velocity.x,0);near(restored.cubes[1].body.velocity.y,0);
    restored.paused=false;restored.step();assert.equal(restored.ticks,1921);
    const rewritten=unpack(json(pack(saved.profile,restored.snapshot())));
    assert.equal(rewritten.race.map.generatorVersion,7);assert.equal('neck' in rewritten.race.map.start,false);
    assert.equal(rewritten.profile.coins,840);assert.deepEqual(rewritten.profile.owned,['comet']);
  }finally{original.destroy();restored?.destroy();}
});
