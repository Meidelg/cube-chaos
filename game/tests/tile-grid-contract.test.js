import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTileGrid,rotateTileGrid,instantiateModule} from '../src/modules.js';
import {buildWallGeometry,generateMap} from '../src/map.js';
import {Physics,Query} from '../src/physics.js';
import {U,GENERATOR_VERSION} from '../src/config.js';

const EXAMPLE=['аааа','ббба','ббба','абба'];
const keys=tiles=>tiles.map(t=>`${t.x},${t.y}`).sort();
const inRect=(p,r)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;

test('User tile example preserves every Cyrillic wall/air cell, its orientation and all four unit coordinates',()=>{
  const parsed=parseTileGrid(EXAMPLE);assert.deepEqual(parsed.grid,EXAMPLE);assert.equal(parsed.w,4);assert.equal(parsed.h,4);
  assert.deepEqual(keys(parsed.wallTiles),['0,0','0,3','1,0','2,0','3,0','3,1','3,2','3,3']);
  assert.deepEqual(keys(parsed.airTiles),['0,1','0,2','1,1','1,2','1,3','2,1','2,2','2,3']);
  assert.deepEqual(parseTileGrid(EXAMPLE.join('\n')).grid,EXAMPLE);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++)assert.equal(parsed.floors.some(r=>inRect({x:x+.5,y:y+.5},r)),EXAMPLE[y][x]==='б',`cell ${x},${y}`);
  assert.equal(parsed.floors.reduce((area,r)=>area+r.w*r.h,0),8);
  assert.deepEqual(rotateTileGrid(EXAMPLE,1),['абба','ббба','ббба','аааа']);assert.deepEqual(rotateTileGrid(EXAMPLE,4),EXAMPLE);
  const authored=instantiateModule({id:'literal-user-example',kind:'test',grid:EXAMPLE,ports:[]});assert.deepEqual(authored.grid,EXAMPLE);assert.deepEqual(keys(authored.wallTiles),keys(parsed.wallTiles));
});

test('User tile example compiles to real Matter colliders matching every wall/air cell at one game unit',()=>{
  const parsed=parseTileGrid(EXAMPLE),floors=parsed.floors.map(f=>({x:f.x*U,y:f.y*U,w:f.w*U,h:f.h*U,roomId:0}));
  const authored=parsed.wallTiles.map(t=>({x:(t.x+.5)*U,y:(t.y+.5)*U,w:U,h:U,roomId:0,authored:true}));
  const geometry=buildWallGeometry(floors,authored),physics=new Physics(geometry);
  try{
    for(const tile of geometry.wallTiles){assert.equal(tile.w,U);assert.equal(tile.h,U);assert.ok(Number.isInteger(tile.x/U-.5));assert.ok(Number.isInteger(tile.y/U-.5));}
    assert.deepEqual(keys(geometry.wallTiles.filter(t=>t.authored).map(t=>({x:t.x/U-.5,y:t.y/U-.5}))),keys(parsed.wallTiles));
    // Check near all four corners as well as the centre: a merged collider must
    // preserve the whole tile mask, not merely pass a centre-point count check.
    for(let y=0;y<4;y++)for(let x=0;x<4;x++)for(const offset of [{x:.5,y:.5},{x:.01,y:.01},{x:.99,y:.01},{x:.01,y:.99},{x:.99,y:.99}]){
      const actual=Query.point(physics.walls,{x:(x+offset.x)*U,y:(y+offset.y)*U}).length>0;
      assert.equal(actual,EXAMPLE[y][x]==='а',`physical cell ${x},${y}, point ${offset.x},${offset.y}`);
    }
  }finally{physics.destroy();}
});

test('Generated wall tiles and merged Matter rectangles cover exactly the same unit-cell geometry',()=>{
  for(const size of ['small','medium','large']){
    const map=generateMap(`wall-collider-contract-${size}`,size);assert.equal(map.generatorVersion,GENERATOR_VERSION);assert.ok(map.wallTiles.length>0);
    const tiles=new Set(map.wallTiles.map(t=>`${Math.round(t.x/U-.5)},${Math.round(t.y/U-.5)}`)),compiled=new Set();
    for(const t of map.wallTiles){assert.equal(t.w,U);assert.equal(t.h,U);assert.ok(Number.isInteger(t.x/U-.5));assert.ok(Number.isInteger(t.y/U-.5));}
    for(const wall of map.walls){
      const left=wall.x/U-wall.w/U/2,top=wall.y/U-wall.h/U/2,w=wall.w/U,h=wall.h/U;
      for(const n of [left,top,w,h])assert.ok(Number.isInteger(n),'Merged walls stay aligned to unit tile edges');
      for(let y=top;y<top+h;y++)for(let x=left;x<left+w;x++){const key=`${x},${y}`;assert.ok(!compiled.has(key),'Merged colliders do not duplicate or overlap unit cells');compiled.add(key);}
    }
    assert.deepEqual([...compiled].sort(),[...tiles].sort());
  }
});
