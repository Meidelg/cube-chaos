import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDraft,getPortCells,validatePartDraft,compilePart,parsePartLibrary,serializePartLibrary} from '../src/part-library.js';
import {instantiateModule,MODULES} from '../src/modules.js';
import {generateMap,createPartPreview,validateMap} from '../src/map.js';
import {U,SIZES} from '../src/config.js';

function draft(w=12,h=10,id='test-part'){return{...createPartDraft(w,h),id};}

test('Small authored drafts have real two-cell clearance and exact boundary-cell markers',()=>{
  for(const [w,h]of [[4,4],[12,10],[32,32]]){
    const part=draft(w,h);assert.equal(validatePartDraft(part).valid,true);
    assert.deepEqual(getPortCells(part.entry),Array.from({length:part.entry.width},(_,i)=>({x:0,y:part.entry.y+i})));
    const source=compilePart(part),module=instantiateModule(source);
    assert.deepEqual(module.grid,part.grid);assert.equal(module.w,w);assert.equal(module.h,h);
    assert.deepEqual(module.ports[0].direction,{x:-1,y:0});
    part.grid[part.entry.y]='а'.repeat(w);part.wallStart.x=3;
    assert.notDeepEqual(source.grid,part.grid);assert.notEqual(source.wallMarker.x,3.5);
  }
});

test('Validation rejects missing markers, blocked ports and disconnected air; unit bottlenecks are allowed',()=>{
  const a=draft();delete a.wallStart;assert.equal(validatePartDraft(a).valid,false);
  const b=draft();b.entry.x=1;assert.match(validatePartDraft(b).errors.join(' '),/границ/);
  const c=draft();c.grid[c.entry.y]='а'+c.grid[c.entry.y].slice(1);assert.match(validatePartDraft(c).errors.join(' '),/воздух/);
  const d=draft();d.grid[0]='аб'+d.grid[0].slice(2);assert.match(validatePartDraft(d).errors.join(' '),/соединяться/);
  const e=draft(8,6);e.grid=e.grid.map((row,y)=>row.slice(0,3)+(y===2?'б':'а')+row.slice(4));assert.equal(validatePartDraft(e).valid,true);assert.ok(validatePartDraft(e).warnings.length);
  const f=draft();f.wallStart.direction='W';assert.match(validatePartDraft(f).errors.join(' '),/направлению/);
});

test('Part JSON validates versions, identifiers and every grid before returning a detached library',()=>{
  const p=draft(),restored=parsePartLibrary(serializePartLibrary([p]));assert.deepEqual(restored,[p]);restored[0].wallStart.x=4;assert.equal(p.wallStart.x,0);
  assert.throws(()=>parsePartLibrary('{oops'),/JSON/);
  assert.throws(()=>parsePartLibrary({type:'cube-chaos-parts',formatVersion:999,parts:[p]}),/формат/);
  assert.throws(()=>serializePartLibrary([p,p]),/повторяться/);
  assert.throws(()=>serializePartLibrary([{...p,grid:['xxxx']}]),/кириллические/);
  assert.throws(()=>serializePartLibrary(Array.from({length:65},(_,i)=>({...p,id:String(i)}))),/64/);
});

test('Custom modules rotate all authored cells, ports and the physical wall source together',()=>{
  const p=draft(),source=compilePart(p);
  for(let turns=0;turns<4;turns++){
    const m=instantiateModule(source,turns),r=instantiateModule(source,turns+4);assert.deepEqual(m,r);
    assert.equal(m.grid[Math.floor(m.wallMarker.y)][Math.floor(m.wallMarker.x)],'б');
    assert.deepEqual(m.wallMarker.direction,[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}][turns]);
  }
});

test('Every generated size really uses an enabled custom piece without changing authored cells or count ranges',()=>{
  for(const h of [4,5,6,7,10])for(const size of ['small','medium','large'])for(let seed=0;seed<3;seed++){
    const p=draft(8,h),map=generateMap(`custom:${h}:${seed}`,size,[p]),part=map.rooms.find(r=>r.kind==='custom');
    assert.ok(part);assert.deepEqual(part.grid,instantiateModule(compilePart(p),part.rotation).grid);
    assert.ok(map.rooms.length>=SIZES[size].min&&map.rooms.length<=SIZES[size].max);assert.equal(validateMap(map),true);assert.match(map.moduleLibraryHash,/^[a-f0-9]{8}$/);
    const sweep=part.sweeps.find(s=>s.source);assert.ok(sweep);assert.equal(sweep.startOffset,0);assert.equal(sweep.dx,part.wallMarker.direction.x);assert.equal(sweep.dy,part.wallMarker.direction.y);
    assert.equal(sweep.dx>0?sweep.x:sweep.dx<0?sweep.x+sweep.w:sweep.dy>0?sweep.y:sweep.y+sweep.h,(sweep.dx?part.wallMarker.x:part.wallMarker.y)-(sweep.dx+sweep.dy)*U/2);
  }
});

test('A seed and sorted active library give identical maps; disabled edits do not change the race',()=>{
  const a=draft(12,10,'a'),b=draft(10,7,'b'),disabled={...draft(8,8,'off'),enabled:false};
  const map=generateMap('library','medium',[a,b,disabled]);assert.deepEqual(map,generateMap('library','medium',[b,a]));
  assert.deepEqual(map,generateMap('library','medium',[b,disabled,a]));
  const changed={...a,wallStart:{...a.wallStart,x:2}};
  assert.notEqual(map.moduleLibraryHash,generateMap('library','medium',[changed,b]).moduleLibraryHash);
  assert.equal(generateMap('disabled','small',[disabled]).rooms.some(r=>r.kind==='custom'),false);
});

test('A bent authored part connects to a real start and finish in its test map',()=>{
  const p={id:'turn',name:'Мой поворот',enabled:true,grid:[...MODULES.find(m=>m.id==='turn-tight').grid],entry:{x:0,y:0,side:'W',width:5},exit:{x:6,y:11,side:'S',width:5},wallStart:{x:0,y:2,direction:'E'}};
  assert.equal(validatePartDraft(p).valid,true);
  const map=createPartPreview(p);assert.equal(validateMap(map),true);assert.equal(map.preview,true);assert.equal(map.mechanisms.length,0);
  assert.ok(map.rooms.find(r=>r.kind==='custom'));assert.equal(map.rooms[0].kind,'start');assert.equal(map.rooms.at(-1).kind,'finish');
  assert.ok(map.rooms[0].width>=14*U&&map.rooms[0].height>=10*U);
});
