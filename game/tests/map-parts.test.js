import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,instantiateModule,parseTileGrid} from '../src/modules.js';
import {generateMap,validateMap,roomAt,updateNavigation} from '../src/map.js';
import {U,ROOM,GENERATOR_VERSION} from '../src/config.js';
const key=(x,y)=>`${x},${y}`;
function floorCells(map){const cells=new Map();for(const f of map.floors)for(let y=Math.round(f.y/U);y<Math.round((f.y+f.h)/U);y++)for(let x=Math.round(f.x/U);x<Math.round((f.x+f.w)/U);x++){assert.ok(!cells.has(key(x,y)),'walkable rectangles must not overlap');cells.set(key(x,y),f.roomId);}return cells;}
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('Authored pieces retain their geometry, area and canonical port widths through rotations',()=>{
  for(const source of MODULES)for(let rotation=0;rotation<4;rotation++){
    const geometry=parseTileGrid(source.grid),module=instantiateModule(source.id,rotation);assert.equal(module.w,rotation%2?geometry.h:geometry.w);assert.equal(module.h,rotation%2?geometry.w:geometry.h);
    assert.equal(module.floors.reduce((sum,f)=>sum+f.w*f.h,0),geometry.airTiles.length);
    for(const p of module.ports){assert.equal(p.width,source.ports.find(original=>original.id===p.id).width);assert.equal(Math.abs(p.direction.x)+Math.abs(p.direction.y),1);assert.ok(p.x===0||p.y===0||p.x===module.w||p.y===module.h);}
  }
});

test('Variable-size pieces form real corridors with turns, junctions, bypasses and dead ends',()=>{
  const kinds=new Set(),dimensions=new Set();
  for(const size of ['small','medium','large'])for(let i=0;i<8;i++){
    const map=generateMap(`parts-${i}`,size);assert.equal(map.generatorVersion,GENERATOR_VERSION);assert.ok(validateMap(map));
    assert.equal(map.rooms[0].kind,'start');assert.equal(map.rooms[map.finish.roomId].kind,'finish');
    for(const p of map.rooms){kinds.add(p.kind);dimensions.add(`${p.width}:${p.height}`);assert.equal(p.width,p.w*U);assert.equal(p.height,p.h*U);}
    assert.ok(new Set(map.rooms.map(p=>`${p.width}:${p.height}`)).size>=3);
    assert.ok(map.rooms.some(p=>p.kind==='bypass'));assert.ok(map.rooms.some(p=>p.kind==='deadend'));
  }
  for(const kind of ['start','straight','turn','junction','bypass','deadend','finish'])assert.ok(kinds.has(kind));
  assert.ok(dimensions.size>10);
});

test('Every floor tile is connected to start; walls do not intrude and the finish is reachable',()=>{
  for(const size of ['small','medium','large'])for(let i=0;i<8;i++){
    const map=generateMap(`geometry-${i}`,size),cells=floorCells(map),initial={x:Math.floor(map.start.x/U),y:Math.floor(map.start.y/U)},queue=[initial],seen=new Set([key(initial.x,initial.y)]);
    for(let j=0;j<queue.length;j++)for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){const next={x:queue[j].x+d.x,y:queue[j].y+d.y},k=key(next.x,next.y);if(cells.has(k)&&!seen.has(k)){seen.add(k);queue.push(next);}}
    assert.equal(seen.size,cells.size);assert.ok(seen.has(key(Math.floor((map.finish.x+map.finish.w/2)/U),Math.floor((map.finish.y+map.finish.h/2)/U))));
    for(const wall of map.walls){const bounds={x:wall.x-wall.w/2,y:wall.y-wall.h/2,w:wall.w,h:wall.h};assert.ok(!map.floors.some(f=>overlap(bounds,f)));}
    assert.ok(map.walls.length<1000);
  }
});

