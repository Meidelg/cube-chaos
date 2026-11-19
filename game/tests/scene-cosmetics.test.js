import test from 'node:test';
import assert from 'node:assert/strict';
import {Container} from 'pixi.js';
import {SceneCosmetics,getTheme,getFinishStyle,rainbowColor} from '../src/scene-cosmetics.js';

function fixture(seed='cosmetic-seed'){
  return{map:{seed,width:720,height:480,walls:[{x:36,y:12,w:72,h:24}],wallTiles:[{x:12,y:12,w:24,h:24},{x:36,y:12,w:24,h:24},{x:60,y:12,w:24,h:24}],finish:{x:600,y:120,w:72,h:144}},rng:{state:0x12345678},cubes:[{id:1,alive:true,size:1,color:'#6078ed',body:{position:{x:120,y:120},velocity:{x:2,y:1}}},{id:2,alive:true,size:2,color:'#f07171',body:{position:{x:180,y:180},velocity:{x:-1,y:2}}}],mechanisms:{items:[{id:'press',type:'press',body:{vertices:[{x:260,y:120},{x:284,y:120},{x:284,y:192},{x:260,y:192}]}},{id:'portal',type:'portal',x:360,y:180,w:48,h:48},{id:'laser',type:'laser',x:420,y:220,w:96,h:5,active:true,emitters:[{x:372,y:220},{x:468,y:220}]}],fronts:[]}};
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const nested of Object.values(value))freeze(nested);}return value;}
const paths=g=>g.context.instructions.map(instruction=>({action:instruction.action,path:instruction.data.path.instructions}));

test('Scene cosmetics preserve simulation, participant colors and PRNG while neon contours share a real-time hue',()=>{
  const race=fixture(),before=structuredClone(race);freeze(race);
  const scene=new SceneCosmetics(new Container());
  try{
    scene.setRace(race,{theme:'neon',finish:'gold'},{});const initial=scene.outlineColor;
    for(let i=0;i<20;i++)scene.update(16);
    assert.notEqual(scene.outlineColor,initial);assert.equal(scene.outlineColor,rainbowColor(320));
    for(const layer of [scene.edgeGlowLayer,scene.edgeStrokeLayer,scene.finishBase])assert.equal(layer.tint,scene.outlineColor);
    assert.equal(scene.cubeGlowLayer.visible,false,'Neon outlines do not enable the night-only cube glow');
    scene.setRace(race,{theme:'night',finish:'gold'},{});
    assert.equal(scene.cubeGlows.get(1).glow.tint,0x6078ed,'Night glow must keep participant identity');
    assert.equal(scene.cubeGlows.get(2).glow.tint,0xf07171);
    assert.deepEqual(race,before,'No cosmetic update can mutate the physics or race random state');
  }finally{scene.destroy();}
});

test('Paper texture is deterministic, bounded and local to the visual seed',()=>{
  const first=new SceneCosmetics(new Container()),second=new SceneCosmetics(new Container());
  try{
    first.setRace(fixture('same-paper'),{theme:'paper',finish:'classic'},{});second.setRace(fixture('same-paper'),{theme:'paper',finish:'classic'},{});
    assert.ok(first.paperLayer.visible);assert.deepEqual(paths(first.paperLayer),paths(second.paperLayer));
    const original=paths(first.paperLayer);second.setRace(fixture('other-paper'),{theme:'paper',finish:'classic'},{});assert.notDeepEqual(paths(second.paperLayer),original);
    const large=fixture('huge-paper');large.map.width=100_000;large.map.height=100_000;second.setRace(large,{theme:'paper'},{});
    assert.ok(paths(second.paperLayer).reduce((n,instruction)=>n+instruction.path.length,0)<=5000,'A huge map must not generate an unbounded paper bitmap or number of fibers');
  }finally{first.destroy();second.destroy();}
});

test('Every finish owns its visible base and special glints are masked to the existing finish rectangle',()=>{
  const scene=new SceneCosmetics(new Container()),race=fixture();
  try{
    for(const finish of ['classic','mint','gold','silver','diamond','emerald','ruby']){
      scene.setRace(race,{theme:'classic',finish},{});
      assert.ok(scene.finishLayer.visible);assert.ok(scene.finishBase.context.instructions.length>0,`${finish} must paint its own base`);
      assert.equal(scene.finishAnimation.mask,scene.finishMask);assert.equal(scene.finishLayer.x,race.map.finish.x);assert.equal(scene.finishLayer.y,race.map.finish.y);
      const maskPath=paths(scene.finishMask)[0].path;assert.equal(maskPath.length,1);assert.equal(maskPath[0].action,'rect');assert.deepEqual(maskPath[0].data.slice(0,4),[0,0,race.map.finish.w,race.map.finish.h]);
    }
    const bases=['gold','silver','diamond','emerald','ruby'].map(id=>getFinishStyle(id).base);assert.equal(new Set(bases).size,5);
    assert.deepEqual(getTheme('classic'),{id:'classic',floor:0xffffff,wall:0x969a9c,edge:0x797e80,background:0x969a9c,mode:'classic'});
  }finally{scene.destroy();}
});

test('Low effects retain neon readability and finish bases without allocating new display objects each frame',()=>{
  const world=new Container(),scene=new SceneCosmetics(world),settings={lowEffects:false},race=fixture();
  assert.equal(world.children.length,0,'Root renderer owns insertion order');world.addChild(...Object.values(scene.layers));
  try{
    scene.setRace(race,{theme:'neon',finish:'gold'},settings);const glows=[...scene.cubeGlows.values()].map(entry=>entry.glow),children=scene.cubeGlowLayer.children.length,staticPaths=paths(scene.staticStroke);
    for(let i=0;i<120;i++)scene.update(16);
    assert.equal(scene.cubeGlowLayer.children.length,children);assert.deepEqual(scene.cubeGlowLayer.children,glows);assert.deepEqual(paths(scene.staticStroke),staticPaths);
    settings.lowEffects=true;scene.update(16);assert.ok(scene.edgeStrokeLayer.visible);assert.ok(scene.dynamicStroke.context.instructions.length>0);assert.equal(scene.edgeGlowLayer.visible,false);assert.equal(scene.cubeGlowLayer.visible,false);assert.equal(scene.finishAnimation.context.instructions.length,0);
    scene.setRace(race,{theme:'night',finish:'emerald'},settings);assert.ok(scene.finishBase.context.instructions.length>0);
  }finally{scene.destroy();}
  assert.equal(world.children.length,0);assert.ok(Object.values(scene.layers).every(layer=>layer.destroyed));assert.doesNotThrow(()=>scene.destroy());assert.doesNotThrow(()=>scene.update(16));
});
