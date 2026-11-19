import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDraft} from '../src/part-library.js';
import {createPartObject} from '../src/part-objects.js';
import {createPartPreview} from '../src/map.js';
import {Race} from '../src/race.js';
import {U} from '../src/config.js';
import {Body} from '../src/physics.js';

test('Preparation renders authored spinner, press and laser at their initial phase before time advances',()=>{
  const draft=createPartDraft(12,12);draft.grid=Array(12).fill('б'.repeat(12));
  draft.objects=[createPartObject('spinner',{x:4,y:4},{id:'spinner',phase:Math.PI/2}),createPartObject('press',{x:4,y:8},{id:'press',phase:Math.PI,travel:2}),createPartObject('laser',{x:7,y:2},{id:'laser',end:{x:10,y:2},phase:0})];
  const race=new Race(createPartPreview(draft),2);
  try{
    const spinner=race.mechanisms.items.find(m=>m.type==='spinner'),press=race.mechanisms.items.find(m=>m.type==='press'),laser=race.mechanisms.items.find(m=>m.type==='laser');
    assert.equal(race.ticks,0);assert.equal(race.started,false);
    assert.ok(Math.abs(spinner.body.angle-spinner.phase)<1e-8);
    assert.ok(Math.abs(press.body.position.x-(press.x+press.dx*press.travel*U))<1e-8);
    assert.ok(Math.abs(press.body.position.y-(press.y+press.dy*press.travel*U))<1e-8);
    assert.equal(laser.active,true);assert.equal(race.mechanisms.wallActive,false);
  }finally{race.destroy();}
});

test('The entire active laser emitter cell is lethal; the same cell is traversable when switched off',()=>{
  for(const active of [true,false]){
    const draft=createPartDraft(12,12);draft.grid=Array(12).fill('б'.repeat(12));draft.objects=[createPartObject('laser',{x:4,y:4},{id:'laser',end:{x:8,y:4}})];
    const race=new Race(createPartPreview(draft),2);
    try{
      const laser=race.mechanisms.items.find(m=>m.type==='laser'),emitter=laser.emitters[0],cube=race.cubes[0],time=active?0:2;
      race.mechanisms.update(time,0);
      // Contact only the corner of the 1×1 emitter, outside the thin beam.
      const horizontal=laser.w>=laser.h;
      const position={x:emitter.x+(horizontal?0:.85*U),y:emitter.y+(horizontal?.85*U:0)};
      const {body}=cube;
      Body.setPosition(body,position);Body.setVelocity(body,{x:0,y:0});
      race.mechanisms.apply(cube,time);
      assert.equal(cube.alive,!active);
    }finally{race.destroy();}
  }
});
