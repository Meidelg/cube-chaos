import test from 'node:test';
import assert from 'node:assert/strict';
import {drawCube,darkerColor,madEyeAppearance,SKIN_IDS} from '../src/cube-cosmetics.js';
import {U} from '../src/config.js';

class Recorder {
  constructor(){this.commands=[];}
  record(type,args){this.commands.push({type,args});return this;}
  rect(...args){return this.record('rect',args);}
  circle(...args){return this.record('circle',args);}
  fill(...args){return this.record('fill',args);}
  stroke(...args){return this.record('stroke',args);}
  moveTo(...args){return this.record('moveTo',args);}
  lineTo(...args){return this.record('lineTo',args);}
}
const cube=Object.freeze({id:3,size:1,color:'#80a0c0',body:Object.freeze({position:Object.freeze({x:300,y:200}),velocity:Object.freeze({x:2,y:-3})})});

test('Every cube cosmetic draws only vector appearance and preserves the physics object',()=>{
  const original=JSON.stringify(cube);
  for(const skin of SKIN_IDS){const g=new Recorder();drawCube(g,cube,skin,{time:12,raceId:'visual-race'});assert.ok(g.commands.some(c=>c.type==='fill'));assert.equal(JSON.stringify(cube),original);}
});
test('White and colored outlines use the outer body edge; colored outline remains darker than its participant',()=>{
  for(const [skin,expected]of [['outline',0xffffff],['colored-outline',darkerColor(cube.color)]]){
    const g=new Recorder();drawCube(g,cube,skin);assert.deepEqual(g.commands[0],{type:'rect',args:[-U/2,-U/2,U,U]});
    const edge=g.commands.find(c=>c.type==='stroke').args[0];assert.equal(edge.color,expected);assert.ok(edge.width>=1.5);
  }
  const dark=darkerColor(cube.color);
  for(const [value,original]of [[(dark>>16)&255,0x80],[(dark>>8)&255,0xa0],[dark&255,0xc0]])assert.ok(value<original&&value>original*.7,'Colored outline should be only slightly darker, not nearly black');
});
test('Black eyes invert eye and pupil contrast; stripes are translucent black',()=>{
  const black=new Recorder();drawCube(black,cube,'black-eyes');const fills=black.commands.filter(c=>c.type==='fill').map(c=>c.args[0]);
  assert.equal(fills[1].color,0x10141b);assert.equal(fills[2].color,0xffffff);assert.equal(fills[3].color,0x10141b);assert.equal(fills[4].color,0xffffff);
  const stripe=new Recorder();drawCube(stripe,cube,'stripe');const stripes=stripe.commands.filter(c=>c.type==='fill'&&c.args[0].color===0x000000);
  assert.equal(stripes.length,3);for(const s of stripes)assert.ok(s.args[0].alpha>0&&s.args[0].alpha<1);
});
test('Round skin changes the body silhouette to a circle while its eye corners stay inside',()=>{
  const g=new Recorder();drawCube(g,cube,'round');assert.deepEqual(g.commands[0],{type:'circle',args:[0,0,U/2]});
  for(const c of g.commands.filter(c=>c.type==='rect')){const[x,y,w,h]=c.args;for(const[dx,dy]of [[0,0],[w,0],[0,h],[w,h]])assert.ok(Math.hypot(x+dx,y+dy)<U/2);}
  assert.equal(cube.body.position.x,300);assert.equal(cube.body.velocity.y,-3);
});
test('Mad eye appearance is deterministic per race/cube and requires no gameplay randomness',()=>{
  const before=madEyeAppearance('race-a',3);assert.deepEqual(madEyeAppearance('race-a',3),before);assert.notDeepEqual(madEyeAppearance('race-a',4),before);assert.notDeepEqual(madEyeAppearance('race-b',3),before);
  const a=new Recorder(),b=new Recorder();drawCube(a,cube,'mad',{time:1,raceId:'race-a'});drawCube(b,cube,'mad',{time:500,raceId:'race-a'});assert.deepEqual(a.commands,b.commands);
});
test('Ghost drawing can translate and fade the same fixed-size skin without changing its geometry',()=>{
  const g=new Recorder();drawCube(g,cube,'round',{x:100,y:200,alpha:.25});assert.deepEqual(g.commands[0],{type:'circle',args:[100,200,U/2]});
  for(const fill of g.commands.filter(c=>c.type==='fill'))assert.equal(fill.args[0].alpha,.25);
});
