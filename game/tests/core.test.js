import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,validateMap} from '../src/map.js';
import {Race} from '../src/race.js';
import {Physics,Body,Bodies,Composite} from '../src/physics.js';
import {U,SIZES,BASE_SPEED} from '../src/config.js';
import {Prediction} from '../src/prediction.js';
import {freshProfile,award,pack,unpack} from '../src/save.js';
import {purchase,equip} from '../src/shop.js';

test('300 procedural maps: repeatable seeds, connected bidirectional ports, correct section counts',()=>{
  for(const size of Object.keys(SIZES))for(let n=0;n<100;n++){const a=generateMap(`test-${n}`,size),b=generateMap(`test-${n}`,size);assert.deepEqual(a,b);assert.ok(validateMap(a));assert.ok(a.rooms.length>=SIZES[size].min&&a.rooms.length<=SIZES[size].max);}
});
test('Prediction has an inclusive 5.1s boundary and cannot rescue a dead favorite after 5s',()=>{
  const p=new Prediction(),cubes=[{id:1,alive:true},{id:2,alive:true}];assert.ok(p.select(1,0,cubes));assert.ok(p.select(2,5.1,cubes));assert.ok(!p.select(1,5.100001,cubes));
  const q=new Prediction();q.select(1,0,cubes);cubes[0].alive=false;assert.ok(q.select(2,4.99,cubes));q.selected=1;q.update(5.01,cubes);assert.ok(!q.select(2,5.1,cubes));assert.ok(!p.select(1,1,cubes,true));
});
test('Square bodies remain unrotated; repeated wall bounces preserve bounded baseline speed',()=>{
  const physics=new Physics({walls:[{x:0,y:0,w:U,h:10*U},{x:10*U,y:0,w:U,h:10*U}]});const c=physics.addCube(1,4*U,0,'#123456',{x:BASE_SPEED,y:0});
  for(let i=0;i<3000;i++){physics.normalize(c,i/120);physics.step();assert.ok(c.body.position.x>U*.8&&c.body.position.x<9.2*U);assert.ok(Math.abs(c.body.angle)<.0001);assert.ok(Math.hypot(c.body.velocity.x,c.body.velocity.y)<BASE_SPEED+0.1);}
  physics.destroy();
});
test('Stationary cubes receive no artificial kick',()=>{const p=new Physics({walls:[]}),c=p.addCube(1,0,0,'#fff',{x:0,y:0});for(let i=0;i<100;i++){p.normalize(c,i/120);p.step();}assert.equal(c.body.position.x,0);assert.equal(c.body.position.y,0);p.destroy();});
test('Moving wall contact does not kill; actual closing gap does',()=>{
  const p=new Physics({walls:[{x:4*U,y:0,w:U,h:6*U}]}),c=p.addCube(1,2*U,0,'#123456',{x:0,y:0});
  const wall=Bodies.rectangle(U,0,U,6*U,{isStatic:true});wall.plugin={crush:true,motion:{x:1,y:0}};p.addMoving(wall);p.checkCrush(c,1);assert.ok(c.alive);
  Body.setPosition(wall,{x:2.6*U,y:0});Body.setPosition(c.body,{x:3.05*U,y:0});p.checkCrush(c,2);assert.ok(!c.alive);assert.equal(c.reason,'Раздавлен');p.destroy();
});
test('Partial finish intersection is insufficient; whole cube must enter',()=>{
  const map=generateMap('finish','small');map.mechanisms=[];const r=new Race(map,2);r.select(1);r.start();
  for(const c of r.cubes)Body.setVelocity(c.body,{x:0,y:0});const c=r.cubes[0],f=map.finish;Body.setPosition(c.body,{x:f.x+U*.25,y:f.y+2*U});r.step();assert.ok(!r.finished);Body.setPosition(c.body,{x:f.x+U,y:f.y+2*U});r.step();assert.equal(r.winner,1);r.destroy();
});
test('Batched simultaneous deaths elect a last-death candidate, not a transient survivor',()=>{
  const r=new Race(generateMap('deaths'),3);r.select(1);r.start();for(const c of r.cubes)r.physics.kill(c,1,'test');r.step();assert.ok(r.finished);assert.equal(r.finishReason,'last');assert.ok([1,2,3].includes(r.winner));r.destroy();
});
test('Save roundtrip preserves simulation effects, mechanism phases, PRNG and one-use size objects',()=>{
  const r=new Race(generateMap('restore','medium'),12);r.select(3);r.start();for(let i=0;i<240;i++)r.step();const c=r.cubes[0];c.boostUntil=3;c.usedResize=['already-used'];
  const snapshot=r.snapshot(),restored=new Race(snapshot.map,snapshot.count,undefined,null,snapshot);assert.equal(restored.time,r.time);assert.equal(restored.rng.state,r.rng.state);assert.ok(restored.paused);assert.equal(restored.prediction.selected,3);assert.deepEqual(restored.cubes[0].usedResize,['already-used']);
  for(let i=0;i<12;i++){assert.ok(Math.hypot(restored.cubes[i].body.position.x-r.cubes[i].body.position.x,restored.cubes[i].body.position.y-r.cubes[i].body.position.y)<1e-8);assert.ok(Math.abs(restored.cubes[i].body.velocity.x-r.cubes[i].body.velocity.x)<1e-8);}
  r.destroy();restored.destroy();
});
test('Rewards and statistics are idempotent; unfinished races never count',()=>{
  const p=freshProfile(),r=new Race(generateMap('award'),12);r.select(1);assert.ok(!award(p,r));r.finish(r.cubes[0],'finish');assert.ok(award(p,r));assert.ok(!award(p,r));assert.equal(p.coins,1440);assert.equal(p.stats.races,1);assert.equal(p.stats.correct,1);assert.equal(p.stats.maxReward,1440);assert.equal(p.stats.recent.length,1);r.destroy();
});
test('Integrity detects modifications and future game versions are rejected',()=>{
  const p=freshProfile(),data=pack(p);assert.deepEqual(unpack(data).profile,p);const bad=structuredClone(data);bad.profile.coins=999;assert.throws(()=>unpack(bad),/целостность/);const future={...data,gameVersion:'99.0.0'};assert.throws(()=>unpack(future),/новой версией/);assert.equal(Object.keys(data)[0],'gameVersion');
});
test('Cosmetics debit once, never allow debt, and only affect appearance',()=>{const p=freshProfile();assert.ok(!purchase(p,'night'));p.coins=500;assert.ok(purchase(p,'blueprint'));assert.equal(p.coins,0);assert.ok(!purchase(p,'blueprint'));assert.ok(equip(p,'blueprint'));assert.equal(p.equipped.theme,'paper');assert.ok(!equip(p,'gold'));});
