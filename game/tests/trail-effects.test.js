import test from 'node:test';
import assert from 'node:assert/strict';
import {Container} from 'pixi.js';
import {TrailEffects,segmentCoveredByRectangles,pursuitRectangles} from '../src/trail-effects.js';
import {U} from '../src/config.js';

class Recorder {
  constructor(){this.commands=[];}
  add(type,args){this.commands.push({type,args});return this;}
  clear(){this.commands=[];return this;}
  moveTo(...args){return this.add('moveTo',args);}lineTo(...args){return this.add('lineTo',args);}
  stroke(...args){return this.add('stroke',args);}poly(...args){return this.add('poly',args);}
  fill(...args){return this.add('fill',args);}circle(...args){return this.add('circle',args);}rect(...args){return this.add('rect',args);}
}
function fixture(trail='line',target=null){
  const cube={id:1,size:1,color:'#6078ed',alive:true,portalUntil:0,body:{position:{x:0,y:0}},trail:['physics-owned-sentinel']};
  const race={id:'trail-test',time:0,started:true,paused:false,finished:false,cubes:[cube],mechanisms:{fronts:[]},rng:{state:42,next:()=>{throw Error('Visuals may not use gameplay randomness');}}};
  const effects=new TrailEffects(target);effects.setRace(race,{trail,skin:'skin-classic'},{});
  const move=(x,y,time)=>{cube.body.position={x,y};race.time=time;effects.update(16);};
  return{cube,race,effects,move};
}
function wall(x,y,w,h){return{body:{vertices:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],bounds:{min:{x:x-100,y:y-100},max:{x:x+w+100,y:y+h+100}}}};}

