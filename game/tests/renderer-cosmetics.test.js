import test from 'node:test';
import assert from 'node:assert/strict';
import {Container,Graphics} from 'pixi.js';
import {Renderer} from '../src/renderer.js';
import {Camera} from '../src/camera.js';
import {Race} from '../src/race.js';
import {generateMap} from '../src/map.js';
import {ITEMS,defaultEquipped} from '../src/shop.js';
import {freshProfile,pack,unpack} from '../src/save.js';
import {Body} from '../src/physics.js';

test('Every catalogue item draws through the real integrated Pixi renderer without changing the physical race',t=>{
  const race=new Race(generateMap('cosmetics-integration','small'),12),renderer=new Renderer();t.after(()=>race.destroy());
  renderer.world=new Container();renderer.app={renderer:{background:{}}};
  for(const k of ['floor','effects','frontLayer','wallLayer','mechanismLayer','debugLayer'])renderer[k]=new Graphics();
  for(const k of ['decor','mechanismLabels','cubeLayer'])renderer[k]=new Container();
  renderer.camera=new Camera({addEventListener(){}},renderer.world,()=>({w:390,h:420}),()=>{});t.after(()=>renderer.world.destroy({children:true}));
  const settings=freshProfile().settings,before=race.snapshot();
  for(const theme of ['classic','night','paper','neon'])for(const item of ITEMS){
    const cosmetics={...defaultEquipped(),theme,[item.category]:item.id};renderer.setRace(race,cosmetics,settings);renderer.draw(16);renderer.draw(16);
    assert.deepEqual(race.snapshot(),before,`${theme}/${item.id}`);
    assert.ok(renderer.sceneCosmetics.finishLayer.children.length>0);
    assert.ok(renderer.world.getChildIndex(renderer.wallLayer)>renderer.world.getChildIndex(renderer.frontLayer),'Static walls remain above the advancing wall');
  }
});

test('Saved permanent trail data validates and resumes independently of the physics snapshot',t=>{
  const race=new Race(generateMap('line-save','small'),2);t.after(()=>race.destroy());race.select(1);race.start();
  const snapshot=race.snapshot();snapshot.cosmeticTrail={version:1,raceId:race.id,trail:'line',cubes:[{id:1,segments:[{a:{x:12,y:12},b:{x:36,y:12},width:3,color:'#4263eb'}]}]};
  const saved=pack(freshProfile(),snapshot);assert.equal(unpack(saved).race.cosmeticTrail.cubes[0].segments.length,1);
  const bad=structuredClone(snapshot);bad.cosmeticTrail.cubes[0].segments[0].width=-1;assert.throws(()=>unpack(pack(freshProfile(),bad)),/история следа/);
  const restored=new Race(snapshot.map,2,undefined,null,snapshot);t.after(()=>restored.destroy());assert.deepEqual(restored.snapshot(),race.snapshot());
});
