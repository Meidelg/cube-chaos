import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics,Body} from '../src/physics.js';
import {Mechanisms} from '../src/mechanisms.js';
import {BASE_SPEED,U} from '../src/config.js';
const flat=mechanisms=>({size:'small',walls:[],mechanisms,rooms:[{id:0,wx:0,wy:0,exit:{x:1,y:0},wallStart:0}]});
test('Impulse starts decaying immediately and returns to baseline after one game second',()=>{
  const map=flat([{id:'boost',type:'boost',x:0,y:0,w:100,h:100,roomId:0,multiplier:2}]),p=new Physics(map),m=new Mechanisms(map,p),c=p.addCube(1,0,0,'#123456',{x:BASE_SPEED,y:0});
  m.apply(c,0);assert.ok(Math.abs(c.body.velocity.x-BASE_SPEED*2)<1e-8);m.apply(c,.5);assert.ok(Math.abs(c.body.velocity.x-BASE_SPEED*1.5)<1e-8);m.apply(c,1);assert.ok(Math.abs(c.body.velocity.x-BASE_SPEED)<1e-8);p.destroy();
});
test('Conveyor adds a sideways component without replacing the cube velocity',()=>{
  const map=flat([{id:'belt',type:'conveyor',x:0,y:0,w:100,h:100,roomId:0,dx:0,dy:1}]),p=new Physics(map),m=new Mechanisms(map,p),c=p.addCube(1,0,0,'#123456',{x:BASE_SPEED,y:0});m.apply(c,0);assert.ok(Math.abs(c.body.velocity.x-BASE_SPEED)<1e-8);assert.ok(c.body.velocity.y>.8);m.apply(c,.1);assert.ok(Math.abs(c.body.velocity.x-BASE_SPEED)<1e-8);assert.ok(Math.abs(c.body.velocity.y-.9)<1e-8);p.destroy();
});
test('Paired portals preserve speed and prevent immediate return teleportation',()=>{
  const map=flat([{id:'a',pair:'b',type:'portal',x:0,y:0,w:48,h:48,roomId:0},{id:'b',pair:'a',type:'portal',x:200,y:0,w:48,h:48,roomId:0}]),p=new Physics(map),m=new Mechanisms(map,p),c=p.addCube(1,0,0,'#123456',{x:BASE_SPEED,y:0});m.apply(c,0);assert.equal(c.body.position.x,200);assert.ok(Math.abs(c.body.velocity.x-BASE_SPEED)<1e-8);m.apply(c,.1);assert.equal(c.body.position.x,200);assert.equal(c.portalUntil,1);p.destroy();
});
test('Resize is per cube and object, preserves mass, and cannot reactivate on re-entry',()=>{
  const map=flat([{id:'size',type:'resize',x:0,y:0,w:U,h:U,roomId:0}]),p=new Physics(map),m=new Mechanisms(map,p),c=p.addCube(1,0,0,'#123456',{x:0,y:0});m.apply(c,0);assert.equal(c.size,2);assert.equal(c.body.mass,1);Body.setPosition(c.body,{x:200,y:0});m.apply(c,.1);Body.setPosition(c.body,{x:0,y:0});m.apply(c,.2);assert.equal(c.size,2);const other=p.addCube(2,0,0,'#654321',{x:0,y:0});m.apply(other,.3);assert.equal(other.size,2);p.destroy();
});