test('Sweeps cover the authored shape only and change direction along turns and ring paths',()=>{
  for(const size of ['small','medium','large'])for(let i=0;i<5;i++)for(const part of generateMap(`sweeps-${i}`,size).rooms){
    assert.equal(part.sweeps.length,part.floors.length);
    for(const [i,s]of part.sweeps.entries()){
      const f=part.floors[i];assert.equal(s.x,f.x);assert.equal(s.y,f.y);assert.equal(s.w,f.w);assert.equal(s.h,f.h);assert.equal(Math.abs(s.dx)+Math.abs(s.dy),1);assert.equal(s.length,s.dx?s.w:s.h);assert.ok(s.startOffset>=0);
      if(s.next!==null)assert.equal(s.startOffset+s.length,part.sweeps[s.next].startOffset);
    }
    assert.equal(part.wallLength,Math.max(...part.sweeps.map(s=>s.startOffset+s.length)));
    if(part.kind==='turn'){
      assert.ok(part.sweeps.some(s=>Math.abs(s.dx)===1)&&part.sweeps.some(s=>Math.abs(s.dy)===1));
      const terminal=part.sweeps.find(s=>s.next===null);assert.equal(terminal.dx,part.exit.x);assert.equal(terminal.dy,part.exit.y);
    }
    if(part.kind==='deadend'){
      const terminal=part.sweeps.findIndex(s=>s.next===null);assert.equal(part.sweeps[terminal].dx,part.exit.x);assert.equal(part.sweeps[terminal].dy,part.exit.y);
      for(let at=0;at<part.sweeps.length;at++){
        const visited=new Set();let next=at;
        while(part.sweeps[next].next!==null){
          assert.equal(visited.has(next),false);visited.add(next);const current=part.sweeps[next],target=part.sweeps[current.next];
          const verticalEdge=(current.x+current.w===target.x||target.x+target.w===current.x)&&Math.min(current.y+current.h,target.y+target.h)>Math.max(current.y,target.y);
          const horizontalEdge=(current.y+current.h===target.y||target.y+target.h===current.y)&&Math.min(current.x+current.w,target.x+target.w)>Math.max(current.x,target.x);
          assert.ok(verticalEdge||horizontalEdge,'Each dead-end strip must advance through an adjacent floor region');next=current.next;
        }
        assert.equal(next,terminal);
      }
    }
  }
});

test('Start grid and ×2 finish have real clearance, and portals avoid central physical mechanisms',()=>{
  for(let i=0;i<30;i++){
    const map=generateMap(`clearance-${i}`,'medium'),start=map.rooms[0];assert.ok(start.width>=7*U&&start.height>=6*U);assert.ok(map.finish.w>2*U&&map.finish.h>2*U);
    for(const m of map.mechanisms)if(m.type==='portal'){
      assert.equal(roomAt(map,{x:m.x,y:m.y})?.id,m.roomId);
      for(const other of map.mechanisms.filter(o=>o.roomId===m.roomId&&['spinner','bumper','press'].includes(o.type)))assert.ok(Math.hypot(other.x-m.x,other.y-m.y)>=3*U);
    }
  }
});

test('Legacy room maps still validate and use their original dimensions for hit testing',()=>{
  const map={generatorVersion:1,rooms:[{id:0,x:0,y:0,wx:0,wy:0,links:[1]},{id:1,x:1,y:0,wx:ROOM.w*U,wy:0,links:[0]}],finish:{roomId:1}};
  assert.ok(validateMap(map));assert.equal(roomAt(map,{x:U,y:U}).id,0);assert.equal(roomAt(map,{x:ROOM.w*U+U,y:U}).id,1);
});

test('Navigation distances account for the actual scale of pieces and portal shortcuts',()=>{
  for(let i=0;i<10;i++){const map=generateMap(`navigation-${i}`,'large'),portals=map.mechanisms.filter(m=>m.type==='portal');if(!portals.length)continue;
    const withPortals=map.rooms.map(p=>p.navigationDistance);map.mechanisms=map.mechanisms.filter(m=>m.type!=='portal');updateNavigation(map);assert.ok(map.rooms.every((p,index)=>p.navigationDistance>=withPortals[index]));assert.ok(map.rooms.some((p,index)=>p.navigationDistance>withPortals[index]));
  }
});
