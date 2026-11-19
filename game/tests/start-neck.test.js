import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,createPartPreview,validateMap} from '../src/map.js';
import {createPartDraft} from '../src/part-library.js';
import {DEFAULT_PORT_WIDTH} from '../src/modules.js';
import {Race} from '../src/race.js';
import {U,SIZES} from '../src/config.js';

const widths=[1,3,5,6,12,32];
function part(width,side='W'){
  const horizontal=side==='W'||side==='E',w=horizontal?8:Math.max(4,width),h=horizontal?Math.max(4,width):8,offset=Math.floor(((horizontal?h:w)-width)/2);
  const entry=horizontal?{x:side==='W'?0:w-1,y:offset,side,width}:{x:offset,y:side==='N'?0:h-1,side,width};
  const exit=horizontal?{x:side==='W'?w-1:0,y:offset,side:side==='W'?'E':'W',width}:{x:offset,y:side==='N'?h-1:0,side:side==='N'?'S':'N',width};
  const wallStart=horizontal?{x:entry.x,y:offset+Math.floor(width/2),direction:side==='W'?'E':'W'}:{x:offset+Math.floor(width/2),y:entry.y,direction:side==='N'?'S':'N'};
  return{...createPartDraft(w,h),id:`neck-${width}-${side}`,name:`Горловина ${width} ${side}`,grid:Array(h).fill('б'.repeat(w)),entry,exit,wallStart};
}
function assertNeck(map,width){
  assert.equal(validateMap(map),true);const start=map.rooms[0],{chamber,neck}=map.start,port=start.ports.find(p=>p.id==='out'),peer=map.rooms[port.link].ports.find(p=>p.link===start.id);
  assert.deepEqual(start.chamber,chamber);assert.deepEqual(start.neck,neck);assert.equal(chamber.w,14*U);assert.equal(chamber.h,Math.max(10,width+2)*U);
  assert.equal(neck.x,chamber.x+chamber.w);assert.equal(neck.w,3*U);assert.equal(neck.h,width*U);assert.equal(port.x,neck.x+neck.w);assert.equal(port.y,neck.y+neck.h/2);
  assert.equal(port.width,width*U);assert.equal(peer.width,width*U);assert.equal(port.connection.width,width*U);assert.deepEqual(port.connection,peer.connection);
  assert.equal(map.start.x,chamber.x+7*U);assert.equal(map.start.y,chamber.y+chamber.h/2);assert.equal(start.width,17*U);
  const top=Math.round((neck.y-start.wy)/U);
  for(let y=0;y<start.h;y++)for(let x=0;x<17;x++){
    const expected=x<14||(y>=top&&y<top+width)?'б':'а';assert.equal(start.grid[y][x],expected);
    const point={x:start.wx+(x+.5)*U,y:start.wy+(y+.5)*U},air=start.floors.some(f=>point.x>f.x&&point.x<f.x+f.w&&point.y>f.y&&point.y<f.y+f.h);
    assert.equal(air,expected==='б');
    if(expected==='а')assert.ok(map.wallTiles.some(t=>t.x===point.x&&t.y===point.y),'Unused neck cells must be physical wall tiles');
  }
}

test('The ordinary start has a three-cell neck inside the same counted section',()=>{
  for(const size of ['small','medium','large'])for(let seed=0;seed<3;seed++){
    const map=generateMap(`ordinary-neck-${seed}`,size);assertNeck(map,DEFAULT_PORT_WIDTH);assert.ok(map.rooms.length>=SIZES[size].min&&map.rooms.length<=SIZES[size].max);
  }
});

test('Every first authored entrance determines the exact neck width in generated maps and previews',()=>{
  for(const width of widths){
    const draft=part(width),preview=createPartPreview(draft);assert.equal(preview.rooms.length,3);assertNeck(preview,width);
    for(const size of ['small','medium','large']){
      const map=generateMap(`authored-neck-${width}`,size,[draft]);assertNeck(map,width);assert.equal(map.rooms[1].module,`custom:${draft.id}`);
      assert.ok(map.rooms.length>=SIZES[size].min&&map.rooms.length<=SIZES[size].max);
    }
  }
});

test('Neck selection is seeded before placement and remains exact for rotated first sections',()=>{
  const library=widths.map(width=>part(width)),observed=new Set();
  for(let seed=0;seed<16;seed++){
    const map=generateMap(`neck-selection-${seed}`,'small',library),first=map.rooms[1],width=first.ports.find(p=>p.id==='in').width/U;observed.add(width);assertNeck(map,width);
    assert.deepEqual(map,generateMap(`neck-selection-${seed}`,'small',library.slice().reverse()));
  }
  assert.ok(observed.size>1);
  for(const side of ['N','E','S','W'])for(const width of [1,5,32]){
    const draft=part(width,side),map=createPartPreview(draft);assertNeck(map,width);assert.equal(map.rooms[1].rotation,{N:3,E:2,S:1,W:0}[side]);
  }
});

test('All twelve participants spawn wholly inside the original chamber with clear static geometry',()=>{
  for(const width of widths){
    const map=createPartPreview(part(width)),race=new Race(map,12);
    try{
      const chamber=map.start.chamber;
      for(const cube of race.cubes){const p=cube.body.position;assert.ok(p.x-U/2>=chamber.x&&p.x+U/2<=chamber.x+chamber.w);assert.ok(p.y-U/2>=chamber.y&&p.y+U/2<=chamber.y+chamber.h);assert.equal(race.physics.canPlace(cube,p),true);}
      for(let i=0;i<race.cubes.length;i++)for(let j=i+1;j<race.cubes.length;j++)assert.ok(Math.abs(race.cubes[i].body.position.x-race.cubes[j].body.position.x)>=U||Math.abs(race.cubes[i].body.position.y-race.cubes[j].body.position.y)>=U);
    }finally{race.destroy();}
  }
});
