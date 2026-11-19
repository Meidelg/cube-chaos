import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,DEFAULT_PORT_WIDTH,parseTileGrid} from '../src/modules.js';
import {generateMap,buildWallGeometry,makeSweeps} from '../src/map.js';
import {validatePartDraft} from '../src/part-library.js';
import {Physics,Body} from '../src/physics.js';
import {Race} from '../src/race.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {hash} from '../src/random.js';
import {U,BASE_SPEED,STEP} from '../src/config.js';

const json=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
function corridor(width){
  return{id:`odd-library-${width}`,name:`Прямая ${width}`,enabled:true,grid:['а'.repeat(5),...Array(width).fill('б'.repeat(5)),'а'.repeat(5)],entry:{x:0,y:1,side:'W',width},exit:{x:4,y:1,side:'E',width},wallStart:{x:0,y:1+Math.floor(width/2),direction:'E'},objects:[]};
}
function assertConnectedTerrain(map){
  const cells=new Set();for(const f of map.floors)for(let y=Math.round(f.y/U);y<Math.round((f.y+f.h)/U);y++)for(let x=Math.round(f.x/U);x<Math.round((f.x+f.w)/U);x++)cells.add(`${x},${y}`);
  const initial={x:Math.floor(map.start.x/U),y:Math.floor(map.start.y/U)},queue=[initial],seen=new Set([`${initial.x},${initial.y}`]);
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=queue[i].x+dx,y=queue[i].y+dy,key=`${x},${y}`;if(cells.has(key)&&!seen.has(key)){seen.add(key);queue.push({x,y});}}
  assert.equal(seen.size,cells.size,'Every actual floor tile must connect to the start');
  assert.ok(seen.has(`${Math.floor((map.finish.x+map.finish.w/2)/U)},${Math.floor((map.finish.y+map.finish.h/2)/U)}`));
}
function physicalBounds(body){return{min:{x:Math.min(...body.vertices.map(v=>v.x)),y:Math.min(...body.vertices.map(v=>v.y))},max:{x:Math.max(...body.vertices.map(v=>v.x)),y:Math.max(...body.vertices.map(v=>v.y))}};}

test('Odd ports integration: every built-in opening and every generated stock opening is exactly five unit cells',()=>{
  assert.equal(DEFAULT_PORT_WIDTH,5);
  for(const source of MODULES)for(const port of source.ports){assert.equal(port.width,5,`${source.id}:${port.id}`);assert.equal(port.width%2,1);}
  for(const size of ['small','medium','large'])for(let seed=0;seed<20;seed++){
    const map=generateMap(`odd-stock-${seed}`,size);
    assert.equal(map.start.neck.h,5*U);assert.equal(map.start.neck.w,3*U);
    for(const room of map.rooms)for(const port of room.ports){
      assert.equal(port.width,5*U,`${room.module}:${port.id}`);assert.equal((port.width/U)%2,1);
      if(port.link!==null){assert.equal((port.connection||port).width,5*U);assert.equal(((port.connection||port).width/U)%2,1);}
    }
    assertConnectedTerrain(map);
  }
});

test('Odd ports integration: authored three/five-cell entrances mix with stock five-cell sections and reproduce their seeds',()=>{
  const library=[corridor(3),corridor(5)],before=json(library),seen=new Set();
  for(const size of ['small','medium','large'])for(let seed=0;seed<4;seed++){
    const map=generateMap(`odd-mixed-${seed}`,size,library);assert.deepEqual(map,generateMap(`odd-mixed-${seed}`,size,json(library)));
    const first=map.rooms[1],entry=first.ports.find(port=>port.link===0);seen.add(entry.width/U);
    assert.ok([3,5].includes(entry.width/U));assert.equal(map.start.neck.h,entry.width);assert.equal(map.start.neck.w,3*U);
    for(const room of map.rooms)for(const port of room.ports){assert.equal((port.width/U)%2,1);if(port.link!==null)assert.equal(((port.connection||port).width/U)%2,1);}
    assertConnectedTerrain(map);
  }
  assert.deepEqual([...seen].sort(),[3,5]);assert.deepEqual(library,before);
});

