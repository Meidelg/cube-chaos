import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {freshProfile} from '../src/save.js';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function browser(t){
  const previous={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame};
  const modal={open:false},restore={hidden:false};
  globalThis.document={hidden:false,activeElement:{tagName:'BODY'},body:{classList:{remove:()=>{},contains:()=>false}},querySelector:selector=>selector==='#modal'?modal:selector==='.restore-hud'?restore:null};
  globalThis.requestAnimationFrame=()=>1;
  t.after(()=>{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  return{modal};
}
function harness(modal){
  const game=Object.create(Game.prototype),calls={steps:0,draws:0,results:[],shops:[],balance:0,saves:[],toasts:[]};
  game.race={id:'active-race',started:true,finished:false,paused:true,correct:false,cubes:[],map:{},mechanisms:{wallActive:false},step:()=>{calls.steps++;}};
  game.ui={currentScreen:'race',navigationId:1,shopPage:0,update:()=>{},close(){modal.open=false;this.navigationId++;},showScreen(screen){this.currentScreen=screen;this.navigationId++;modal.open=false;},results:race=>calls.results.push(race),shop:(...args)=>calls.shops.push(args),balance:()=>calls.balance++,toast:message=>calls.toasts.push(message)};
  game.renderer={draw:()=>calls.draws++,resize:()=>{}};game.audio={play:()=>{},unlock:async()=>{}};
  game.saves={db:{},queue:Promise.resolve(),profile:freshProfile(),saveRace:async snapshot=>calls.saves.push(snapshot)};
  game.speed=1;game.accumulator=0;game.lastFrame=0;game.lastUI=1000;game.finishing=false;game.settings={};game.warned=false;
  return{game,calls};
}

test('Game navigation: home and fullscreen menus cannot resume or advance a hidden race',async t=>{
  const {modal}=browser(t),{game,calls}=harness(modal);
  game.ui.currentScreen='home';await game.action('pause');assert.ok(game.race.paused,'A hidden pause action must not resume the race');
  game.frame(1000);assert.equal(calls.steps,0);assert.equal(calls.draws,0);
  game.race.paused=false;game.frame(1017);assert.equal(calls.steps,0,'Home screen must guard physics even if a race was inadvertently unpaused');
  game.ui.currentScreen='race';modal.open=true;game.frame(1034);assert.equal(calls.steps,0,'A fullscreen menu overlays and stops gameplay');
  modal.open=false;game.frame(1051);assert.ok(calls.steps>0,'The same running race progresses after returning to its visible screen');
});

test('Game finish: a delayed result commit cannot reopen results after Home or target a newly created race',async t=>{
  const {modal}=browser(t),{game,calls}=harness(modal),gate=deferred();
  game.race.finished=true;game.race.winner=1;const finishedRace=game.race;let awarded;
  game.saves.finish=async race=>{awarded=race;await gate.promise;};
  const pending=game.finish();await game.action('home');game.race={id:'new-race',started:false,finished:false,winner:null};
  gate.resolve();await pending;
  assert.equal(awarded,finishedRace,'The transaction must keep the finished race captured before awaiting');assert.equal(game.ui.currentScreen,'home');assert.equal(calls.results.length,0);assert.equal(calls.balance,1);
});

test('Game finish: a committed result is still shown when its race remains visible',async t=>{
  const {modal}=browser(t),{game,calls}=harness(modal);game.race.finished=true;game.race.winner=1;game.saves.finish=async()=>{};
  await game.finish();assert.equal(calls.results.length,1);assert.equal(calls.results[0],game.race);
});

test('Game shop: a purchase can commit after navigating away without reopening its old category',async t=>{
  const {modal}=browser(t),{game,calls}=harness(modal),gate=deferred();modal.open=true;game.saves.profile.coins=1000;
  game.saves.transaction=async update=>{await gate.promise;update({profile:game.saves.profile});};
  const pending=game.buy('paper');await game.action('home');gate.resolve();await pending;
  assert.equal(game.saves.profile.coins,500);assert.deepEqual(game.saves.profile.owned,['paper']);assert.equal(calls.shops.length,0);assert.equal(game.ui.currentScreen,'home');assert.equal(calls.balance,1);
});
