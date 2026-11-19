import test from 'node:test';
import assert from 'node:assert/strict';
import {Physics,Body,Bodies,Engine} from '../src/physics.js';
import {Mechanisms} from '../src/mechanisms.js';
import {U,BASE_SPEED,STEP} from '../src/config.js';

const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
const normalVelocity=(cube,pair)=>{
  const sign=pair.collision.parentA===cube.body?1:-1,n=pair.collision.normal;
  return(cube.body.velocity.x*n.x+cube.body.velocity.y*n.y)*sign;
};

test('Shallow impacts against all four fixed wall faces reflect instead of sliding inward',()=>{
  for(const normalSpeed of [.005,.05,.2,.5,1,1.5])for(const axis of ['x','y'])for(const sign of [-1,1]){
    const horizontal=axis==='x',wall={x:0,y:0,w:horizontal?U:10000,h:horizontal?10000:U};
    const p=new Physics({walls:[wall]}),tangent=Math.sqrt(BASE_SPEED**2-normalSpeed**2);
    const c=p.addCube(1,horizontal?sign*(U+.25):0,horizontal?0:sign*(U+.25),'#123456',horizontal?{x:-sign*normalSpeed,y:tangent}:{x:tangent,y:-sign*normalSpeed});
    let impact=false;
    try{
      for(let tick=0;tick<500;tick++){
        p.normalize(c,tick*STEP/1000);p.step();
        const pair=p.engine.pairs.list.find(pair=>pair.isActive);if(!pair)continue;impact=true;
        near(c.body.velocity[axis],sign*normalSpeed,`${axis} restitution at normal speed ${normalSpeed}`);
        near(c.body.velocity[horizontal?'y':'x'],tangent,'Tangential velocity must not change');
        near(Math.hypot(c.body.velocity.x,c.body.velocity.y),BASE_SPEED,'Elastic impact energy');break;
      }
      assert.ok(impact,'The real Matter collision must occur');
    }finally{p.destroy();}
  }
});

test('Thousands of fixed-wall and corner impacts keep both normal components reflecting',()=>{
  const p=new Physics({walls:[{x:0,y:5*U,w:U,h:12*U},{x:10*U,y:5*U,w:U,h:12*U},{x:5*U,y:0,w:12*U,h:U},{x:5*U,y:10*U,w:12*U,h:U}]});
  const c=p.addCube(1,5*U,5*U,'#123456',{x:.5,y:Math.sqrt(BASE_SPEED**2-.25)});let contacts=0;
  try{
    for(let tick=0;tick<24000;tick++){
      p.normalize(c,tick*STEP/1000);const before={...c.body.velocity};p.step();
      for(const pair of p.engine.pairs.list)if(pair.isActive){
        contacts++;assert.ok(normalVelocity(c,pair)>=-1e-7,'An elastic cube cannot keep moving into a fixed wall');
      }
      assert.ok(c.body.position.x>U*.8&&c.body.position.x<9.2*U);
      assert.ok(c.body.position.y>U*.8&&c.body.position.y<9.2*U);
      near(Math.abs(c.body.velocity.x),Math.abs(before.x),'Repeated x reflections');near(Math.abs(c.body.velocity.y),Math.abs(before.y),'Repeated y reflections');
    }
    assert.ok(contacts>200,'Exercise a sustained run, not a single bounce');
  }finally{p.destroy();}
});

test('Resting or purely tangential contact does not create a new movement component',()=>{
  for(const vy of [0,BASE_SPEED]){
    const p=new Physics({walls:[{x:0,y:0,w:U,h:10000}]}),c=p.addCube(1,U-.001,0,'#123456',{x:0,y:vy});
    try{for(let tick=0;tick<100;tick++){p.normalize(c,tick/120);p.step();near(c.body.velocity.x,0,'No artificial normal kick');near(c.body.velocity.y,vy,'Original tangent is preserved');}}
    finally{p.destroy();}
  }
});

test('A shallow bounce separates instead of getting trapped in persistent resting contacts',()=>{
  const normal=.005,tangent=Math.sqrt(BASE_SPEED**2-normal**2);
  const p=new Physics({walls:[{x:0,y:0,w:U,h:10000}]}),c=p.addCube(1,U-.001,0,'#123456',{x:-normal,y:tangent});
  let active=0;
  try{
    for(let tick=0;tick<300;tick++){
      p.normalize(c,tick*STEP/1000);p.step();
      active+=p.engine.pairs.list.filter(pair=>pair.isActive).length;
      near(c.body.velocity.x,normal,'Retained contact preserves the outgoing normal');
      near(c.body.velocity.y,tangent,'Retained contact preserves the tangent');
    }
    assert.ok(active>=1,'The real solver contact must occur');
    assert.ok(c.body.position.x>U+.5,'The cube really separates instead of sliding in place');
  }finally{p.destroy();}
});