test('Odd ports integration: the stock five-cell neck physically passes and reflects a full-size cube',()=>{
  const map=generateMap('odd-neck-physical','small'),neck=map.start.neck;
  assert.equal(neck.h,5*U);assert.equal(neck.w,3*U);
  for(const bounce of [false,true]){
    const physics=new Physics(map),component=BASE_SPEED/Math.sqrt(2);
    const cube=physics.addCube(1,bounce?neck.x+U/2:neck.x-U,bounce?neck.y+1.5*U:neck.y+neck.h/2,'#6078ed',bounce?{x:component,y:-component}:{x:BASE_SPEED,y:0});
    try{
      let verified=false;
      for(let tick=1;tick<=180;tick++){
        physics.normalize(cube,tick*STEP/1000);physics.step();const bounds=physicalBounds(cube.body);
        near(bounds.max.x-bounds.min.x,U);near(bounds.max.y-bounds.min.y,U);assert.equal(cube.size,1);assert.equal(cube.body.angle,0);
        if(bounce&&cube.body.velocity.y>.1){assert.ok(cube.body.velocity.x>0);near(Math.hypot(cube.body.velocity.x,cube.body.velocity.y),BASE_SPEED);verified=true;break;}
        if(!bounce&&bounds.min.x>neck.x+neck.w){verified=true;break;}
      }
      assert.equal(verified,true,bounce?'The real upper neck wall must reflect the cube':'The real neck opening must pass the cube');
    }finally{physics.destroy();}
  }
});

test('Odd ports integration: changing built-ins leaves six-cell authored parts valid and unmodified',()=>{
  const custom=corridor(6),before=json(custom);assert.equal(validatePartDraft(custom).valid,true);
  const map=generateMap('custom-six-remains-supported','medium',[custom]),first=map.rooms[1],entry=first.ports.find(port=>port.link===0);
  assert.equal(entry.width,6*U);assert.equal(map.start.neck.h,6*U);
  assert.equal(map.rooms[0].ports[0].width,6*U);assert.equal(map.rooms[0].ports[0].connection.width,6*U);
  for(const room of map.rooms)if(!['start','custom'].includes(room.kind))for(const port of room.ports)assert.equal(port.width,5*U);
  assert.deepEqual(custom,before);assertConnectedTerrain(map);
});

