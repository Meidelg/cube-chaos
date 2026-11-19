import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createPartDraft,compilePart,serializePartLibrary,parsePartLibrary} from '../src/part-library.js';
import {generateMap,createPartPreview} from '../src/map.js';
import {PartEditor} from '../src/part-editor.js';
import {SaveManager,freshProfile,pack,unpack} from '../src/save.js';
import {Race} from '../src/race.js';
import {Body} from '../src/physics.js';
import {STEP,SIZES,U} from '../src/config.js';
import {hash} from '../src/random.js';

function part(id='integration-corridor'){
  return{...createPartDraft(12,10),id,name:'Проход для проверки'};
}
function savedProfile(library=[part()]){
  const profile=freshProfile();
  profile.coins=1730;profile.earned=2400;profile.owned=['blueprint','comet'];
  profile.equipped.theme='blueprint';profile.equipped.trail='comet';profile.partLibrary=library;
  return profile;
}
function installStorage(t){
  const previous={indexedDB:globalThis.indexedDB,localStorage:globalThis.localStorage},values=new Map();
  globalThis.indexedDB=new IDBFactory();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  t.after(()=>{for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
}
const json=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);

test('Editor integration: full save JSON retains the library, purchases and a resumable authored-map race',()=>{
  const library=parsePartLibrary(serializePartLibrary([part()]));
  const original=new Race(generateMap('editor-save-roundtrip','medium',library),6);
  original.select(3);original.start();
  for(const cube of original.cubes)Body.setVelocity(cube.body,{x:0,y:0});
  original.ticks=240;
  original.cubes[0].boostUntil=3;original.cubes[0].boostAmount=2;
  original.cubes[0].usedResize=['already-used-size-object'];
  original.physics.kill(original.cubes[5],1.5,'Лазер');
  const saved=json(pack(savedProfile(library),original.snapshot())),read=unpack(saved);
  const restored=new Race(read.race.map,read.race.count,undefined,null,read.race);
  try{
    assert.equal(Object.keys(saved)[0],'gameVersion');
    assert.equal(read.profile.coins,1730);assert.equal(read.profile.earned,2400);
    assert.deepEqual(read.profile.owned,['blueprint','comet']);
    assert.equal(read.profile.equipped.theme,'blueprint');assert.equal(read.profile.equipped.trail,'comet');
    assert.deepEqual(read.profile.partLibrary,library);
    assert.deepEqual(restored.map,saved.race.map,'Resume must use saved geometry, not generate from the editable library again');
    assert.equal(restored.id,original.id);near(restored.time,2);assert.equal(restored.prediction.selected,3);
    assert.equal(restored.paused,true);assert.equal(restored.cubes[5].alive,false);
    assert.equal(restored.cubes[0].boostUntil,3);assert.deepEqual(restored.cubes[0].usedResize,['already-used-size-object']);
    assert.equal(restored.rng.state,original.rng.state);
    const geometry=json(restored.map);
    read.profile.partLibrary[0].grid[2]='а'.repeat(12);
    read.profile.partLibrary[0].wallStart.x=4;
    assert.deepEqual(restored.map,geometry,'Editing next-race assets must not mutate an active saved map');
    restored.paused=false;restored.step();assert.equal(restored.ticks,241);
    near(restored.time,2+STEP/1000);
    // Restore a valid library before testing a second export of the continued race.
    read.profile.partLibrary=library;
    const rewritten=unpack(json(pack(read.profile,restored.snapshot())));
    assert.equal(rewritten.profile.coins,1730);assert.equal(rewritten.race.id,original.id);
    assert.deepEqual(rewritten.profile.partLibrary,library);
  }finally{original.destroy();restored.destroy();}
});

test('Editor integration: a v0.4 save without partLibrary remains usable and exports without losing progress',()=>{
  const profile=savedProfile();delete profile.partLibrary;
  const legacy=pack(profile);legacy.gameVersion='0.4.0';
  const {checksum,...payload}=legacy;legacy.checksum=hash(JSON.stringify(payload)).toString(16);
  const read=unpack(json(legacy));
  assert.deepEqual(read.profile.partLibrary??[],[]);
  assert.equal(read.profile.coins,1730);assert.deepEqual(read.profile.owned,['blueprint','comet']);
  const rewritten=unpack(json(pack(read.profile)));
  assert.equal(rewritten.profile.coins,1730);assert.deepEqual(rewritten.profile.owned,['blueprint','comet']);
});

test('Editor integration: library-only JSON is independent and rejects invalid grids, markers and disconnected routes',()=>{
  const source=[part()],decoded=parsePartLibrary(serializePartLibrary(source));
  decoded[0].wallStart.x=4;assert.equal(source[0].wallStart.x,0,'Imported drafts must not alias their source');
  const invalid=[
    draft=>{draft.grid[2]='б';},
    draft=>{draft.grid[2]='x'.repeat(12);},
    draft=>{delete draft.entry;},
    draft=>{delete draft.exit;},
    draft=>{delete draft.wallStart;},
    draft=>{draft.entry.x=40;},
    draft=>{draft.exit.y=9;draft.exit.width=6;},
    draft=>{draft.wallStart={x:-1,y:5,direction:'E'};},
    draft=>{draft.wallStart.direction='NE';},
    draft=>{draft.grid=draft.grid.map(row=>`${row.slice(0,5)}а${row.slice(6)}`);},
  ];
  for(const mutate of invalid){
    const draft=part();mutate(draft);
    const text=JSON.stringify({type:'cube-chaos-parts',formatVersion:1,parts:[draft]});
    assert.throws(()=>parsePartLibrary(text),'Invalid authored geometry must be rejected before it enters the generator');
  }
});

test('Editor integration: full-save imports validate parts before replacing coins, purchases or an unfinished race',async t=>{
  installStorage(t);
  const saves=await new SaveManager().open();t.after(()=>saves.db.close());
  const race=new Race(generateMap('editor-import-preserves-race','small',[part()]),4);
  t.after(()=>race.destroy());race.select(2);race.start();race.ticks=90;
  await saves.import(JSON.stringify(pack(savedProfile(),race.snapshot())));
  const before=json({profile:saves.profile,race:saves.race});
  const invalid=[
    draft=>{draft.grid[3]='аа';},
    draft=>{draft.entry={x:0,y:99,side:'W',width:6};},
    draft=>{draft.wallStart={x:99,y:5,direction:'E'};},
    draft=>{draft.grid=draft.grid.map(row=>`${row.slice(0,5)}а${row.slice(6)}`);},
  ];
  for(const mutate of invalid){
    const draft=part();mutate(draft);
    await assert.rejects(async()=>saves.import(JSON.stringify(pack(savedProfile([draft]),race.snapshot()))));
    assert.deepEqual(json({profile:saves.profile,race:saves.race}),before,'A rejected part import must leave all committed progress intact');
  }
  const reloaded=await new SaveManager().open();t.after(()=>reloaded.db.close());
  assert.deepEqual(json({profile:reloaded.profile,race:reloaded.race}),before);
});

test('Editor integration: identical seed and active library reproduce a map; disabled parts never enter tracks',()=>{
  const enabled=part(),source=json(enabled),moduleId=compilePart(enabled).id;
  const a=generateMap('editor-repeatable','medium',[enabled]);
  const b=generateMap('editor-repeatable','medium',[json(enabled)]);
  assert.deepEqual(a,b);assert.match(a.moduleLibraryHash,/^[0-9a-f]{8}$/i);
  assert.deepEqual(enabled,source,'Generation must not rewrite editor grid coordinates or markers');
  const savedMap=json(a);enabled.grid[2]='а'.repeat(12);enabled.wallStart.x=4;
  assert.deepEqual(a,savedMap,'Already assembled geometry must not retain mutable editor references');
  const active=part();let seen=false;
  for(let i=0;i<8;i++){
    const map=generateMap(`editor-use-${i}`,'medium',[active]);
    seen ||= map.rooms.some(section=>section.module===moduleId);
    const disabled=generateMap(`editor-use-${i}`,'medium',[{...active,enabled:false}]);
    assert.equal(disabled.rooms.some(section=>section.module===moduleId),false);
  }
  assert.equal(seen,true,'An enabled editor part must be used by the actual map generator');
});

test('Editor integration: moving the wall-start marker changes the real pursuit collider, including reversed direction',()=>{
  const original=part(),moved=part(),reversed=part();
  moved.wallStart.x=4;
  reversed.wallStart={x:10,y:5,direction:'W'};
  const starts=[];
  for(const draft of [original,moved,reversed]){
    const map=createPartPreview(draft),section=map.rooms.find(room=>room.kind==='custom'),race=new Race(map,12);
    try{
      assert.ok(section);assert.equal(map.rooms[0].kind,'start');
      assert.ok(race.cubes.every(cube=>race.physics.canPlace(cube,cube.body.position)),
        'Preview must keep all twelve initial cubes clear of an arbitrarily small editor section');
      near(section.wallMarker.x-section.wx,(draft.wallStart.x+.5)*U);
      near(section.wallMarker.y-section.wy,(draft.wallStart.y+.5)*U);
      race.mechanisms.update(SIZES.small.wall+section.wallStart+.5,0);
      const source=race.mechanisms.fronts.find(front=>front.roomId===section.id&&front.sweep.source);
      assert.ok(source?.active&&source.body,'The marker must produce a physical wall, not just editor metadata');
      const direction=draft.wallStart.direction==='E'?1:-1;
      assert.equal(source.sweep.dx,direction);assert.equal(source.sweep.dy,0);
      const initialEdge=section.wallMarker.x-direction*U/2;
      near(source.body.bounds[direction>0?'min':'max'].x,initialEdge);
      near(source.body.bounds.max.x-source.body.bounds.min.x,16);
      starts.push(initialEdge-section.wx);
    }finally{race.destroy();}
  }
  near(starts[1]-starts[0],4*U);near(starts[2],11*U);
});

test('Editor integration: cancelling unsaved close preserves the draft and never persists it',async t=>{
  const previous=globalThis.window,calls={saved:0,closed:0,confirm:0};
  globalThis.window={confirm:()=>{calls.confirm++;return false;}};
  t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
  const library=[part()],before=json(library);
  const editor=new PartEditor({onSave:()=>{calls.saved++;},onClose:()=>{calls.closed++;}});
  editor.setParts(library);editor.draft=json(library[0]);editor.baseline=JSON.stringify(editor.draft);editor.active=true;
  editor.draft.name='Не сохранено';editor.draft.grid[2]='а'.repeat(12);
  const draftBeforeClose=json(editor.draft);
  assert.equal(editor.isDirty,true);
  assert.equal(await editor.close(),false);
  assert.equal(editor.isOpen,true);assert.deepEqual(editor.draft,draftBeforeClose);
  assert.deepEqual(editor.parts,before);assert.deepEqual(library,before);
  assert.deepEqual(calls,{saved:0,closed:0,confirm:1});
  globalThis.window.confirm=()=>true;
  assert.equal(await editor.close(),true);assert.equal(editor.isOpen,false);
  assert.equal(calls.saved,0,'Discarding the editor must not call the persistence callback');
  assert.equal(calls.closed,1);assert.deepEqual(library,before);
});

test('Editor integration: the Game creates real race geometry from the saved part library',async()=>{
  const {Game}=await import('../src/game.js');
  const library=[part('game-wired-part')],game=new Game();
  game.saves={profile:savedProfile(library)};game.settings=game.saves.profile.settings;game.count=4;game.size='small';
  game.renderer={setRace(){}};game.ui={prepare(){}};
  game.newRace({seed:'game-library-wiring'});
  try{assert.ok(game.race.map.rooms.some(room=>room.module==='custom:game-wired-part'));assert.deepEqual(game.saves.profile.partLibrary,library);}finally{game.race.destroy();}
});

test('Editor integration: a genuinely blocked active port is rejected before a library edit is committed',async()=>{
  const {Game}=await import('../src/game.js'),game=new Game(),draft=part();
  game.checkPartConnections([draft]);
  const row=draft.grid[draft.exit.y];draft.grid[draft.exit.y]=row.slice(0,draft.exit.x)+'а'+row.slice(draft.exit.x+1);
  assert.throws(()=>game.checkPartConnections([draft]),/соединения/);
  draft.enabled=false;assert.doesNotThrow(()=>game.checkPartConnections([draft]));
});
