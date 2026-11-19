import test from 'node:test';
import assert from 'node:assert/strict';
import {UI,shopPreview} from '../src/ui.js';
import {ITEMS,defaultEquipped} from '../src/shop.js';

// Capture rendering at the existing modal boundary; no synthetic layout or game scene.
function renderView(callback){
  const previous=globalThis.document,modal={dataset:{}},back={dataset:{},setAttribute(){}};
  globalThis.document={querySelector(selector){if(selector==='#modal')return modal;if(selector==='#modalBack')return back;throw Error(`Unexpected selector ${selector}`);}};
  const ui=Object.create(UI.prototype);ui.modal=(title,html)=>{ui.title=title;ui.html=html;};ui.setBack=menu=>{ui.backMenu=menu;};
  try{return callback(ui,{modal,back});}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
const profile=debug=>({coins:0,owned:[],equipped:defaultEquipped(),settings:{debug}});
const itemIds=html=>[...html.matchAll(/data-item="([^"]+)"/g)].map(match=>match[1]);

test('shop renders four ordered items and the free ordinary item first in each category',()=>{
  renderView(ui=>{
    const expected={theme:'classic',skin:'skin-classic',trail:'trail-classic',finish:'finish-classic'};
    for(const [category,first]of Object.entries(expected)){ui.shop(profile(false),category,0);assert.equal(itemIds(ui.html).length,4);assert.equal(itemIds(ui.html)[0],first);assert.match(ui.html,/Бесплатная/);assert.match(ui.html,/<h3>Обычная<\/h3>/);assert.equal(ui.backMenu,'shop');}
    ui.shop(profile(false),'skin',1);assert.deepEqual(itemIds(ui.html),['black-eyes','mad','round']);
  });
});

test('debug shop offers unowned items as transient equip actions without purchase prices or profile mutations',()=>{
  renderView(ui=>{
    const state=profile(true),before=structuredClone(state);
    for(const category of ['theme','skin','trail','finish'])for(let page=0;page<2;page++){
      ui.shop(state,category,page);const ids=itemIds(ui.html);assert.ok(ids.length<=4);
      for(const id of ids)assert.ok(ui.html.includes(`data-equip="${id}"`));
      assert.doesNotMatch(ui.html,/data-shop=|монет/);assert.match(ui.html,/Режим отладки: примерка не сохраняется/);
    }
    ui.shop(state,'finish',1);assert.match(ui.html,/Примерить/);assert.deepEqual(state,before);
  });
});

test('normal shop keeps purchase limits and permanently owned equip actions',()=>{
  renderView(ui=>{
    const state=profile(false);ui.shop(state,'skin',1);
    for(const id of ['black-eyes','mad','round'])assert.match(ui.html,new RegExp(`data-shop="${id}" disabled`));
    state.owned=['round'];ui.shop(state,'skin',1);assert.match(ui.html,/data-equip="round"/);assert.doesNotMatch(ui.html,/data-shop="round"|Примерить|примерка не сохраняется/);
  });
});

test('trap configuration has four toggles per page, preserves false values and exposes the agreed back action',()=>{
  renderView((ui,{back})=>{
    const options={laser:false};ui.generationSettings(options,0);
    assert.deepEqual([...ui.html.matchAll(/data-generation="([^"]+)"/g)].map(match=>match[1]),['laser','portal','spinner','press']);
    assert.match(ui.html,/data-generation="laser" >/);assert.match(ui.html,/data-generation="portal" checked/);assert.equal(back.dataset.action,'close-generation');assert.match(ui.html,/data-action="generation-page" data-page="1"/);
    ui.generationSettings(options,2);assert.deepEqual([...ui.html.matchAll(/data-generation="([^"]+)"/g)].map(match=>match[1]),['resize','breakables']);assert.deepEqual(options,{laser:false});
  });
});

test('every new cosmetic has a local vector preview',()=>{
  for(const item of ITEMS){const svg=shopPreview(item);assert.match(svg,/^<svg /);assert.doesNotMatch(svg,/https?:|<image|<foreignObject/);assert.match(svg,/aria-hidden="true"/);}
});
