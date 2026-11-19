import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,validateMap} from '../src/map.js';
import {Physics} from '../src/physics.js';
import {U,BASE_SPEED,STEP} from '../src/config.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
function corridor(id,entryWidth,exitWidth,{entryY=3,exitY=3,height=8}={}){
  return{id,name:id,enabled:true,grid:Array(height).fill('б'.repeat(8)),entry:{x:0,y:entryY,side:'W',width:entryWidth},exit:{x:7,y:exitY,side:'E',width:exitWidth},wallStart:{x:0,y:entryY,direction:'E'},objects:[]};
}
const narrow=()=>corridor('center-narrow',1,1);
const wide=()=>corridor('center-wide',1,3,{exitY:2});
function shiftBetween(port,peer){return(port.direction.x?peer.y-port.y:peer.x-port.x)/U;}
function candidateBox(child,port,peer,shift){const amount=(shift-shiftBetween(port,peer))*U;return{x:child.wx+(port.direction.y?amount:0),y:child.wy+(port.direction.x?amount:0),w:child.width,h:child.height};}
function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function blockers(map,child,box){return map.rooms.filter(room=>room.id<child.id&&overlaps(box,{x:room.wx,y:room.wy,w:room.width,h:room.height}));}
function seams(map,sourceId,targetId){
  const result=[];for(const parent of map.rooms.filter(room=>room.module===`custom:${sourceId}`)){
    const port=parent.ports.find(p=>p.id==='out'),child=map.rooms[port.link];if(child?.module!==`custom:${targetId}`||child.id<=parent.id)continue;
    result.push({parent,port,child,peer:child.ports.find(p=>p.link===parent.id)});
  }return result;
}

test('Center priority: unobstructed horizontal and vertical real 3→1 connections choose zero center displacement',()=>{
  const turn={id:'center-turn',name:'Поворот',enabled:true,grid:Array(8).fill('б'.repeat(8)),entry:{x:0,y:6,side:'W',width:1},exit:{x:2,y:0,side:'N',width:3},wallStart:{x:0,y:6,direction:'E'},objects:[]},axes=new Set();let inspected=0;
  for(const source of [wide(),turn])for(let seed=0;seed<24;seed++){
    const map=generateMap(`center-free-${seed}`,'medium',[source,narrow()]);
    for(const seam of seams(map,source.id,'center-narrow')){
      const {port,peer,child}=seam,centered=candidateBox(child,port,peer,0);
      if(blockers(map,child,centered).length)continue;
      near(shiftBetween(port,peer),0);assert.equal(port.connection.width,U);axes.add(port.direction.x?'horizontal':'vertical');inspected++;
    }
  }
  assert.ok(inspected>10);assert.deepEqual([...axes].sort(),['horizontal','vertical']);
});

test('Center priority: a centered bbox blocked by the existing start falls back to the nearest free side in actual assembly',()=>{
  const part={id:'center-fallback-turn',name:'Поворот у старта',enabled:true,grid:Array(8).fill('б'.repeat(10)),entry:{x:0,y:3,side:'W',width:1},exit:{x:1,y:0,side:'N',width:3},wallStart:{x:0,y:3,direction:'E'},objects:[]};
  const map=generateMap('center-fallback-1','medium',[part]);assert.equal(validateMap(map),true);
  const parent=map.rooms[1],child=map.rooms[2],port=parent.ports.find(p=>p.id==='out'),peer=child.ports.find(p=>p.link===parent.id);
  assert.equal(parent.module,'custom:center-fallback-turn');assert.equal(child.module,parent.module);assert.equal(port.link,child.id);
  assert.equal(parent.rotation,0);assert.equal(child.rotation,3);assert.deepEqual(port.direction,{x:0,y:-1});
  assert.equal(port.width,3*U);assert.equal(peer.width,U);near(shiftBetween(port,peer),1);
  const centered=candidateBox(child,port,peer,0),start=map.rooms[0];
  assert.ok(blockers(map,child,centered).some(room=>room.id===start.id),'The center must fail against real previously placed geometry');
  near(Math.min(centered.x+centered.w,start.wx+start.width)-Math.max(centered.x,start.wx),U);
  near(Math.min(centered.y+centered.h,start.wy+start.height)-Math.max(centered.y,start.wy),U);
  assert.ok(blockers(map,child,candidateBox(child,port,peer,-1)).some(room=>room.id===0));
  assert.deepEqual(blockers(map,child,candidateBox(child,port,peer,1)),[]);
  const feasible=[-1,0,1].filter(shift=>blockers(map,child,candidateBox(child,port,peer,shift)).length===0);
  assert.deepEqual(feasible,[1]);near(Math.abs(shiftBetween(port,peer)),Math.min(...feasible.map(Math.abs)));
  assert.deepEqual(map,generateMap('center-fallback-1','medium',[clone(part)]));
});

test('Center priority: even/odd 6→3 connections choose a nearest half-cell and keep seeded ties repeatable',()=>{
  const a=corridor('center-even-exit',3,6,{entryY:3,exitY:2,height:10}),b=corridor('center-three-entry',3,3,{height:10}),library=[a,b],before=clone(library),observed=new Set();let inspected=0;
  for(let seed=0;seed<32;seed++){
    const map=generateMap(`center-parity-${seed}`,'medium',library);
    assert.deepEqual(map,generateMap(`center-parity-${seed}`,'medium',library.slice().reverse()));
    for(const{port,peer,child}of seams(map,a.id,b.id)){
      if(blockers(map,child,candidateBox(child,port,peer,-.5)).length||blockers(map,child,candidateBox(child,port,peer,.5)).length)continue;
      const shift=shiftBetween(port,peer);near(Math.abs(shift),.5);assert.equal(port.width,6*U);assert.equal(peer.width,3*U);assert.equal(port.connection.width,3*U);
      observed.add(shift);inspected++;
    }
  }
  assert.ok(inspected>10);assert.deepEqual([...observed].sort((a,b)=>a-b),[-.5,.5]);assert.deepEqual(library,before);
});

test('Center priority: a centered one-cell physical seam preserves authored scale and passes a real full-size cube',()=>{
  let match,map;for(let seed=0;seed<24&&!match;seed++){map=generateMap(`center-body-${seed}`,'medium',[wide(),narrow()]);match=seams(map,'center-wide','center-narrow').find(seam=>seam.port.direction.x===1&&Math.abs(shiftBetween(seam.port,seam.peer))<1e-7);}
  assert.ok(match);const{port}=match,physics=new Physics(map),cube=physics.addCube(1,port.x-1.5*U,port.y,'#6078ed',{x:BASE_SPEED,y:0});
  try{
    assert.equal(port.width,3*U);assert.equal(port.connection.width,U);let passed=false;
    for(let tick=1;tick<=120;tick++){
      physics.normalize(cube,tick*STEP/1000);physics.step();const vertices=cube.body.vertices;
      near(Math.max(...vertices.map(v=>v.x))-Math.min(...vertices.map(v=>v.x)),U);near(Math.max(...vertices.map(v=>v.y))-Math.min(...vertices.map(v=>v.y)),U);
      assert.equal(cube.size,1);assert.equal(cube.body.angle,0);
      if(Math.min(...vertices.map(v=>v.x))>port.x+U){passed=true;break;}
    }
    assert.equal(passed,true);
  }finally{physics.destroy();}
});
