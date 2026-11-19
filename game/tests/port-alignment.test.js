import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDraft} from '../src/part-library.js';
import {createPartPreview,generateMap,validateMap} from '../src/map.js';
import {rotateTileGrid} from '../src/modules.js';
import {U,SIZES} from '../src/config.js';

function parts(){
  const a={...createPartDraft(8,8),id:'wide-exit',name:'Выход3',entry:{x:0,y:3,side:'W',width:1},exit:{x:7,y:2,side:'E',width:3}};
  const b={...createPartDraft(8,8),id:'narrow-entry',name:'Вход1',entry:{x:0,y:3,side:'W',width:1},exit:{x:7,y:3,side:'E',width:1}};
  return[a,b];
}
const airAt=(map,x,y)=>map.floors.some(f=>x>f.x&&x<f.x+f.w&&y>f.y&&y<f.y+f.h);

test('Unconstrained real custom3→custom1 corridors align at the middle cell and preserve authored grids',()=>{
  const library=parts(),offsets=new Set();
  for(let seed=0;seed<60;seed++){
    const map=generateMap(`align${seed}`,'medium',library);assert.equal(validateMap(map),true);assert.equal(map.rooms.some(p=>p.kind==='adapter'),false);
    assert.ok(map.rooms.length>=SIZES.medium.min&&map.rooms.length<=SIZES.medium.max);
    for(const part of map.rooms.filter(p=>p.module==='custom:wide-exit')){
      assert.deepEqual(part.grid,rotateTileGrid(library[0].grid,part.rotation));
      const port=part.ports.find(p=>p.id==='out');if(map.rooms[port.link]?.module!=='custom:narrow-entry')continue;
      assert.equal(port.width,3*U);assert.equal(port.connection.width,U);
      offsets.add(((port.direction.x?port.connection.y-port.y:port.connection.x-port.x)+port.width/2)/U-.5);
      const child=map.rooms[port.link],peer=child.ports.find(p=>p.link===part.id);assert.deepEqual(peer.connection,port.connection);
      const shift=port.direction.x?peer.y-port.y:peer.x-port.x,centered={x:child.wx-(port.direction.y?shift:0),y:child.wy-(port.direction.x?shift:0),w:child.width,h:child.height};
      assert.equal(map.rooms.some(older=>older.id<child.id&&centered.x<older.wx+older.width&&centered.x+centered.w>older.wx&&centered.y<older.wy+older.height&&centered.y+centered.h>older.wy),false,'This corridor fixture must leave centered placement unobstructed');
      assert.equal(shift,0,'A free 3→1 seam must use the central cell');
    }
  }
  assert.deepEqual([...offsets].sort(),[1]);
});

test('Unused cells at a wide marked seam cannot make an unmarked bypass',()=>{
  for(let seed=0;seed<12;seed++){
    const map=generateMap(`sealed${seed}`,'small',parts());
    for(const part of map.rooms)for(const port of part.ports.filter(p=>p.link!==null)){
      const peer=map.rooms[port.link].ports.find(p=>p.link===part.id),c=port.connection;
      assert.ok(c);assert.equal(c.width,Math.min(port.width,peer.width));
      const low=Math.min(port.direction.x?part.wy:part.wx,port.direction.x?map.rooms[port.link].wy:map.rooms[port.link].wx),high=Math.max(port.direction.x?part.wy+part.height:part.wx+part.width,port.direction.x?map.rooms[port.link].wy+map.rooms[port.link].height:map.rooms[port.link].wx+map.rooms[port.link].width);
      for(let position=low+U/2;position<high;position+=U){
        const x=port.direction.x?c.x:position,y=port.direction.x?position:c.y;
        const connected=airAt(map,x-port.direction.x*U/2,y-port.direction.y*U/2)&&airAt(map,x+port.direction.x*U/2,y+port.direction.y*U/2);
        const allowed=Math.abs(position-(port.direction.x?c.y:c.x))<c.width/2;
        assert.equal(connected,allowed,`Only the actual overlap may remain open at ${part.id}→${port.link}`);
      }
    }
  }
});

test('The largest authored32×32 ports connect directly to standard ports with a live wall source',()=>{
  const part={...createPartDraft(32,32),id:'max-width',grid:Array(32).fill('б'.repeat(32)),entry:{x:0,y:0,side:'W',width:32},exit:{x:31,y:0,side:'E',width:32},wallStart:{x:0,y:16,direction:'E'}};
  for(let seed=0;seed<8;seed++){
    const map=generateMap(`wide${seed}`,'small',[part]);assert.equal(validateMap(map),true);
    for(const section of map.rooms.filter(r=>r.kind==='custom')){
      assert.deepEqual(section.grid,part.grid);assert.equal(section.width,32*U);assert.equal(section.height,32*U);
      assert.ok(airAt(map,section.wallMarker.x,section.wallMarker.y));
      assert.ok(section.sweeps.some(s=>s.source&&s.startOffset===0&&s.dx===section.wallMarker.direction.x&&s.dy===section.wallMarker.direction.y));
    }
  }
  assert.equal(createPartPreview(part).rooms.length,3);
});

test('Direct partial alignment is deterministic and does not mutate a saved authored library',()=>{
  const library=parts(),before=JSON.stringify(library),a=generateMap('repeat-offset','medium',library),b=generateMap('repeat-offset','medium',library.slice().reverse());
  assert.deepEqual(a,b);assert.equal(JSON.stringify(library),before);
  const invalid=structuredClone(a),port=invalid.rooms[0].ports.find(p=>p.link!==null);port.connection.width=port.width+U;assert.throws(()=>validateMap(invalid),/соединения/);
});
