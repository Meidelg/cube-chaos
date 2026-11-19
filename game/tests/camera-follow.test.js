import test from 'node:test';
import assert from 'node:assert/strict';
import {Camera} from '../src/camera.js';
import {chooseFollowTarget} from '../src/camera-follow.js';
import {generateMap} from '../src/map.js';
import {Race} from '../src/race.js';
import {Body} from '../src/physics.js';
import {U} from '../src/config.js';
import {Game} from '../src/game.js';

function harness(size={w:390,h:420}){
 const handlers=new Map(),transform={},events=[],taps=[];
 const element={addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0})};
 const world={scale:{set:z=>transform.zoom=z},position:{set:(x,y)=>Object.assign(transform,{x,y})}};
 const camera=new Camera(element,world,()=>size,p=>taps.push(p),(...e)=>events.push(e));camera.setMap({width:12000,height:6000});
 const point=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,target:element});
 return{camera,handlers,events,taps,transform,size,point};
}
function raceFor(t){const race=new Race(generateMap('camera-follow-real','medium'),3);t.after(()=>race.destroy());for(const c of race.cubes)Body.setPosition(c.body,race.map.start);return race;}
function atFinish(race,cube){Body.setPosition(cube.body,{x:race.map.finish.x+race.map.finish.w/2,y:race.map.finish.y+race.map.finish.h/2});}

test('Follow targets use the actual route progress, switch live leaders and keep exact ties stable',t=>{
 const race=raceFor(t);atFinish(race,race.cubes[1]);assert.equal(chooseFollowTarget(race,'leader').id,2);
 atFinish(race,race.cubes[2]);assert.equal(chooseFollowTarget(race,'leader',3).id,3);assert.equal(chooseFollowTarget(race,'leader').id,2);
 race.physics.kill(race.cubes[1],0,'test');assert.equal(chooseFollowTarget(race,'leader',2).id,3);
 race.select(1);assert.equal(chooseFollowTarget(race,'selected').id,1);assert.equal(race.prediction.selected,1);
});

test('Selected follow remains on the forecast after another participant wins and stops for a dead losing favorite',t=>{
 const race=raceFor(t);race.select(1);race.finish(race.cubes[1],'finish');
 assert.equal(chooseFollowTarget(race,'selected').id,1);assert.equal(chooseFollowTarget(race,'leader').id,2);
 race.physics.kill(race.cubes[0],0,'test');assert.equal(chooseFollowTarget(race,'selected'),null);
 race.winner=1;assert.equal(chooseFollowTarget(race,'selected').id,1);assert.equal(chooseFollowTarget(race,'leader').id,1);
});

test('Camera snaps on activation, keeps a readable zoom and eases at real time without moving the race',t=>{
 const race=raceFor(t),{camera}=harness();race.select(1);Body.setPosition(race.cubes[0].body,{x:500,y:500});
 const before=race.snapshot();camera.setFollow('selected');camera.updateFollow(race,0);
 assert.equal(camera.followTargetId,1);assert.ok(camera.zoom>=.5);assert.ok(Math.abs(500*camera.zoom+camera.x-195)<1e-7);
 Body.setPosition(race.cubes[0].body,{x:520,y:500});const unchanged=race.snapshot(),oldX=camera.x;camera.updateFollow(race,16);
 assert.ok(camera.x<oldX);assert.ok(camera.x>195-520*camera.zoom);assert.deepEqual(race.snapshot(),unchanged);assert.equal(before.prediction.selected,race.prediction.selected);
 race.physics.kill(race.cubes[0],0,'test');camera.updateFollow(race,16);assert.equal(camera.followMode,'manual');
});

test('Fast x8 travel stays in the central viewport and a teleported cube is caught immediately',()=>{
 const {camera,size}=harness(),cube={id:1,alive:true,size:1,body:{position:{x:1000,y:1000}}},race={prediction:{selected:1},cubes:[cube],finished:false};
 camera.setFollow('selected');camera.updateFollow(race,0);
 for(let i=0;i<80;i++){cube.body.position.x+=210*8/60;camera.updateFollow(race,1000/60);const x=cube.body.position.x*camera.zoom+camera.x;assert.ok(x>=size.w*.2-1e-7&&x<=size.w*.8+1e-7);}
 cube.body.position={x:9000,y:4000};camera.updateFollow(race,16);assert.ok(Math.abs(cube.body.position.x*camera.zoom+camera.x-size.w/2)<1e-7);
});

