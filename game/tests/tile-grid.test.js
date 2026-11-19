import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,parseTileGrid,rotateTileGrid,instantiateModule} from '../src/modules.js';
import {generateMap,buildWallGeometry,makeSweeps} from '../src/map.js';
import {Physics,Query} from '../src/physics.js';
import {U} from '../src/config.js';
const sample=['аааа','ббба','ббба','абба'];
const inside=(r,p)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
const coordinate=(x,y)=>`${x},${y}`;

test('The exact user 4×4 pattern parses without adding, removing or replacing any cell',()=>{
  const parsed=parseTileGrid(sample);assert.deepEqual(parsed.grid,sample);assert.equal(parsed.w,4);assert.equal(parsed.h,4);assert.equal(parsed.airTiles.length,8);assert.equal(parsed.wallTiles.length,8);
  assert.deepEqual(parsed.wallTiles,[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:3,y:1},{x:3,y:2},{x:0,y:3},{x:3,y:3}]);
  assert.deepEqual(sample,['аааа','ббба','ббба','абба']);
  const floorCells=[];for(const r of parsed.floors)for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)floorCells.push(coordinate(x,y));
  assert.deepEqual(floorCells.sort(),parsed.airTiles.map(t=>coordinate(t.x,t.y)).sort());
});

test('Tile rotation rotates the actual authored strings and returns to the exact original after four turns',()=>{
  assert.deepEqual(rotateTileGrid(sample),['абба','ббба','ббба','аааа']);assert.deepEqual(rotateTileGrid(sample,4),sample);
  for(const source of MODULES){assert.ok(Array.isArray(source.grid));assert.ok(!Object.hasOwn(source,'floors'));let grid=source.grid;for(let i=0;i<4;i++)grid=rotateTileGrid(grid);assert.deepEqual(grid,source.grid);}
  const custom=instantiateModule({id:'user-example',kind:'example',grid:sample,ports:[]},1);assert.deepEqual(custom.grid,['абба','ббба','ббба','аааа']);
});

test('Invalid rows, unknown characters, and a port blocked by authored walls are rejected',()=>{
  for(const bad of [[],[''],['аа','б'],['ab','ba'],['а б','ббб']])assert.throws(()=>parseTileGrid(bad));
  assert.throws(()=>instantiateModule({id:'blocked',grid:sample,ports:[{id:'out',x:4,y:2,width:2,direction:{x:1,y:0}}]}),/Стена перекрывает порт/);
});

test('All sixteen user cells have exactly the intended physical wall/air meaning at unit scale',()=>{
  const parsed=parseTileGrid(sample),floors=parsed.floors.map(f=>({x:f.x*U,y:f.y*U,w:f.w*U,h:f.h*U,roomId:0})),authored=parsed.wallTiles.map(t=>({x:(t.x+.5)*U,y:(t.y+.5)*U,w:U,h:U,roomId:0,authored:true}));
  const compiled=buildWallGeometry(floors,authored),physics=new Physics({walls:compiled.walls});
  try{for(let y=0;y<4;y++)for(let x=0;x<4;x++)assert.equal(Query.point(physics.walls,{x:(x+.5)*U,y:(y+.5)*U}).length>0,sample[y][x]==='а');
    for(const tile of compiled.wallTiles){assert.equal(tile.w,U);assert.equal(tile.h,U);}
  }finally{physics.destroy();}
});

test('Every authored wall cell, including an internal island, survives placement and reaches map colliders',()=>{
  let sawIsland=false;
  for(let i=0;i<20;i++){
    const map=generateMap(`authored-${i}`,'large'),wallTiles=new Map(map.wallTiles.map(t=>[coordinate(t.x,t.y),t]));
    for(const part of map.rooms){if(part.module==='slalom')sawIsland=true;
      for(let y=0;y<part.grid.length;y++)for(let x=0;x<part.grid[y].length;x++){
        const point={x:part.wx+(x+.5)*U,y:part.wy+(y+.5)*U},tile=wallTiles.get(coordinate(point.x,point.y));
        if(part.grid[y][x]==='а'){assert.ok(tile?.authored);assert.ok(map.walls.some(w=>Math.abs(w.x-point.x)<w.w/2+.001&&Math.abs(w.y-point.y)<w.h/2+.001));}
        else assert.ok(!tile,'air cells cannot acquire a generated wall');
      }
    }
  }
  assert.ok(sawIsland,'the selected library must actually generate its internal-wall part');
});

test('Every actual joined opening remains uninterrupted air on both sides of its seam',()=>{
  for(let i=0;i<10;i++){
    const map=generateMap(`tile-seam-${i}`,'large'),walls=new Set(map.wallTiles.map(t=>coordinate(t.x,t.y)));
    for(const part of map.rooms)for(const p of part.ports)if(p.link!==null){
      const opening=p.connection||p,count=opening.width/U;assert.ok(Number.isInteger(count)&&count>0);
      for(let cell=0;cell<count;cell++)for(const side of [-.5,.5]){
        const along=(cell-(count-1)/2)*U,point={x:opening.x+(p.direction.x?side*U:along),y:opening.y+(p.direction.y?side*U:along)};
        assert.ok(!walls.has(coordinate(point.x,point.y)));assert.ok(map.floors.some(f=>inside(f,point)));
      }
    }
  }
});

test('Parsed L patterns create separate entry, corner and exit sweeps in every orientation and direction',()=>{
  for(const id of ['turn-tight','turn-long'])for(let rotation=0;rotation<4;rotation++){
    const m=instantiateModule(id,rotation);assert.ok(m.floors.length>=3);
    for(const target of m.ports){const source=m.ports.find(p=>p.id!==target.id),floors=m.floors.map(f=>({x:f.x*U,y:f.y*U,w:f.w*U,h:f.h*U})),part={floors,exit:target.direction},sweeps=makeSweeps(part,{x:target.x*U,y:target.y*U});
      // The closed former sixth boundary cell adds edge strips to the L.
      // Those strips need their own sweeps while sharing the same real exit.
      assert.ok(sweeps.some(s=>Math.abs(s.dx)===1)&&sweeps.some(s=>Math.abs(s.dy)===1));
      assert.equal(sweeps.reduce((area,s)=>area+s.w*s.h,0),m.airTiles.length*U*U);
      const terminal=sweeps.findIndex(s=>s.next===null);
      for(let at=0;at<sweeps.length;at++){
        const visited=new Set();let next=at;
        while(sweeps[next].next!==null){assert.equal(visited.has(next),false,'Every edge strip must advance to the exit without a cycle');visited.add(next);next=sweeps[next].next;}
        assert.equal(next,terminal);
      }
      const root=sweeps.find(s=>s.next===null);assert.equal(root.dx,target.direction.x);assert.equal(root.dy,target.direction.y);
      const initial=sweeps.find(s=>inside(s,{x:source.x*U,y:source.y*U}));assert.equal(initial.dx,-source.direction.x||0);assert.equal(initial.dy,-source.direction.y||0);
    }
  }
});
