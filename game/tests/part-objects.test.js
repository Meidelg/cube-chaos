import test from 'node:test';
import assert from 'node:assert/strict';
import {OBJECT_TYPES,createPartObject,validatePartObjects,compilePartObjects,getPartObjectBounds} from '../src/part-objects.js';
import {createPartDraft,validatePartDraft,compilePart,parsePartLibrary,serializePartLibrary} from '../src/part-library.js';
import {instantiateModule,rotatePoint} from '../src/modules.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
function part(){const draft={...createPartDraft(32,32),id:'objects-part',grid:Array(32).fill('б'.repeat(32))};return draft;}
function object(type,x=8,y=8,options={}){return createPartObject(type,{x,y},options);}
function pair(a,b){a.pair=b.id;b.pair=a.id;return[a,b];}

test('Object factories cover every runtime type and old parts without objects remain compatible',()=>{
  const draft=part();delete draft.objects;assert.deepEqual(validatePartObjects(draft),{errors:[],warnings:[]});assert.deepEqual(compilePart(draft).mechanisms,[]);
  assert.equal(OBJECT_TYPES.length,14);assert.equal(new Set(OBJECT_TYPES.map(o=>o.type)).size,14);
  draft.objects=OBJECT_TYPES.map((t,i)=>object(t.type,4+i%4*7,4+Math.floor(i/4)*7));
  const portal=draft.objects.find(o=>o.type==='portal'),other=object('portal',25,25);pair(portal,other);draft.objects.push(other);
  assert.deepEqual(validatePartObjects(draft).errors,[]);assert.equal(validatePartDraft(draft).valid,true);
  const compiled=compilePart(draft);assert.equal(compiled.mechanisms.length,15);
  for(const spec of compiled.mechanisms){assert.ok(Number.isFinite(spec.x)&&Number.isFinite(spec.y)&&spec.w>0&&spec.h>0);assert.equal(spec.phase,0);}
});

test('Compiled laser is a thin beam between two whole-cell emitters and survives JSON round trips',()=>{
  const draft=part();draft.objects=[object('laser',4,6,{end:{x:9,y:6},period:5,on:2})];
  const [laser]=compilePartObjects(draft);assert.deepEqual(laser.emitters,[{x:4.5,y:6.5},{x:9.5,y:6.5}]);assert.equal(laser.x,7);assert.equal(laser.y,6.5);assert.equal(laser.w,6);assert.equal(laser.h,.2);
  assert.deepEqual(getPartObjectBounds(laser),{x:4,y:6,w:6,h:1});
  const restored=parsePartLibrary(serializePartLibrary([draft]));assert.deepEqual(compilePartObjects(restored[0]),[laser]);
  draft.objects[0].end.x=12;assert.equal(laser.end.x,9.5);assert.equal(laser.emitters[1].x,9.5);
});

test('Motion, rotating corners, resize clearance and laser paths must all remain in authored air',()=>{
  const cases=[object('press',30,8,{travel:3}),object('spinner',1,1,{length:3}),object('bumper',0,5),object('resize',0,5),object('laser',3,5,{end:{x:12,y:5}})];
  for(const o of cases){const draft=part();draft.objects=[o];if(o.type==='laser')draft.grid[5]='б'.repeat(7)+'а'+'б'.repeat(24);assert.match(validatePartObjects(draft).errors.join(' '),/воздухе/);assert.throws(()=>compilePartObjects(draft));}
  const draft=part();draft.objects=[object('press',8,8,{w:3,h:1,direction:'N',travel:4})];assert.deepEqual(getPartObjectBounds(compilePartObjects(draft)[0]),{x:8,y:4,w:3,h:5});
});

test('Malformed counts, phases, sizes, duplicate IDs and non-finite parameters are rejected before compilation',()=>{
  for(const o of [object('press',8,8,{travel:Infinity}),object('spinner',8,8,{length:NaN}),object('boost',8,8,{duration:2}),object('slow',8,8,{multiplier:0}),object('resize',8,8,{factor:3}),object('laser',8,8,{end:{x:10,y:10}}),object('breakable-wall',8,8,{w:2,h:2}),object('breakable-color-block',8,8,{colorSlot:12}),object('breakable-block',8,8,{hits:2}),object('conveyor',8.5,8),object('bumper',8,8,{direction:'NE'})]){
    const draft=part();draft.objects=[o];assert.ok(validatePartObjects(draft).errors.length,o.type);assert.equal(validatePartDraft(draft).valid,false);
  }
  const draft=part(),a=object('conveyor');draft.objects=[a,{...a,x:10}];assert.match(validatePartObjects(draft).errors.join(' '),/идентификатор/);
  draft.objects=Array.from({length:129},(_,i)=>({...a,id:`item-${i}`}));assert.match(validatePartObjects(draft).errors.join(' '),/128/);
});

