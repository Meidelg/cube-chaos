import Matter from 'matter-js';
import {COLORS,DEFAULT_SETTINGS,STEP} from './config.js';
import {generateMap,progress,createPartPreview} from './map.js';
import {PartEditor} from './part-editor.js';
import {validatePartDraft,serializePartLibrary,parsePartLibrary} from './part-library.js';
import {newSeed} from './random.js';
import {Race} from './race.js';
import {Renderer} from './renderer.js';
import {UI,icon,escape} from './ui.js';
import {SaveManager,unpack} from './save.js';
import {purchase,equip,ITEMS,defaultEquipped,resolveEquipped} from './shop.js';
import {GENERATION_OPTIONS,normalizeGenerationOptions} from './generation-options.js';
import {AudioManager} from './audio.js';
import {PWAManager} from './pwa.js';
import {claimTab} from './single-tab.js';

export class Game {
  async init(){
    if(!await claimTab(()=>this.blocked())){this.blocked();return;}
    this.saves=new SaveManager();
    try{await this.saves.open();}catch(error){this.saveError=error;}
    this.settings={...structuredClone(DEFAULT_SETTINGS),...structuredClone(this.saves.profile.settings||{}),generationOptions:normalizeGenerationOptions(this.saves.profile.settings?.generationOptions)};this.debugCosmetics={};this.cosmeticEpoch=0;this.audio=new AudioManager(this.settings);this.speed=1;this.accumulator=0;this.count=6;this.size='small';this.finishing=false;this.raf=null;
    this.ui=new UI({action:(a,t)=>this.action(a,t),screen:s=>this.screen(s),count:n=>this.setCount(n),size:s=>this.setSize(s),speed:n=>this.setSpeed(n),select:id=>this.select(id),buy:id=>this.buy(id),equip:id=>this.equip(id),profile:()=>this.viewProfile()});
    this.renderer=new Renderer();await this.renderer.init(document.querySelector('#viewport'),p=>{const c=this.race?.cubes.find(c=>c.alive&&p.x>=c.body.bounds.min.x&&p.x<=c.body.bounds.max.x&&p.y>=c.body.bounds.min.y&&p.y<=c.body.bounds.max.y);if(c)this.select(c.id);});
    this.renderer.camera.onFollowChange=(mode,id,reason)=>{this.refreshCameraFollow();if(reason==='target-lost')this.ui.toast('Кубик выбыл. Слежение остановлено.');};
    this.newRace();
    this.pwa=new PWAManager((message,state)=>{const el=document.querySelector('#offlineStatus');el.className=`offline-status ${state}`;el.querySelector('span:last-child').textContent=message;},()=>{document.querySelector('#updateButton').hidden=false;});this.pwa.init();
    this.bindSettings();document.querySelector('#importFile').addEventListener('change',e=>this.importFile(e));
    window.addEventListener('keydown',e=>{if(e.code==='Space'&&this.ui.currentScreen==='race'&&!document.querySelector('#modal').open&&!['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();this.action('pause');}if(e.key==='Escape'&&document.body.classList.contains('hud-hidden'))this.action('hud');});
    document.addEventListener('visibilitychange',()=>{this.lastFrame=performance.now();this.accumulator=0;if(document.hidden){if(this.race.started&&!this.race.finished)this.race.paused=true;this.audio.background(true);this.checkpoint();}else{this.audio.background(false);this.ui.update(this.race,c=>progress(this.race.map,c.body.position));}});
    window.addEventListener('pagehide',()=>this.checkpoint());this.autosave=setInterval(()=>this.checkpoint(),2000);
    this.lastFrame=performance.now();this.raf=requestAnimationFrame(t=>this.frame(t));
    if(this.saveError){document.querySelector('#startButton').disabled=true;this.ui.modal('Сохранение требует внимания',`<p class="modal-description">${escape(this.saveError.message)}</p><p class="small muted">Монеты и покупки не удалены. Можно экспортировать исходные данные для восстановления или импортировать резервную копию.</p><div class="save-actions"><button class="secondary" data-action="export-raw">Экспорт исходных данных</button><button class="secondary" data-action="import">Импорт копии</button></div>`,'ДАННЫЕ СОХРАНЕНЫ');}
    // An unfinished race is offered when the player presses Start from home.
    if(this.saves.recovered)this.ui.toast('Восстановлена последняя корректная резервная копия.');
    if('ontouchstart'in window)document.querySelector('#stageHint').textContent='Один палец — перемещение · Два — масштаб';
  }
  blocked(){if(this.raf)cancelAnimationFrame(this.raf);if(this.autosave)clearInterval(this.autosave);document.querySelector('#app').innerHTML='<div class="blocked"><h1>Игра уже открыта</h1><p>Вернись в первую вкладку или закрой её и обнови эту страницу. Одна гонка — одно окно.</p><button class="primary" onclick="location.reload()">Проверить снова</button></div>';}
  newRace({seed=newSeed(),snapshot=null}={}){
    const map=snapshot?.map||generateMap(seed,this.size,this.saves.profile.partLibrary||[],this.settings.generationOptions);
    this.race?.destroy();this.finishing=false;this.accumulator=0;this.warned=false;this.paletteQueued=false;
    if(snapshot){this.count=snapshot.count;this.size=map.size;}
    this.race=new Race(map,this.count,this.settings.palette,this.audio,snapshot);this.renderer.setRace(this.race,this.effectiveCosmetics(),this.settings);if(snapshot?.cosmeticTrail)this.renderer.trailEffects?.importHistory(snapshot.cosmeticTrail);this.ui.prepare(this.race,this.saves.profile);this.refreshCameraFollow();
    Matter.Events.on(this.race.physics.engine,'collisionStart',event=>{if(event.pairs.some(p=>p.bodyA.label.startsWith('cube')||p.bodyB.label.startsWith('cube')))this.audio.play('collision');});
    if(this.race.finished)this.finish();
  }
  showGame(screen,fit=false){this.ui.showScreen(screen);requestAnimationFrame(()=>this.renderer.resize(fit));}
  pauseForMenu(){if(this.race.started&&!this.race.finished){this.race.paused=true;this.accumulator=0;this.ui.update(this.race);this.checkpoint();}}
  async openSetup(){
    const navigation=this.ui.navigationId;
    if(this.race.finished&&this.finishing){await this.finishPromise;if(this.ui.navigationId!==navigation||(this.race.finished&&this.finishing===false))return;}
    this.ui.close();document.body.classList.remove('hud-hidden');document.querySelector('.restore-hud').hidden=true;
    if(this.race.started&&!this.race.finished){this.showGame('race');this.pauseForMenu();return;}
    if(this.saves.race){this.restorePrompt();return;}
    if(this.race.finished)this.newRace();
    this.showGame('setup',true);
  }
  setCount(count){if(this.race.started)return;this.count=count;this.newRace({seed:this.race.map.seed});}
  setSize(size){if(this.race.started)return;this.size=size;this.newRace();}
  cameraFollowAvailability(){
    const race=this.race,selected=race.cubes.find(c=>c.id===race.prediction.selected),winner=race.finished?race.cubes.find(c=>c.id===race.winner):null;
    return{selectedAvailable:!!selected&&(selected.alive||selected===winner),leaderAvailable:race.cubes.some(c=>c.alive)||!!winner};
  }
  refreshCameraFollow(){const camera=this.renderer?.camera;if(!camera||!this.ui?.cameraFollow||!this.race?.prediction)return;this.ui.cameraFollow(camera.followMode,camera.followTargetId,this.cameraFollowAvailability());}
  setSpeed(speed){if(speed===8&&this.disable8){this.ui.toast('Для ×8 сейчас недостаточно мощности. Выбери меньшую скорость.');return;}this.speed=speed;this.accumulator=0;document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));}
  select(id){if(this.race.select(id)){this.audio.unlock();this.ui.update(this.race);this.renderer.draw();}}
  async action(action,target){
    const race=this.race;
    if(action==='home'){this.pauseForMenu();this.ui.close();document.body.classList.remove('hud-hidden');document.querySelector('.restore-hud').hidden=true;this.ui.showScreen('home');return;}
    if(action==='start'){if(this.saveError){this.ui.toast('Сначала восстанови сохранение.');return;}await this.audio.unlock();if(race.start()){this.showGame('race');this.lastFrame=performance.now();this.accumulator=0;this.ui.update(race);this.checkpoint();}}
    if(action==='pause'){if(!race.started||race.finished||this.ui.currentScreen!=='race'||document.querySelector('#modal').open)return;race.paused=!race.paused;this.lastFrame=performance.now();this.accumulator=0;if(!race.paused)await this.audio.unlock();this.ui.update(race);if(race.paused)this.checkpoint();}
    if(action==='generation-settings'){this.ui.generationSettings(this.settings.generationOptions);return;}
    if(action==='generation-page'){this.ui.generationSettings(this.settings.generationOptions,Number(target?.dataset.page)||0);return;}
    if(action==='close-generation'){this.ui.close();return;}
    if(action==='generate'){if(!race.started){this.disable8=false;this.newRace();}}
    if(action==='fit'||action==='reset-camera'){this.renderer.camera.fit();this.refreshCameraFollow();}
    if(action==='follow-selected'||action==='follow-leader'){
      const mode=action==='follow-selected'?'selected':'leader',camera=this.renderer.camera;
      if(camera.followMode===mode)camera.stopFollow('toggle');
      else{const available=this.cameraFollowAvailability();if(!(mode==='selected'?available.selectedAvailable:available.leaderAvailable)){this.ui.toast(mode==='selected'?'Сначала выбери живого кубика.':'Нет участника для слежения.');return;}camera.setFollow(mode);}
      this.renderer.draw(0);this.refreshCameraFollow();return;
    }
    if(action==='copy-seed'){try{await navigator.clipboard.writeText(race.map.seed);this.ui.toast('Seed скопирован');}catch{this.ui.toast(`Seed: ${race.map.seed}`);}}
    if(action==='hud'){const hidden=document.body.classList.toggle('hud-hidden');document.querySelector('.restore-hud').hidden=!hidden;requestAnimationFrame(()=>this.renderer.resize());}
    if(action==='close-modal')this.ui.close();
    if(action==='results'){if(this.finishing)this.ui.results(race);else this.finish();}
    if(action==='next'){const navigation=this.ui.navigationId;this.replacingRace=true;try{await this.saves.saveRace(null);if(this.ui.navigationId===navigation){this.ui.close();this.disable8=false;this.newRace();this.showGame('setup',true);}}catch(e){this.ui.toast(`Не удалось подготовить гонку: ${e.message}`);}finally{this.replacingRace=false;}}
    if(action==='resume'){const snapshot=this.saves.race;if(!snapshot)return;this.ui.close();this.newRace({snapshot});this.showGame('race',true);}
    if(action==='discard'){if(!confirm('Завершить незавершённую гонку без результата? Это не будет считаться проигрышем.'))return;const navigation=this.ui.navigationId;this.replacingRace=true;try{await this.saves.saveRace(null);if(this.race===race)this.newRace();if(this.ui.navigationId===navigation){this.ui.close();this.showGame('setup',true);}}catch(e){this.ui.toast(`Не удалось подготовить гонку: ${e.message}`);}finally{this.replacingRace=false;}}
    if(action==='export'){clearTimeout(this.settingsTimeout);await this.saves.saveSettings(this.settings);await this.checkpoint();this.download(this.saves.export(),`cube-chaos-${new Date().toISOString().slice(0,10)}.json`);}
    if(action==='export-raw'){if(!this.saves.db){this.ui.toast('Локальное хранилище недоступно.');return;}const tx=this.saves.db.transaction('state','readonly'),req=tx.objectStore('state').get('current');req.onsuccess=()=>this.download(JSON.stringify(req.result,null,2),'cube-chaos-recovery.json');}
    if(action==='import')document.querySelector('#importFile').click();
    if(action==='reset-palette'||action==='palette-classic'){this.settings.palette=[...COLORS];this.refreshSettings();}
    if(action==='palette-bright'){this.settings.palette=['#4263eb','#fa5252','#fcc419','#40c057','#be4bdb','#fd7e14','#15aabf','#e64980','#82c91e','#7950f2','#12b886','#868e96'];this.refreshSettings();}
    if(action==='palette-pastel'){this.settings.palette=['#94a9e5','#e6a5aa','#e7cc91','#9ec8af','#bfabe0','#e8b598','#94c9d0','#dca8ca','#c3cf97','#b6b9cb','#c9b09d','#a5d3c3'];this.refreshSettings();}
    if(action==='install')this.ui.modal('Установка',`<div class="install-steps"><h3>iPhone / iPad</h3><p>Safari → Поделиться → На экран Домой.</p><h3>Android / Windows</h3><p>Меню браузера → Установить приложение.</p><p>Дождись готовности офлайн-ресурсов перед запуском без сети.</p></div>`);
    if(action==='offline'){if(target.classList.contains('error')){this.pwa.init();this.ui.toast('Повторная проверка офлайн-ресурсов…');}else this.action('install');}
    if(action==='update'){if(race.started&&!race.finished){race.paused=true;this.ui.update(race);if(!confirm('Обновить игру? Гонка будет сохранена и восстановлена на паузе.'))return;}await this.checkpoint();this.pwa.update();}
  }
  screen(screen){
    if(screen==='editor'){this.openPartEditor();return;}
    if(screen==='home'||screen==='play'){this.action('home');return;}
    if(screen==='setup'){this.openSetup();return;}
    if(screen==='race'){this.showGame('race');return;}
    this.pauseForMenu();
    if(screen==='shop')this.ui.shop(this.viewProfile());
    if(screen==='stats')this.ui.stats(this.saves.profile);
    if(screen==='settings'||screen==='palette')this.ui.settings({...this.saves.profile,settings:this.settings},screen==='palette'?'palette':false);
  }
  effectiveCosmetics(){return{...resolveEquipped(this.saves.profile),...(this.settings.debug?this.debugCosmetics||{}:{})};}
  viewProfile(){return{...this.saves.profile,settings:this.settings,equipped:this.effectiveCosmetics()};}
  applyCosmetics(){this.renderer.setRace(this.race,this.effectiveCosmetics(),this.settings);this.refreshCameraFollow();}
  setDebugMode(enabled){
    if(this.settings.debug===!!enabled)return;
    this.settings.debug=!!enabled;this.cosmeticEpoch=(this.cosmeticEpoch||0)+1;this.debugCosmetics={};this.applyCosmetics();
  }
  previewCosmetic(id){
    const item=ITEMS.find(i=>i.id===id);if(!this.settings.debug||!item)return false;
    this.debugCosmetics||={};this.debugCosmetics[item.category]=this.effectiveCosmetics()[item.category]===item.id?defaultEquipped()[item.category]:item.id;
    this.applyCosmetics();return true;
  }
  async buy(id){
    if(this.settings.debug)return this.equip(id);
    const navigation=this.ui.navigationId,item=ITEMS.find(i=>i.id===id),epoch=this.cosmeticEpoch||0;if(!item)return;
    try{let bought=false,cancelled=false;await this.saves.transaction(s=>{if(this.settings.debug||(this.cosmeticEpoch||0)!==epoch){cancelled=true;return;}bought=purchase(s.profile,id);});
      this.ui.balance(this.saves.profile);if(bought){this.audio.play('coin');this.ui.toast('Предмет теперь твой');}
      if(cancelled)this.ui.toast('Действие отменено после смены режима отладки.');
      if(this.ui.navigationId===navigation)this.ui.shop(this.viewProfile(),item.category,this.ui.shopPage||0);
    }catch(e){this.ui.toast(`Покупка не сохранена: ${e.message}`);}
  }
  async equip(id){
    const navigation=this.ui.navigationId,item=ITEMS.find(i=>i.id===id);if(!item)return;
    if(this.settings.debug){this.previewCosmetic(id);if(this.ui.navigationId===navigation)this.ui.shop(this.viewProfile(),item.category,this.ui.shopPage||0);return;}
    const epoch=this.cosmeticEpoch||0;
    try{await this.saves.transaction(s=>{if(!this.settings.debug&&(this.cosmeticEpoch||0)===epoch)equip(s.profile,id);});this.applyCosmetics();
      if(this.ui.navigationId===navigation)this.ui.shop(this.viewProfile(),item.category,this.ui.shopPage||0);
    }catch(e){this.ui.toast(`Не удалось применить предмет: ${e.message}`);}
  }
  setGenerationOption(key,value){
    if(!GENERATION_OPTIONS.some(o=>o.key===key))return;
    this.settings.generationOptions=normalizeGenerationOptions({...this.settings.generationOptions,[key]:!!value});this.saveSettings();
    if(!this.race.started)this.newRace({seed:this.race.map.seed});
  }
  bindSettings(){document.addEventListener('input',e=>{const target=e.target;if(target.dataset.generation){this.setGenerationOption(target.dataset.generation,target.checked);return;}if(target.dataset.setting){if(target.dataset.setting==='debug')this.setDebugMode(target.checked);else this.settings[target.dataset.setting]=target.type==='checkbox'?target.checked:Number(target.value);this.saveSettings();}if(target.dataset.palette!==undefined){this.settings.palette[Number(target.dataset.palette)]=target.value;this.updatePalette();this.saveSettings();}});}
  updatePalette(){
    if(!this.race.started){for(const c of this.race.cubes)c.color=this.settings.palette[c.id-1];this.race.mechanisms.breakables.bindParticipants(this.race.cubes);}
    else if(!this.paletteQueued){this.paletteQueued=true;this.ui.toast('Новая палитра применится в следующей гонке.');}
    this.ui.prepare(this.race,this.saves.profile);document.querySelectorAll('[data-palette]').forEach(input=>{const avatar=input.closest('label')?.querySelector('.cube-avatar');if(avatar)avatar.style.setProperty('--cube',input.value);});this.renderer.draw();this.refreshCameraFollow();
  }
  refreshSettings(){this.saveSettings();this.updatePalette();this.ui.settings({...this.saves.profile,settings:this.settings},this.ui.settingsSection||'palette');}
  saveSettings(){this.audio.settings=this.settings;this.renderer.settings=this.settings;clearTimeout(this.settingsTimeout);this.settingsTimeout=setTimeout(()=>this.saves.saveSettings(this.settings).catch(e=>this.ui.toast(`Настройки не сохранены: ${e.message}`)),250);}
  async checkpoint(){if(this.importing||this.replacingRace||this.saveError||!this.saves.db||!this.race?.started||this.race.finished||this.finishing)return;try{const snapshot=this.race.snapshot();if(!this.settings.debug){const history=this.renderer.trailEffects?.exportHistory();if(history)snapshot.cosmeticTrail=history;}await this.saves.saveRace(snapshot);}catch(e){this.ui.toast(`Не удалось сохранить гонку: ${e.message}`);}}
  finish(){
    if(this.finishing)return this.finishPromise;
    const race=this.race,navigation=this.ui.navigationId;this.finishing=true;
    this.finishPromise=(async()=>{
      try{await this.saves.finish(race);this.ui.balance(this.saves.profile);
        if(this.race===race&&this.ui.currentScreen==='race'&&this.ui.navigationId===navigation&&!document.querySelector('#modal').open)this.ui.results(race);
        if(race.correct)this.audio.play('coin');
      }catch(e){if(this.race===race){this.finishing=false;race.paused=true;}this.ui.toast(`Результат ещё не сохранён: ${e.message}. Нажми «Результаты» для повтора.`);}
    })();return this.finishPromise;
  }
  restorePrompt(){const s=this.saves.race;this.ui.modal('Незавершённая гонка',`<p class="modal-description">Сохранена гонка на ${s.count} участников. Симуляция не шла, пока игра была закрыта.</p><div class="save-actions"><button class="primary" data-action="resume">Продолжить гонку ${icon('play')}</button><button class="secondary" data-action="discard">Начать новую</button></div>`,'НЕЗАВЕРШЁННАЯ ГОНКА');}
  openPartEditor(draft){
    this.pauseForMenu();
    if(this.saveError||!this.saves.db){this.ui.toast('Сначала восстанови локальное сохранение.');return;}
    this.partEditor?.destroy();
    this.partEditor=new PartEditor({ui:this.ui,
      onSave:async part=>{
        const check=validatePartDraft(part);if(!check.valid)throw Error(check.errors.join(' '));this.checkPartConnections([part]);
        await this.saves.transaction(s=>{const parts=s.profile.partLibrary||=[];const i=parts.findIndex(p=>p.id===part.id);if(i<0)parts.push(structuredClone(part));else parts[i]=structuredClone(part);});
        this.refreshPartMap();return structuredClone(this.saves.profile.partLibrary);
      },
      onDelete:async id=>{await this.saves.transaction(s=>{s.profile.partLibrary=(s.profile.partLibrary||[]).filter(p=>p.id!==id);});this.refreshPartMap();return structuredClone(this.saves.profile.partLibrary);},
      onExport:parts=>this.download(serializePartLibrary(parts),'cube-chaos-parts.json'),
      onImport:()=>this.importParts(),
      onClose:()=>this.ui.settings({...this.saves.profile,settings:this.settings})
    });
    this.partEditor.open(this.saves.profile.partLibrary||[],draft);
  }
  checkPartConnections(parts){for(const part of parts)if(part.enabled!==false){try{createPartPreview(part);}catch{throw Error(`«${part.name}»: соединения не помещаются рядом с другими частями. Разнеси начало и конец или отключи «Для генератора».`);}}}
  refreshPartMap(){if(!this.race.started)this.newRace({seed:this.race.map.seed});}
  async importParts(){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);
    try{
      const file=await new Promise(resolve=>{input.addEventListener('change',()=>resolve(input.files[0]||null),{once:true});input.addEventListener('cancel',()=>resolve(null),{once:true});input.click();});
      if(!file)return;if(file.size>8_000_000)throw Error('Файл частей слишком большой.');
      const parts=parsePartLibrary(await file.text());this.checkPartConnections(parts);
      if(!confirm(`Добавить части из файла (${parts.length})? Части с совпадающим идентификатором будут заменены.`))return;
      await this.saves.transaction(s=>{const merged=new Map((s.profile.partLibrary||[]).map(p=>[p.id,p]));for(const part of parts)merged.set(part.id,part);s.profile.partLibrary=[...merged.values()];});
      this.refreshPartMap();return structuredClone(this.saves.profile.partLibrary);
    }finally{input.remove();}
  }
  download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  async importFile(event){
    const file=event.target.files[0];event.target.value='';if(!file)return;
    try{
      if(file.size>8_000_000)throw Error('Файл слишком большой');const text=await file.text();unpack(JSON.parse(text));
      if(!confirm('Заменить текущие монеты, покупки, статистику и гонку данными из файла?'))return;
      this.pauseForMenu();this.importing=true;clearTimeout(this.settingsTimeout);await this.saves.queue.catch(()=>{});
      await this.saves.import(text);this.saveError=null;this.debugCosmetics={};this.cosmeticEpoch=(this.cosmeticEpoch||0)+1;this.settings={...structuredClone(DEFAULT_SETTINGS),...structuredClone(this.saves.profile.settings),generationOptions:normalizeGenerationOptions(this.saves.profile.settings.generationOptions)};this.audio.settings=this.settings;
      this.ui.close();this.newRace();this.ui.showScreen('home');if(this.saves.race)this.restorePrompt();this.ui.toast('Прогресс импортирован');
    }catch(error){this.ui.toast(`Импорт не выполнен: ${error.message}`);}finally{this.importing=false;}
  }
  frame(now){
    const elapsed=Math.max(0,Math.min(250,now-this.lastFrame));this.lastFrame=now;
    if(!document.hidden&&this.ui.currentScreen==='race'&&!document.querySelector('#modal').open&&this.race.started&&!this.race.paused&&!this.race.finished){
      this.accumulator+=elapsed*this.speed;const started=performance.now();let steps=0;
      while(this.accumulator+1e-7>=STEP&&steps<64){this.race.step();this.accumulator-=STEP;steps++;if(this.race.finished)break;if(performance.now()-started>13)break;}
      if(this.accumulator>STEP*24){this.overload=(this.overload||0)+elapsed;if(this.speed===8&&this.overload>450){this.disable8=true;this.setSpeed(4);this.ui.toast('Недостаточно мощности для ×8. Скорость снижена до ×4.');this.overload=0;}}else this.overload=0;
      if(this.race.finished)this.finish();
      if(this.race.mechanisms.wallActive&&!this.warned){this.warned=true;this.audio.play('warning');}
    }else this.accumulator=0;
    if(this.ui.currentScreen==='setup'||this.ui.currentScreen==='race')this.renderer.draw(elapsed);if(now-(this.lastUI||0)>160){this.ui.update(this.race,c=>progress(this.race.map,c.body.position));this.refreshCameraFollow();this.lastUI=now;}
    this.raf=requestAnimationFrame(t=>this.frame(t));
  }
}
