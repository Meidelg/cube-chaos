import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,DEFAULT_PORT_WIDTH,instantiateModule,parseTileGrid,rotatePoint} from '../src/modules.js';
import {buildWallGeometry} from '../src/map.js';
import {U} from '../src/config.js';

const expectedSizes={start:[14,10],'straight-8-6':[8,6],'straight-12-6':[12,6],'straight-18-6':[18,6],'straight-24-6':[24,6],'straight-10-8':[10,8],'straight-16-8':[16,8],slalom:[16,10],'turn-tight':[12,12],'turn-long':[18,14],junction:[18,14],bypass:[28,18],'bypass-long':[34,20],'dead-end-short':[8,6],'dead-end-long':[13,6],finish:[14,10]};
const cellsOfPort=(port,w,h)=>{
  const horizontal=port.direction.x!==0,start=(horizontal?port.y:port.x)-port.width/2;
  return Array.from({length:port.width},(_,i)=>({x:horizontal?(port.direction.x<0?0:w-1):start+i,y:horizontal?start+i:(port.direction.y<0?0:h-1)}));
};

test('All built-in ports contain exactly five physical air cells in all four rotations',()=>{
  assert.equal(DEFAULT_PORT_WIDTH,5);assert.equal(MODULES.length,Object.keys(expectedSizes).length);
  for(const source of MODULES)for(let turns=0;turns<4;turns++){
    const m=instantiateModule(source,turns),[originalW,originalH]=expectedSizes[source.id];
    assert.equal(m.w,turns%2?originalH:originalW);assert.equal(m.h,turns%2?originalW:originalH);
    for(const port of m.ports){
      assert.equal(port.width,5);const horizontal=port.direction.x!==0,axis=horizontal?port.y:port.x;assert.equal(axis%1,.5);assert.equal(Number.isInteger(axis-port.width/2),true);
      const opening=cellsOfPort(port,m.w,m.h);for(const cell of opening)assert.equal(m.grid[cell.y][cell.x],'б');
      const sideAir=[];for(let i=0;i<(horizontal?m.h:m.w);i++){const x=horizontal?(port.direction.x<0?0:m.w-1):i,y=horizontal?i:(port.direction.y<0?0:m.h-1);if(m.grid[y][x]==='б')sideAir.push({x,y});}
      assert.deepEqual(sideAir,opening,`${source.id} rotation${turns} ${port.id}: no sixth boundary cell may stay open`);
    }
  }
});

test('Every discarded old sixth port cell is an authored wall and a real merged collider after rotation',()=>{
  for(const source of MODULES){
    const original=parseTileGrid(source.grid);
    for(let turns=0;turns<4;turns++){
      const m=instantiateModule(source,turns),floors=m.floors.map(f=>({x:f.x*U,y:f.y*U,w:f.w*U,h:f.h*U,roomId:0})),authored=m.wallTiles.map(t=>({x:(t.x+.5)*U,y:(t.y+.5)*U,w:U,h:U,roomId:0})),geometry=buildWallGeometry(floors,authored);
      for(const port of source.ports){
        const horizontal=port.direction.x!==0,discarded=(horizontal?port.y:port.x)-port.width/2+port.width;
        const x=horizontal?(port.direction.x<0?0:original.w-1):discarded,y=horizontal?discarded:(port.direction.y<0?0:original.h-1),center=rotatePoint(x+.5,y+.5,turns,original.w,original.h),cx=Math.floor(center.x),cy=Math.floor(center.y);
        assert.equal(m.grid[cy][cx],'а');assert.ok(m.wallTiles.some(t=>t.x===cx&&t.y===cy));
        assert.ok(geometry.walls.some(w=>center.x*U>w.x-w.w/2&&center.x*U<w.x+w.w/2&&center.y*U>w.y-w.h/2&&center.y*U<w.y+w.h/2));
        assert.equal(floors.some(f=>center.x*U>f.x&&center.x*U<f.x+f.w&&center.y*U>f.y&&center.y*U<f.y+f.h),false);
      }
    }
  }
});

test('Closing port edges preserves every connected air tile and the enlarged-cube finish clearance',()=>{
  for(const source of MODULES)for(let turns=0;turns<4;turns++){
    const m=instantiateModule(source,turns),initial=cellsOfPort(m.ports[0],m.w,m.h)[0],queue=[initial],seen=new Set([`${initial.x},${initial.y}`]);
    for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=queue[i].x+dx,y=queue[i].y+dy,key=`${x},${y}`;if(m.grid[y]?.[x]==='б'&&!seen.has(key)){seen.add(key);queue.push({x,y});}}
    assert.equal(seen.size,m.airTiles.length,`${source.id} rotation${turns}: all authored air must remain connected`);
    for(const p of m.ports)for(const cell of cellsOfPort(p,m.w,m.h))assert.ok(seen.has(`${cell.x},${cell.y}`));
    if(m.finish){const f=m.finish;assert.ok(f.w>2&&f.h>2);for(let y=Math.floor(f.y);y<Math.ceil(f.y+f.h);y++)for(let x=Math.floor(f.x);x<Math.ceil(f.x+f.w);x++)assert.equal(m.grid[y][x],'б');}
  }
});

test('An authored custom six-cell entrance keeps its own geometry and width',()=>{
  const custom={id:'custom-even-port',kind:'custom',grid:Array(6).fill('б'.repeat(8)),ports:[{id:'in',x:0,y:3,width:6,direction:{x:-1,y:0}},{id:'out',x:8,y:3,width:6,direction:{x:1,y:0}}]},before=JSON.stringify(custom);
  for(let turn=0;turn<4;turn++){const m=instantiateModule(custom,turn);assert.ok(m.ports.every(p=>p.width===6));assert.equal(m.wallTiles.length,0);}
  assert.equal(JSON.stringify(custom),before);
});