// A literal gen8 save uses the former six-cell built-in source grids. It must
// not look up these unchanged module IDs in the new five-cell library on load.
function legacyGen8Map(){
  const grids=[Array.from({length:10},(_,y)=>'б'.repeat(14)+(y>=2&&y<8?'б':'а').repeat(3)),Array(6).fill('б'.repeat(8)),[
    'ааааббббббббб','ааааббббббббб','ббббббббббббб','ббббббббббббб','ббббббббббббб','ббббббббббббб','ббббббббббббб','ббббббббббббб','ааааббббббббб','ааааббббббббб',
  ]],placements=[{x:1,y:1},{x:18,y:3},{x:26,y:1}],ids=['start-neck-6','straight-8-6','finish'];
  const finish={x:36*U,y:3*U,w:3*U,h:6*U,roomId:2},floors=[],tiles=[];
  const rooms=grids.map((grid,id)=>{
    const geometry=parseTileGrid(grid),at=placements[id],worldFloors=geometry.floors.map(f=>({x:(at.x+f.x)*U,y:(at.y+f.y)*U,w:f.w*U,h:f.h*U,roomId:id}));floors.push(...worldFloors);
    tiles.push(...geometry.wallTiles.map(t=>({x:(at.x+t.x+.5)*U,y:(at.y+t.y+.5)*U,w:U,h:U,roomId:id,authored:true})));
    const ports=[];if(id)ports.push({id:'in',x:at.x*U,y:6*U,width:6*U,direction:{x:-1,y:0},link:id-1,connection:{x:at.x*U,y:6*U,width:6*U}});
    if(id<2){const x=(at.x+geometry.w)*U;ports.push({id:'out',x,y:6*U,width:6*U,direction:{x:1,y:0},link:id+1,connection:{x,y:6*U,width:6*U}});}
    return{id,module:ids[id],kind:id===0?'start':id===2?'finish':'straight',rotation:0,label:ids[id],grid,x:at.x,y:at.y,wx:at.x*U,wy:at.y*U,w:geometry.w,h:geometry.h,width:geometry.w*U,height:geometry.h*U,links:[...(id?[id-1]:[]),...(id<2?[id+1]:[])],ports,floors:worldFloors,areas:worldFloors,next:id<2?id+1:null,exit:{x:1,y:0},distance:2-id,navigationDistance:(2-id)*14*U,...(id===2?{finish}:{})};
  });
  rooms[0].chamber={x:U,y:U,w:14*U,h:10*U};rooms[0].neck={x:15*U,y:3*U,w:3*U,h:6*U};
  for(const room of rooms){const target=room.next===null?{x:finish.x+finish.w/2,y:finish.y+finish.h/2}:room.ports.find(port=>port.id==='out');room.sweeps=makeSweeps(room,target);room.wallLength=Math.max(...room.sweeps.map(s=>s.startOffset+s.length));}
  let delay=0;for(const room of rooms){room.wallStart=delay;delay+=room.wallLength/32;}
  const geometry=buildWallGeometry(floors,tiles);
  return{seed:'GEN8-SIX-CELL-SAVED-LAYOUT',size:'small',generatorVersion:8,moduleLibraryHash:'00000000',rooms,floors,walls:geometry.walls,wallTiles:geometry.wallTiles,mechanisms:[],start:{x:8*U,y:6*U,chamber:{...rooms[0].chamber},neck:{...rooms[0].neck}},finish,width:40*U,height:12*U};
}
function frontState(race){return race.mechanisms.fronts.map(front=>({roomId:front.roomId,active:front.active,amount:front.amount,bounds:front.body?physicalBounds(front.body):null}));}
test('Odd ports integration: a gen8 six-cell snapshot restores its actual geometry, neck and active wall unchanged',()=>{
  const original=new Race(legacyGen8Map(),6);let restored;original.select(2);original.start();
  try{
    original.ticks=1920;original.mechanisms.update(original.time,0);Body.setVelocity(original.cubes[0].body,{x:1.1,y:-2.2});Body.setVelocity(original.cubes[1].body,{x:0,y:0});
    const profile=freshProfile();profile.coins=640;profile.owned=['comet'];profile.partLibrary=[corridor(6)];
    const data=pack(profile,original.snapshot());data.gameVersion='0.8.0';const{checksum,...payload}=data;data.checksum=hash(JSON.stringify(payload)).toString(16);
    const saved=unpack(json(data));restored=new Race(saved.race.map,saved.race.count,undefined,null,saved.race);
    assert.equal(restored.map.generatorVersion,8);assert.deepEqual(restored.map,original.map);assert.equal(restored.map.rooms[0].module,'start-neck-6');
    assert.equal(restored.map.start.neck.h,6*U);assert.ok(restored.map.rooms.every(room=>room.ports.every(port=>port.width===6*U)));
    assert.deepEqual(frontState(restored),frontState(original));assert.ok(frontState(restored).some(front=>front.active));
    assert.equal(restored.paused,true);assert.equal(restored.id,original.id);assert.equal(restored.prediction.selected,2);
    near(restored.cubes[0].body.velocity.x,1.1);near(restored.cubes[0].body.velocity.y,-2.2);near(restored.cubes[1].body.velocity.x,0);near(restored.cubes[1].body.velocity.y,0);
    restored.paused=false;restored.step();assert.equal(restored.ticks,1921);
    const rewritten=unpack(json(pack(saved.profile,restored.snapshot())));assert.equal(rewritten.race.map.generatorVersion,8);assert.equal(rewritten.race.map.start.neck.h,6*U);
    assert.equal(rewritten.profile.coins,640);assert.deepEqual(rewritten.profile.owned,['comet']);assert.equal(rewritten.profile.partLibrary[0].entry.width,6);
  }finally{original.destroy();restored?.destroy();}
});