test('Teleport references are reciprocal, distinct and remain unchanged in every module rotation',()=>{
  const draft=part(),a=object('portal',4,4),b=object('portal',20,20);draft.objects=pair(a,b);assert.deepEqual(validatePartObjects(draft).errors,[]);
  const source=compilePart(draft);for(let turn=0;turn<4;turn++){const modules=instantiateModule(source,turn).mechanisms;assert.equal(modules[0].pair,b.id);assert.equal(modules[1].pair,a.id);}
  b.pair='missing';assert.match(validatePartObjects(draft).errors.join(' '),/взаимно/);
  b.pair=a.id;b.x=a.x;b.y=a.y;assert.match(validatePartObjects(draft).errors.join(' '),/разных клетках/);
});

test('Quarter-turns rotate asymmetric presses, laser emitters and spinner initial angles physically',()=>{
  const draft=part();draft.objects=[object('press',5,9,{w:3,h:1,direction:'N',travel:5}),object('laser',4,4,{end:{x:4,y:8}}),object('spinner',20,20,{phase:.3})];
  const source=compilePart(draft),original=source.mechanisms;
  for(let turns=0;turns<4;turns++){
    const m=instantiateModule(source,turns).mechanisms;
    for(let i=0;i<m.length;i++){const point=rotatePoint(original[i].x,original[i].y,turns,32,32);near(m[i].x,point.x);near(m[i].y,point.y);near(m[i].w,turns%2?original[i].h:original[i].w);near(m[i].h,turns%2?original[i].w:original[i].h);}
    const expectedDirection=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}][turns];assert.deepEqual({x:m[0].dx,y:m[0].dy},expectedDirection);
    assert.deepEqual(m[1].emitters,original[1].emitters.map(p=>rotatePoint(p.x,p.y,turns,32,32)));
    near(Math.cos(m[2].phase),Math.cos(.3+turns*Math.PI/2));near(Math.sin(m[2].phase),Math.sin(.3+turns*Math.PI/2));
  }
  const before=instantiateModule(source,1);source.mechanisms[0].travel=8;assert.notEqual(instantiateModule(source,1),before);assert.equal(instantiateModule(source,1).mechanisms[0].travel,8);
});

test('An editor spinner direction contributes its initial physical angle exactly once',()=>{
  const draft=part();draft.objects=[object('spinner',8,8,{direction:'S',phase:0})];
  const source=compilePart(draft);near(source.mechanisms[0].phase,Math.PI/2);
  for(let turns=0;turns<4;turns++){
    const actual=instantiateModule(source,turns).mechanisms[0].phase,expected=Math.PI/2+turns*Math.PI/2;
    near(Math.cos(actual),Math.cos(expected));near(Math.sin(actual),Math.sin(expected));
  }
  for(const [direction,angle]of [['E',0],['S',Math.PI/2],['W',Math.PI],['N',-Math.PI/2]]){
    draft.objects[0].direction=direction;draft.objects[0].phase=.3;const phase=compilePartObjects(draft)[0].phase;
    near(Math.cos(phase),Math.cos(.3+angle));near(Math.sin(phase),Math.sin(.3+angle));
  }
});

test('Extra wall-start cells preserve the primary source and rotate their contact-only launch direction',()=>{
  const draft=part(),primary=structuredClone(draft.wallStart);
  draft.objects=[object('wall-start',0,0,{direction:'S'}),object('wall-start',15,12,{direction:'W'})];
  assert.deepEqual(validatePartObjects(draft).errors,[]);assert.deepEqual(draft.wallStart,primary);
  const source=compilePart(draft),start=source.mechanisms[0];assert.equal(start.type,'wall-start');assert.equal(start.w,1);assert.equal(start.h,1);assert.deepEqual({x:start.dx,y:start.dy},{x:0,y:1});
  assert.deepEqual(getPartObjectBounds(start),{x:0,y:0,w:1,h:1});assert.equal('timer' in start,false);assert.equal('startTime' in start,false);
  const turned=instantiateModule(source,1).mechanisms[0];assert.deepEqual({x:turned.dx,y:turned.dy},{x:-1,y:0});assert.equal(turned.direction,'W');
  assert.deepEqual(parsePartLibrary(serializePartLibrary([draft]))[0].objects,draft.objects);
  draft.objects[0].w=2;assert.match(validatePartObjects(draft).errors.join(' '),/одной клеткой/);
  draft.objects[0].w=1;draft.grid[0]='а'+'б'.repeat(31);assert.match(validatePartObjects(draft).errors.join(' '),/воздухе/);
});

test('Coincident mechanism areas produce a warning while permanent physics fields stay cosmetic-free',()=>{
  const draft=part();draft.objects=[object('boost',8,8),object('conveyor',8,8,{w:3,h:2})];assert.equal(validatePartObjects(draft).errors.length,0);assert.ok(validatePartObjects(draft).warnings.length);
  const color=object('breakable-color-wall',12,12,{w:1,h:5,hits:7,colorSlot:3});draft.objects=[color];const [spec]=compilePartObjects(draft);assert.equal(spec.x,12.5);assert.equal(spec.y,14.5);assert.equal(spec.hits,7);assert.equal(spec.colorSlot,3);
});
