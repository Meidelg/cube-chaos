import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {compilePart,validatePartDraft,serializePartLibrary,parsePartLibrary,getPortCells} from '../src/part-library.js';
import {instantiateModule} from '../src/modules.js';
import {createPartPreview,generateMap} from '../src/map.js';
import {Physics} from '../src/physics.js';
import {SaveManager,freshProfile,pack,unpack} from '../src/save.js';
import {U,BASE_SPEED,STEP} from '../src/config.js';
import {hash} from '../src/random.js';

function narrowPart(width=1){
  return{
    id:`unit-marker-${width}`,name:`Проход ${width} клетка`,enabled:true,
    grid:Array.from({length:5},(_,y)=>(y>=2&&y<2+width?'б':'а').repeat(8)),
    entry:{x:0,y:2,side:'W',width},exit:{x:7,y:2,side:'E',width},
    wallStart:{x:0,y:2,direction:'E'},
  };
}
const json=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);

test('Unit marker cells: a one-cell route validates and compiles without widening or moving its boundaries',()=>{
  const draft=narrowPart(),validation=validatePartDraft(draft);
  assert.equal(validation.valid,true,validation.errors.join('\n'));
  assert.deepEqual(getPortCells(draft.entry),[{x:0,y:2}]);
  assert.deepEqual(getPortCells(draft.exit),[{x:7,y:2}]);
  const source=compilePart(draft),entry=source.ports.find(port=>port.id==='in'),exit=source.ports.find(port=>port.id==='out');
  assert.deepEqual(source.grid,draft.grid);assert.equal(entry.width,1);assert.equal(exit.width,1);
  assert.deepEqual({x:entry.x,y:entry.y},{x:0,y:2.5});
  assert.deepEqual({x:exit.x,y:exit.y},{x:8,y:2.5});
  for(let turns=0;turns<4;turns++){
    const module=instantiateModule(source,turns);
    assert.ok(module.ports.every(port=>port.width===1));
    assert.equal(module.airTiles.length,8,'Rotation must preserve the exact one-cell-wide tile mask');
  }
  assert.deepEqual(parsePartLibrary(serializePartLibrary([draft])),[draft]);
});

test('Unit marker cells: zero width, off-boundary cells and a blocked one-cell route remain invalid',()=>{
  const invalid=[
    draft=>{draft.entry.width=0;},
    draft=>{draft.exit.width=0;},
    draft=>{draft.entry.x=1;},
    draft=>{draft.exit.y=5;},
    draft=>{draft.grid[2]='бббабббб';},
  ];
  for(const mutate of invalid){
    const draft=narrowPart();mutate(draft);
    assert.equal(validatePartDraft(draft).valid,false);
    assert.throws(()=>parsePartLibrary({type:'cube-chaos-parts',formatVersion:1,parts:[draft]}));
  }
});

test('Unit marker cells: complete save import accepts width one and preserves old width-two libraries',async t=>{
  const previous={indexedDB:globalThis.indexedDB,localStorage:globalThis.localStorage};
  globalThis.indexedDB=new IDBFactory();globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  t.after(()=>{for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  const saves=await new SaveManager().open();t.after(()=>saves.db.close());
  for(const width of [1,2]){
    const profile=freshProfile();profile.coins=1200;profile.owned=['blueprint'];profile.equipped.theme='blueprint';profile.partLibrary=[narrowPart(width)];
    const saved=pack(profile);
    if(width===2){saved.gameVersion='0.5.0';const{checksum,...payload}=saved;saved.checksum=hash(JSON.stringify(payload)).toString(16);}
    assert.equal(unpack(json(saved)).profile.partLibrary[0].entry.width,width);
    await saves.import(JSON.stringify(saved));
    assert.equal(saves.profile.coins,1200);assert.deepEqual(saves.profile.owned,['paper']);
    assert.deepEqual(saves.profile.partLibrary,[narrowPart(width)]);
    const reloaded=await new SaveManager().open();
    try{assert.equal(reloaded.profile.partLibrary[0].entry.width,width);assert.equal(reloaded.profile.coins,1200);}
    finally{reloaded.db.close();}
  }
});

test('Unit marker cells: a full-size Matter cube traverses the authored one-cell corridor without resizing',()=>{
  for(const diagonal of [false,true]){
    const draft=narrowPart(),map=createPartPreview(draft),section=map.rooms.find(room=>room.kind==='custom');
    assert.ok(section);assert.deepEqual(section.grid,draft.grid);
    assert.equal(map.rooms.some(room=>room.kind==='adapter'),false,'A one-cell opening must connect directly, without a transition part');
    const entry=section.ports.find(port=>port.id==='in'),exit=section.ports.find(port=>port.id==='out');
    assert.equal(entry.width,U);assert.equal(exit.width,U);
    const physics=new Physics(map),velocity=diagonal?{x:BASE_SPEED/Math.sqrt(2),y:BASE_SPEED/Math.sqrt(2)}:{x:BASE_SPEED,y:0};
    const cube=physics.addCube(1,entry.x+(diagonal?U/2:-1.5*U),entry.y,'#6078ed',velocity);
    try{
      assert.equal(physics.canPlace(cube,cube.body.position),true);
      let crossed=false;
      for(let tick=1;tick<=480;tick++){
        physics.normalize(cube,tick*STEP/1000);physics.step();physics.checkSafety(cube,tick*STEP/1000);
        assert.equal(cube.size,1);
        // Matter expands broadphase bounds by velocity; physical dimensions are
        // defined by the square's vertices, not that swept collision envelope.
        for(const axis of ['x','y'])near(Math.max(...cube.body.vertices.map(vertex=>vertex[axis]))-Math.min(...cube.body.vertices.map(vertex=>vertex[axis])),U);
        assert.equal(cube.body.angle,0);assert.equal(cube.alive,true);
        if(cube.body.bounds.min.x>exit.x){crossed=true;break;}
      }
      assert.equal(crossed,true,`The ${diagonal?'diagonal':'horizontal'} unit cube must leave the narrow section through its actual exit`);
      assert.deepEqual(cube.usedResize,[]);
    }finally{physics.destroy();}
  }
});

test('Unit marker cells: a valid boundary corridor can be reused in a fully connected generated track',()=>{
  const draft={
    id:'perimeter-unit-lane',name:'Граничный коридор',enabled:true,
    grid:['бббббббб','бааааааб','бааааааб','бааааааб','бааааааб','бббббббб'],
    entry:{x:0,y:2,side:'W',width:1},exit:{x:7,y:2,side:'E',width:1},
    wallStart:{x:0,y:2,direction:'S'},
  };
  assert.equal(validatePartDraft(draft).valid,true);
  const map=generateMap('ring-8','medium',[draft]),cells=new Set();
  for(const floor of map.floors)for(let y=Math.round(floor.y/U);y<Math.round((floor.y+floor.h)/U);y++)for(let x=Math.round(floor.x/U);x<Math.round((floor.x+floor.w)/U);x++)cells.add(`${x},${y}`);
  const queue=[{x:Math.floor(map.start.x/U),y:Math.floor(map.start.y/U)}],visited=new Set([`${queue[0].x},${queue[0].y}`]);
  for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const x=queue[i].x+dx,y=queue[i].y+dy,key=`${x},${y}`;
    if(cells.has(key)&&!visited.has(key)){visited.add(key);queue.push({x,y});}
  }
  assert.equal(visited.size,cells.size,'Sealing an unequal-port seam must not cut a valid authored corridor');
});
