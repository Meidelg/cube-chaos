import test from 'node:test';
import assert from 'node:assert/strict';
import {Race} from '../src/race.js';
import {Body} from '../src/physics.js';
import {BASE_SPEED,U} from '../src/config.js';

const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-10,`${message}: ${actual} != ${expected}`);

// Deliberately independent of the procedural generator: these tests concern
// launch velocities and saved physical states, not a particular map catalogue.
function openMap(generatorVersion=3){
  const width=30*U,height=20*U,floor={x:0,y:0,w:width,h:height,roomId:0};
  return{seed:'DIAGONAL-START-FIXTURE',generatorVersion,size:'small',width,height,walls:[],floors:[floor],mechanisms:[],start:{x:10*U,y:10*U},finish:{x:26*U,y:8*U,w:3*U,h:4*U,roomId:0},rooms:[{id:0,x:0,y:0,wx:0,wy:0,w:30,h:20,width,height,module:'test-open',links:[],ports:[],floors:[floor],exit:{x:1,y:0},next:null,distance:0,navigationDistance:0,wallStart:0,sweeps:[{x:0,y:0,w:width,h:height,dx:1,dy:0,length:width,startOffset:0}]}]};
}

test('New starts: every participant count 2–12 launches at BASE_SPEED along exactly one of four diagonals',t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),originalCrypto=globalThis.crypto;
  let seed=0;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:originalCrypto.randomUUID.bind(originalCrypto),getRandomValues:array=>{array[0]=seed;return array;}}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;});
  const component=BASE_SPEED/Math.SQRT2,observed=new Set();
  for(const count of Array.from({length:11},(_,i)=>i+2))for(const nextSeed of [0,1,2,3,4,42,1234,0xffffffff]){
    seed=nextSeed;const race=new Race(openMap(),count);
    try{
      assert.equal(race.cubes.length,count);
      for(const cube of race.cubes){
        const {x,y}=cube.body.velocity,label=`count=${count}, seed=${seed}, cube=${cube.id}`;
        assert.ok(x!==0&&y!==0,`${label}: neither component can be zero`);
        close(Math.abs(x),component,`${label}: diagonal x`);close(Math.abs(y),component,`${label}: diagonal y`);
        close(Math.abs(x),Math.abs(y),`${label}: equal components`);close(Math.hypot(x,y),BASE_SPEED,`${label}: baseline norm`);
        const direction=`${Math.sign(x)},${Math.sign(y)}`;assert.ok(['1,1','1,-1','-1,1','-1,-1'].includes(direction));observed.add(direction);
      }
    }finally{race.destroy();}
  }
  assert.deepEqual([...observed].sort(),['-1,-1','-1,1','1,-1','1,1'],'The seeded starts exercise all four allowed directions');
});

test('Restored v1/v2/v3/v4 race states preserve arbitrary saved velocities, including stationary and non-diagonal cubes',()=>{
  const velocities=[{x:0,y:0},{x:1.25,y:-2.75},{x:7.1,y:0},{x:-.005,y:.0001},{x:-.7,y:4.2},{x:1.9,y:-.5}];
  for(const version of [1,2,3,4]){
    const original=new Race(openMap(version),velocities.length);original.select(2);original.start();original.ticks=225;
    velocities.forEach((velocity,i)=>Body.setVelocity(original.cubes[i].body,velocity));
    original.cubes[1].boostUntil=2.5;original.cubes[1].boostAmount=2;original.cubes[4].conveyor={x:.4,y:.2};
    const saved=JSON.parse(JSON.stringify(original.snapshot())),restored=new Race(saved.map,saved.count,undefined,null,saved);
    try{
      assert.equal(restored.map.generatorVersion,version);assert.equal(restored.ticks,225);assert.ok(restored.paused);assert.equal(restored.prediction.selected,2);
      assert.equal(restored.rng.state,saved.rng,'Restoration must preserve continuation PRNG state despite creating fresh bodies');
      for(let i=0;i<velocities.length;i++){
        const actual=restored.cubes[i].body.velocity,expected=velocities[i],label=`v${version}, cube=${i+1}`;
        close(actual.x,expected.x,`${label}: saved x`);close(actual.y,expected.y,`${label}: saved y`);
      }
      assert.equal(restored.cubes[1].boostUntil,2.5);assert.equal(restored.cubes[1].boostAmount,2);assert.deepEqual(restored.cubes[4].conveyor,{x:.4,y:.2});
      assert.deepEqual(restored.snapshot().cubes.map(c=>c.velocity),saved.cubes.map(c=>c.velocity),'The immediate restored snapshot must not quantize or normalize saved directions');
    }finally{original.destroy();restored.destroy();}
  }
});
