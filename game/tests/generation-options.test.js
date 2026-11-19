import test from 'node:test';
import assert from 'node:assert/strict';
import {GENERATION_OPTIONS,defaultGenerationOptions,normalizeGenerationOptions,filterRandomMechanisms} from '../src/generation-options.js';
import {generateMap,createPartPreview} from '../src/map.js';
import {createPartObject} from '../src/part-objects.js';
import {Race} from '../src/race.js';
import {freshProfile,pack,unpack} from '../src/save.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const allOff=()=>Object.fromEntries(GENERATION_OPTIONS.map(({key})=>[key,false]));
function geometry(map){
  return{seed:map.seed,generatorVersion:map.generatorVersion,moduleLibraryHash:map.moduleLibraryHash,width:map.width,height:map.height,start:map.start,finish:map.finish,walls:map.walls,wallTiles:map.wallTiles,floors:map.floors,rooms:map.rooms.map(({navigationDistance,...room})=>room)};
}
function authoredPart(){
  const make=(type,x,y,options={})=>createPartObject(type,{x,y},{id:`configured-${type}`,...options});
  return{id:'configured-authored-part',name:'Авторские механизмы',enabled:true,grid:Array(32).fill('б'.repeat(32)),entry:{x:0,y:15,side:'W',width:5},exit:{x:31,y:15,side:'E',width:5},wallStart:{x:0,y:17,direction:'E'},objects:[
    make('laser',3,4,{end:{x:8,y:4}}),make('portal',3,10,{id:'portal-a',pair:'portal-b'}),make('portal',9,10,{id:'portal-b',pair:'portal-a'}),
    make('spinner',15,4),make('press',21,3,{w:2,h:1,travel:3,direction:'S'}),make('bumper',28,4),
    make('conveyor',15,10,{w:3,h:2}),make('boost',23,10,{w:2,h:2}),make('slow',3,20,{w:2,h:2}),make('resize',9,20),
    make('breakable-color-block',15,20),make('breakable-block',19,20),make('breakable-color-wall',24,20,{h:3,hits:2}),make('breakable-wall',28,20,{h:3,hits:3}),
    make('wall-start',3,28),
  ]};
}

test('Generation options: all random groups default on and only strict booleans override known keys',()=>{
  const expected=['laser','portal','spinner','press','bumper','conveyor','boost','slow','resize','breakables'];
  assert.deepEqual(GENERATION_OPTIONS.map(group=>group.key),expected);
  assert.ok(GENERATION_OPTIONS.every(group=>typeof group.label==='string'&&group.label.length>0&&group.types.length>0));
  const defaults=defaultGenerationOptions();assert.deepEqual(defaults,Object.fromEntries(expected.map(key=>[key,true])));
  defaults.laser=false;assert.equal(defaultGenerationOptions().laser,true);
  const input={laser:false,portal:true,spinner:0,press:'false',bumper:null,conveyor:undefined,unknown:false,'wall-start':false,pursuit:false};
  const normalized=normalizeGenerationOptions(input);assert.equal(normalized.laser,false);
  assert.ok(expected.filter(key=>key!=='laser').every(key=>normalized[key]===true));assert.deepEqual(Object.keys(normalized),expected);
  for(const value of [undefined,null,false,[],123])assert.deepEqual(normalizeGenerationOptions(value),defaultGenerationOptions());
  const inherited=Object.create({laser:false});assert.equal(normalizeGenerationOptions(inherited).laser,true);
});

test('Generation options: filtering removes only disabled random types and always preserves authored objects and wall starters',()=>{
  const types=GENERATION_OPTIONS.flatMap(group=>group.types),random=types.map(type=>({id:`random-${type}`,type})),authored=types.map(type=>({id:`authored-${type}`,type,authored:true}));
  const marker={id:'wall-marker',type:'wall-start'},items=[...random,...authored,marker],before=clone(items);
  const filtered=filterRandomMechanisms(items,allOff());assert.deepEqual(filtered,[...authored,marker]);assert.deepEqual(items,before);
  for(const group of GENERATION_OPTIONS){
    const result=filterRandomMechanisms(items,{[group.key]:false});
    assert.deepEqual(result,items.filter(item=>item.authored||!group.types.includes(item.type)));
  }
});

test('Generation options: random portal pairs are removed together while authored pairs remain reciprocal',()=>{
  const items=[{id:'random-a',pair:'random-b',type:'portal'},{id:'random-b',pair:'random-a',type:'portal'},
    {id:'authored-a',pair:'authored-b',type:'portal',authored:true},{id:'authored-b',pair:'authored-a',type:'portal',authored:true}];
  const remaining=filterRandomMechanisms(items,{portal:false});assert.deepEqual(remaining,items.slice(2));
  for(const portal of remaining)assert.equal(remaining.find(partner=>partner.id===portal.pair)?.pair,portal.id);
});