test('Conveyor contribution reflects once at joined unit walls before the next flow is applied',()=>{
  for(const normal of [.5,2.5])for(const flow of [-.3,.3]){
    const p=new Physics({walls:[{x:0,y:-U/2,w:U,h:U},{x:0,y:U/2,w:U,h:U}]});
    const tangent=Math.sqrt(BASE_SPEED**2-normal**2),conveyor={x:flow,y:.2};
    const c=p.addCube(1,U+.01,0,'#123456',{x:-normal,y:tangent});
    try{
      p.normalize(c,0,conveyor);p.step();
      assert.equal(p.engine.pairs.list.filter(pair=>pair.isActive).length,2,'Both unit blocks participate at the seam');
      near(c.body.velocity.x,normal-flow,'Total incoming normal velocity reflects');
      near(c.conveyor.x,-flow,'The old flow component reflects exactly once');
      near(c.conveyor.y,conveyor.y,'Tangential flow remains unchanged');
      p.normalize(c,STEP/1000,conveyor);
      near(c.body.velocity.x,normal+flow,'The next tick retains the reflected intrinsic velocity');
      near(c.body.velocity.y,tangent+conveyor.y,'The next tick retains the intrinsic tangent');
    }finally{p.destroy();}
  }
});

test('A real closing press remains governed by Matter and can still crush the cube',()=>{
  function fixture(){
    const p=new Physics({walls:[{x:0,y:0,w:U,h:10*U}]}),c=p.addCube(1,U,0,'#123456',{x:-.5,y:0});
    const press=Bodies.rectangle(2*U,0,U,10*U,{isStatic:true,restitution:1,friction:0});press.plugin={crush:true,motion:{x:-4,y:0}};p.addMoving(press);Body.setPosition(press,{x:2*U-4,y:0},true);return{p,c};
  }
  const fixed=fixture(),baseline=fixture();
  try{
    fixed.p.step();Engine.update(baseline.p.engine,STEP);
    near(fixed.c.body.velocity.x,baseline.c.body.velocity.x,'Do not override a constrained moving-mechanism collision');
    near(fixed.c.body.position.x,baseline.c.body.position.x,'Do not teleport out of a legitimate pinch');
    fixed.p.checkCrush(fixed.c,1);assert.equal(fixed.c.alive,false);assert.equal(fixed.c.reason,'Раздавлен');
  }finally{fixed.p.destroy();baseline.p.destroy();}
});

test('A rotating mechanism with a static Matter body keeps the solver response',()=>{
  function fixture(){
    const p=new Physics({walls:[]}),c=p.addCube(1,2.5*U,0,'#123456',{x:-.5,y:0});
    const spinner=Bodies.rectangle(0,0,4*U,U/2,{isStatic:true,restitution:1,friction:0});
    spinner.plugin={motion:{x:0,y:0}};p.addMoving(spinner);Body.setAngle(spinner,.1,true);return{p,c};
  }
  const fixed=fixture(),baseline=fixture();
  try{
    fixed.p.step();Engine.update(baseline.p.engine,STEP);
    assert.ok(fixed.p.engine.pairs.list.some(pair=>pair.isActive),'The rotating body must really collide');
    near(fixed.c.body.velocity.x,baseline.c.body.velocity.x,'Preserve angular contact x response');
    near(fixed.c.body.velocity.y,baseline.c.body.velocity.y,'Preserve angular contact y response');
  }finally{fixed.p.destroy();baseline.p.destroy();}
});

test('A shallow final hit reflects before a destructible wall is removed',()=>{
  const map={size:'small',walls:[],rooms:[{id:0,wx:0,wy:0,exit:{x:1,y:0},wallStart:0}],mechanisms:[{id:'shallow-breakable',type:'breakable-wall',x:0,y:0,w:U,h:10000,hits:1,roomId:0}]};
  const p=new Physics(map),m=new Mechanisms(map,p),vx=-.5,vy=Math.sqrt(BASE_SPEED**2-vx**2),c=p.addCube(1,U+.1,0,'#123456',{x:vx,y:vy});
  try{
    for(let tick=0;tick<30&&!m.items[0].removed;tick++){p.normalize(c,tick/120);m.breakables.beforeStep();p.step();m.breakables.afterStep(tick/120);}
    assert.ok(m.items[0].removed);assert.equal(m.items[0].remainingHits,0);near(c.body.velocity.x,-vx,'Bounce happens before removing the collider');near(c.body.velocity.y,vy,'A destroyed wall adds no tangent impulse');
  }finally{p.destroy();}
});