test('Union coverage examines the whole segment, including gaps between covered endpoints',()=>{
  const a={x:0,y:0},b={x:10,y:0};
  assert.equal(segmentCoveredByRectangles(a,b,[{x:-1,y:-2,w:4,h:4},{x:7,y:-2,w:4,h:4}]),false);
  assert.equal(segmentCoveredByRectangles(a,b,[{x:-1,y:-2,w:6,h:4},{x:5,y:-2,w:6,h:4}]),true);
  assert.equal(segmentCoveredByRectangles(a,b,[{x:-1,y:-2,w:6,h:4},{x:5,y:-2,w:6,h:4}],1),true,'Two adjacent walls can cover the full stroke jointly');
  assert.equal(segmentCoveredByRectangles(a,b,[{x:-1,y:-2,w:6,h:4},{x:5+1e-10,y:-2,w:6,h:4}],1),false,'A real gap must not be erased by a loose geometric epsilon');
});
test('Coverage includes stroke thickness and round end caps instead of only the centreline',()=>{
  const a={x:0,y:0},b={x:10,y:0},thin=[{x:-1,y:-.4,w:12,h:.8}];
  assert.equal(segmentCoveredByRectangles(a,b,thin),true);assert.equal(segmentCoveredByRectangles(a,b,thin,1),false);
  assert.equal(segmentCoveredByRectangles(a,b,[{x:0,y:-2,w:10,h:4}],1),false,'End caps also need cover');
  assert.equal(segmentCoveredByRectangles(a,b,[{x:-1,y:-1,w:12,h:2}],1),true);
  const diagonal=[{x:-1,y:-1,w:6.5,h:6.5},{x:4.5,y:4.5,w:6.5,h:6.5}];
  assert.equal(segmentCoveredByRectangles({x:0,y:0},{x:10,y:10},diagonal,.5),true,'Actual stroke coverage works even when its whole AABB is not covered');
});
test('Pursuit coverage uses physical vertices and never the velocity-expanded broadphase box',()=>{
  const race={mechanisms:{fronts:[wall(1,2,3,4)]}};assert.deepEqual(pursuitRectangles(race),[{minX:1,minY:2,maxX:4,maxY:6}]);
});
test('Permanent lines never age away or evict old turns; collinear points are compressed',()=>{
  const {race,effects,move,cube}=fixture();
  for(let i=1;i<=600;i++)move(i*3,i%2?5:0,i*.02);
  assert.equal(effects.getSegments(1).length,600);const before=effects.getSegments(1);
  race.time=10000;effects.update(60_000);assert.deepEqual(effects.getSegments(1),before);
  effects.setRace(race,{trail:'line',skin:'round'},{lowEffects:true});effects.update(16);assert.deepEqual(effects.getSegments(1),before);
  assert.deepEqual(cube.trail,['physics-owned-sentinel']);assert.equal(race.rng.state,42);effects.destroy();
  const straight=fixture();for(let i=1;i<=1000;i++)straight.move(i*3,0,i*.02);assert.equal(straight.effects.getSegments(1).length,1);assert.equal(straight.effects.getSegments(1)[0].b.x,3000);straight.effects.destroy();
});
test('A partially covered permanent segment remains; complete union cover removes it',()=>{
  const {race,effects,move}=fixture();move(10,0,.1);assert.equal(effects.getSegments(1).length,1);
  race.mechanisms.fronts=[wall(-2,-3,7,6)];race.time=.2;effects.update(16);assert.equal(effects.getSegments(1).length,1);
  race.mechanisms.fronts.push(wall(5,-3,7,6));race.time=.3;effects.update(16);assert.equal(effects.getSegments(1).length,0);effects.destroy();
});
test('A portal breaks the path without deleting earlier permanent history',()=>{
  const {cube,effects,move}=fixture();move(10,0,.1);cube.portalUntil=1.2;move(500,0,.2);move(510,0,.3);
  const segments=effects.getSegments(1);assert.equal(segments.length,2);assert.deepEqual(segments.map(s=>[s.a.x,s.b.x]),[[0,10],[500,510]]);effects.destroy();
});
test('Death clears permanent geometry and race/equipment changes release cached objects',()=>{
  const target=new Container(),{cube,race,effects,move}=fixture('line',target);move(10,0,.1);effects.draw();assert.equal(effects.lineLayer.children.length,1);const graphic=effects.lineLayer.children[0];
  cube.alive=false;effects.update(16);assert.equal(effects.getSegments(1).length,0);assert.equal(effects.lineLayer.children.length,0);assert.ok(graphic.destroyed);
  cube.alive=true;move(20,0,.2);move(30,0,.3);effects.draw();effects.setRace(race,{trail:'trail-classic'},{});assert.equal(effects.lineLayer.children.length,0);assert.equal(effects.getSegments(1).length,0);
  for(let i=0;i<50;i++)effects.setRace({...race,id:`replacement-${i}`},{trail:'line'},{});
  assert.equal(target.children.length,2);effects.destroy();assert.equal(target.children.length,0);
});
test('Cached line chunks are not redrawn when no history or coverage has changed',()=>{
  const target=new Container(),{effects,move}=fixture('line',target);move(10,0,.1);effects.draw();const graphic=effects.lineLayer.children[0];let clears=0;const original=graphic.clear.bind(graphic);graphic.clear=()=>{clears++;return original();};
  effects.draw();effects.draw();assert.equal(clears,0);move(20,0,.2);effects.draw();assert.equal(clears,1);assert.equal(effects.lineLayer.children.length,1);effects.destroy();
});
test('Opaque tail widens toward the newest point; ghost copies fade but keep their captured size',()=>{
  const tail=fixture('tail'),g=new Recorder();tail.move(10,0,.1);tail.move(20,0,.2);tail.effects.draw(g);
  const polygon=g.commands.find(c=>c.type==='poly').args[0];assert.ok(polygon[3]>polygon[1],'Newer/head radius must be wider than the older tail radius');for(const c of g.commands.filter(c=>c.type==='fill'))assert.equal(c.args[0].alpha,1);tail.effects.destroy();
  const ghost=fixture('ghost');ghost.move(10,0,.1);ghost.effects.draw(g);const initial=g.commands.find(c=>c.type==='rect').args;assert.deepEqual(initial,[10-U/2,-U/2,U,U]);
  const alpha=g.commands.find(c=>c.type==='fill').args[0].alpha;assert.equal(alpha,.5);ghost.race.time=.4;ghost.effects.update(16);ghost.effects.draw(g);assert.deepEqual(g.commands.find(c=>c.type==='rect').args,initial);assert.ok(g.commands.find(c=>c.type==='fill').args[0].alpha<alpha);ghost.effects.destroy();
});
test('Pause freezes transient age and all transient histories expire in game time',()=>{
  for(const trail of ['tail','ghost','fire']){
    const {race,effects,move}=fixture(trail);move(10,0,.1);move(20,0,.2);const g=new Recorder();effects.draw(g);const drawing=structuredClone(g.commands);race.paused=true;effects.update(60_000);effects.draw(g);assert.deepEqual(g.commands,drawing);
    race.time=5;effects.update(16);effects.draw(g);assert.equal(g.commands.length,0);assert.equal(effects.states.get(1).samples.length,0);effects.destroy();
  }
});
test('A stationary live cube does not continuously regenerate expired ghost or tail samples',()=>{
  for(const trail of ['tail','ghost','fire']){const {race,effects,move}=fixture(trail);move(10,0,.1);race.time=5;effects.update(16);assert.equal(effects.states.get(1).samples.length,0);effects.destroy();}
});

test('Permanent history survives serialization and resumes without a bridging line across missing history',()=>{
  const first=fixture();first.move(10,0,.1);first.move(10,10,.2);
  const history=JSON.parse(JSON.stringify(first.effects.exportHistory())),saved=first.effects.getSegments(1);
  const next=fixture();next.cube.body.position={x:10,y:10};next.race.time=.2;
  assert.equal(next.effects.importHistory(history),true);assert.deepEqual(next.effects.getSegments(1),saved);
  next.move(20,10,.3);assert.deepEqual(next.effects.getSegments(1).at(-1).a,{x:10,y:10});
  const wrong={...history,raceId:'different-race'};assert.equal(next.effects.importHistory(wrong),false);
  first.effects.destroy();next.effects.destroy();
});