test('Generation options: every individual toggle filters real generated objects and preserves terrain and enabled parameters',()=>{
  const examples=new Map();
  for(let seed=0;seed<20&&examples.size<GENERATION_OPTIONS.length;seed++){
    const key=`generation-options-${seed}`,map=generateMap(key,'large');
    for(const group of GENERATION_OPTIONS)if(!examples.has(group.key)&&map.mechanisms.some(item=>!item.authored&&group.types.includes(item.type)))examples.set(group.key,{key,map});
  }
  assert.equal(examples.size,GENERATION_OPTIONS.length,'Fixtures must exercise every configurable random group in actual maps');
  for(const group of GENERATION_OPTIONS){
    const {key,map:baseline}=examples.get(group.key),configured=generateMap(key,'large',[],{[group.key]:false});
    assert.deepEqual(configured.mechanisms,baseline.mechanisms.filter(item=>item.authored||!group.types.includes(item.type)));
    assert.deepEqual(geometry(configured),geometry(baseline));assert.equal(configured.generationOptions[group.key],false);
    assert.deepEqual(configured,generateMap(key,'large',[],{[group.key]:false}));
    assert.match(configured.generationOptionsHash,/^[a-f0-9]{8}$/);assert.notEqual(configured.generationOptionsHash,baseline.generationOptionsHash);
    if(group.key==='portal'){
      assert.equal(configured.mechanisms.some(item=>item.type==='portal'&&!item.authored),false);
      assert.ok(configured.rooms.every((room,index)=>room.navigationDistance>=baseline.rooms[index].navigationDistance));
      assert.ok(configured.rooms.some((room,index)=>room.navigationDistance>baseline.rooms[index].navigationDistance),'Removed portals must stop contributing shortcuts to progress');
    }
  }
});

test('Generation options: disabling every random group leaves authored mechanisms, pursuit geometry and previews fully active',()=>{
  const source=authoredPart(),before=clone(source),options=allOff();
  for(const size of ['small','medium','large']){
    const baseline=generateMap(`authored-options-${size}`,size,[source]),configured=generateMap(`authored-options-${size}`,size,[source],options);
    assert.deepEqual(geometry(configured),geometry(baseline));assert.deepEqual(configured.mechanisms,baseline.mechanisms.filter(item=>item.authored));
    const types=new Set(configured.mechanisms.map(item=>item.type));for(const type of GENERATION_OPTIONS.flatMap(group=>group.types))assert.ok(types.has(type));assert.ok(types.has('wall-start'));
    assert.ok(configured.rooms.every(room=>room.sweeps.length>0));assert.deepEqual(configured.generationOptions,options);
    const race=new Race(configured,2);
    try{assert.ok(race.mechanisms.items.every(item=>item.authored));assert.ok(race.mechanisms.wallStartMarkers.length>0);assert.ok(race.mechanisms.fronts.some(front=>!front.triggerId));}
    finally{race.destroy();}
  }
  const preview=createPartPreview(source);assert.equal(preview.mechanisms.length,source.objects.length);assert.ok(preview.mechanisms.every(item=>item.authored));assert.equal(preview.generationOptions,undefined);
  assert.deepEqual(source,before);assert.deepEqual(options,allOff());
});

test('Generation options: equivalent normalized inputs reproduce maps and do not share mutable preference objects',()=>{
  const key='normalized-generation-options',defaults=generateMap(key,'medium');
  assert.deepEqual(defaults,generateMap(key,'medium',[],defaultGenerationOptions()));
  assert.deepEqual(defaults,generateMap(key,'medium',[],{laser:'false',portal:0,unknown:false}));
  const options={laser:false,portal:false},map=generateMap(key,'medium',[],options);
  const reordered={...defaultGenerationOptions(),portal:false,laser:false};assert.deepEqual(map,generateMap(key,'medium',[],reordered));
  options.laser=true;assert.equal(map.generationOptions.laser,false);
});

test('Generation options: saved races restore the exact filtered map and authored bodies without applying preferences again',()=>{
  const source=authoredPart(),map=generateMap('saved-generation-options','small',[source],allOff()),original=new Race(map,4);let restored;
  original.select(2);original.start();original.ticks=120;original.mechanisms.update(original.time,0);
  try{
    const profile=freshProfile();profile.coins=1730;profile.owned=['blueprint'];profile.partLibrary=[source];
    const saved=unpack(clone(pack(profile,original.snapshot())));restored=new Race(saved.race.map,saved.race.count,undefined,null,saved.race);
    assert.deepEqual(restored.map,original.map);assert.deepEqual(restored.map.generationOptions,allOff());
    assert.ok(restored.mechanisms.items.every(item=>item.authored));assert.equal(restored.mechanisms.items.length,original.mechanisms.items.length);
    for(const item of restored.mechanisms.items)if(item.type==='portal')assert.equal(restored.mechanisms.items.find(other=>other.id===item.pair)?.pair,item.id);
    assert.equal(restored.paused,true);assert.equal(restored.id,original.id);assert.equal(restored.prediction.selected,2);
    assert.equal(saved.profile.coins,1730);assert.deepEqual(saved.profile.owned,['blueprint']);
  }finally{original.destroy();restored?.destroy();}
});