test('Taps and zoom preserve tracking; a real drag, fit and a new map restore manual mode',()=>{
 const h=harness(),{camera,handlers,point}=h;camera.setFollow('leader');
 handlers.get('pointerdown')(point(1,100,100));handlers.get('pointerup')(point(1,100,100));assert.equal(h.taps.length,1);assert.equal(camera.followMode,'leader');
 handlers.get('wheel')({preventDefault(){},clientX:100,clientY:100,deltaY:-20});assert.equal(camera.followMode,'leader');
 handlers.get('pointerdown')(point(1,100,100));handlers.get('pointerdown')(point(2,200,100));handlers.get('pointermove')(point(2,220,100));handlers.get('pointerup')(point(2,220,100));handlers.get('pointerup')(point(1,100,100));assert.equal(camera.followMode,'leader');assert.equal(h.taps.length,1);
 handlers.get('pointerdown')(point(1,100,100));handlers.get('pointermove')(point(1,106,100));handlers.get('pointerup')(point(1,106,100));assert.equal(camera.followMode,'manual');assert.equal(h.taps.length,1);
 camera.setFollow('selected');camera.fit();assert.equal(camera.followMode,'manual');camera.setFollow('leader');camera.setMap({width:1000,height:1000});assert.equal(camera.followMode,'manual');
});

test('Following remains finite through a hidden viewport, portrait/landscape resizing and map boundaries',()=>{
 const h=harness(),{camera,size}=h,cube={id:1,alive:true,size:2,body:{position:{x:24,y:24}}},race={prediction:{selected:1},cubes:[cube]};
 camera.setFollow('selected');Object.assign(size,{w:0,h:0});camera.updateFollow(race,16);assert.ok(Number.isFinite(camera.zoom));
 for(const v of [{w:390,h:420},{w:844,h:220}]){Object.assign(size,v);camera.updateFollow(race,16);assert.ok(Number.isFinite(camera.x)&&Number.isFinite(camera.y));assert.ok(camera.x<=60&&camera.y<=60);}
});

test('Game camera buttons toggle modes without changing the forecast or any simulation state',async t=>{
 const race=raceFor(t),{camera}=harness();race.select(1);atFinish(race,race.cubes[1]);const game=Object.create(Game.prototype),updates=[];
 game.race=race;game.renderer={camera,draw:dt=>camera.updateFollow(race,dt)};game.ui={toast(){},cameraFollow:(...args)=>updates.push(args)};
 const before=race.snapshot();await game.action('follow-selected');assert.equal(camera.followMode,'selected');assert.equal(camera.followTargetId,1);
 await game.action('follow-leader');assert.equal(camera.followMode,'leader');assert.equal(camera.followTargetId,2);assert.equal(race.prediction.selected,1);
 await game.action('follow-leader');assert.equal(camera.followMode,'manual');assert.deepEqual(race.snapshot(),before);assert.ok(updates.length>=3);
});

test('Eight fixed physics steps per draw and a paused race remain unaffected by camera following',t=>{
 const race=raceFor(t),{camera}=harness();race.select(1);race.start();camera.setFollow('leader');
 for(let frame=0;frame<16&&!race.finished;frame++){for(let i=0;i<8&&!race.finished;i++)race.step();const before=race.snapshot();camera.updateFollow(race,16);assert.deepEqual(race.snapshot(),before);}
 race.paused=true;const paused=race.snapshot();race.step();camera.updateFollow(race,16);assert.deepEqual(race.snapshot(),paused);
});

test('Applying cosmetics to the same real Pixi race preserves following, zoom and forecast',async t=>{
 const [{Container,Graphics},{Renderer},{freshProfile}]=await Promise.all([import('pixi.js'),import('../src/renderer.js'),import('../src/save.js')]);
 const race=raceFor(t),renderer=new Renderer();race.select(1);renderer.world=new Container();renderer.app={renderer:{background:{}}};
 for(const k of ['floor','effects','frontLayer','wallLayer','mechanismLayer','debugLayer'])renderer[k]=new Graphics();
 for(const k of ['decor','mechanismLabels','cubeLayer'])renderer[k]=new Container();
 renderer.world.addChild(renderer.floor,renderer.decor,renderer.effects,renderer.mechanismLayer,renderer.mechanismLabels,renderer.frontLayer,renderer.wallLayer,renderer.cubeLayer,renderer.debugLayer);
 renderer.camera=new Camera({addEventListener(){}},renderer.world,()=>({w:390,h:420}),()=>{});t.after(()=>renderer.world.destroy({children:true}));
 const profile=freshProfile();renderer.setRace(race,profile.equipped,profile.settings);renderer.camera.setFollow('selected');renderer.draw(0);
 const before={zoom:renderer.camera.zoom,x:renderer.camera.x,y:renderer.camera.y,snapshot:race.snapshot()};
 renderer.setRace(race,{...profile.equipped,theme:'night'},profile.settings);
 assert.equal(renderer.camera.followMode,'selected');assert.equal(renderer.camera.followTargetId,1);
 assert.equal(renderer.camera.zoom,before.zoom);assert.equal(renderer.camera.x,before.x);assert.equal(renderer.camera.y,before.y);assert.deepEqual(race.snapshot(),before.snapshot);
});
