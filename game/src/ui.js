import {SIZES,VERSION} from './config.js';
import {getCategoryItems} from './shop.js';
import {GENERATION_OPTIONS,normalizeGenerationOptions} from './generation-options.js';
export const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=n=>new Intl.NumberFormat('ru-RU').format(n);
export const clock=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const icons={target:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',leader:'<path d="m3 7 4 3 5-6 5 6 4-3-2 11H5L3 7Zm3 14h12"/>',play:'<path d="m9 5 10 7-10 7z"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',shop:'<path d="M4 8h16l-1 13H5L4 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',stats:'<path d="M4 20V10m8 10V4m8 16v-7"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',fit:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',pause:'<path d="M8 5v14m8-14v14"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',sound:'<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',coin:'<circle cx="12" cy="12" r="9"/><path d="M14 8h-3a4 4 0 0 0 0 8h3"/>',check:'<path d="m5 12 4 4L19 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'};
export const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.grid}</svg>`;
export const avatar=(id,color,extra='')=>`<span class="cube-avatar ${extra}" style="--cube:${escape(color)}"><i></i><i></i><b>${id}</b></span>`;

const SHOP_CATEGORIES={theme:{label:'Темы карт',icon:'grid'},skin:{label:'Скины кубиков',icon:'eye'},trail:{label:'Следы и эффекты',icon:'arrow'},finish:{label:'Оформление финиша',icon:'fit'}};
const SETTINGS_SECTIONS={sound:{label:'Звук',icon:'sound'},graphics:{label:'Графика',icon:'eye'},palette:{label:'Палитра',icon:'grid'},save:{label:'Сохранение',icon:'download'}};

// Tiny local SVG samples show cosmetic differences without loading a second game scene.
export function shopPreview(item){
  const style=item.style||item.id,id=`sample-${item.id.replace(/[^a-zA-Z0-9-]/g,'')}`,cubeColor='#738de5';
  const cube=(x,y,size,skin='classic')=>{
    const eyeY=y+size*.28,eyeSize=size*.19,left=x+size*.21,right=x+size*.59;
    return `<g><defs><clipPath id="${id}-clip-${x}-${y}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${skin==='round'?size*.5:0}"/></clipPath></defs><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${skin==='round'?size*.5:0}" fill="${cubeColor}" ${skin==='outline'?'stroke="#ffffff" stroke-width="3"':skin==='colored-outline'?'stroke="#5c71b7" stroke-width="3"':''}/>${skin==='stripe'?`<g clip-path="url(#${id}-clip-${x}-${y})" stroke="#3d59a9" stroke-width="${size*.11}"><path d="m${x-size} ${y+size} ${size*2} -${size*2}m-${size*.5} ${size*2} ${size*2} -${size*2}m-${size*.5} ${size*2} ${size*2} -${size*2}"/></g>`:''}<rect x="${left}" y="${eyeY}" width="${eyeSize}" height="${eyeSize}" fill="${skin==='black-eyes'?'#23262c':'#fff'}"/><rect x="${right}" y="${eyeY}" width="${eyeSize}" height="${eyeSize}" fill="${skin==='black-eyes'?'#23262c':'#fff'}"/>${`<rect x="${left+eyeSize*.38}" y="${eyeY+eyeSize*.28}" width="${eyeSize*.45}" height="${eyeSize*.58}" fill="${skin==='black-eyes'?'#fff':'#23262c'}"/><rect x="${right+eyeSize*.38}" y="${eyeY+eyeSize*.28}" width="${eyeSize*.45}" height="${eyeSize*.58}" fill="${skin==='black-eyes'?'#fff':'#23262c'}"/>`}${skin==='mad'?`<path d="m${left-1} ${eyeY-5} ${eyeSize+3} 4m${size*.15} 0 ${eyeSize+3} -4" fill="none" stroke="#23262c" stroke-width="3"/>`:''}</g>`;
  };
  let content='';
  if(item.category==='theme'){
    const floors={classic:'#ffffff',night:'#171b24',paper:'#f0e8d5',neon:'#0c1c2a'},walls={classic:'#b3b7ae',night:'#353c4b',paper:'#c6bba3',neon:'#234253'};
    const floor=floors[style]||floors.classic,wall=walls[style]||walls.classic;
    content=`<rect width="160" height="100" fill="${floor}"/>${style==='paper'?'<path d="M0 20h160M0 40h160M0 60h160M0 80h160" stroke="#ddd1b8" stroke-width="1"/>':''}<path d="M0 0h160v16H88v28H72V16H16v68h40v16H0ZM104 60h56v40H88V84h56v-8h-40Z" fill="${wall}" ${style==='neon'?'stroke="#36d5cf" stroke-width="1.5"':''}/>${cube(41,49,18)}`;
  }else if(item.category==='skin')content=cube(60,30,40,style);
  else if(item.category==='trail'){
    const trail=style==='tail'?'<path d="M27 57h71" stroke="#738de5" stroke-width="8"/><circle cx="22" cy="57" r="3" fill="#aab7ef"/>':style==='line'?'<path d="M22 58h38l17-13h22" fill="none" stroke="#738de5" stroke-width="2"/>':style==='ghost'?`<g opacity=".2">${cube(34,43,24)}</g><g opacity=".4">${cube(60,43,24)}</g><g opacity=".65">${cube(84,43,24)}</g>`:style==='fire'?'<path d="m25 58 15-12-3 10 19-19-3 16 19-15-3 13 28-9v28H43Z" fill="#e97632"/><path d="m55 61 18-12-2 12 25-10v16H62Z" fill="#f4c84f"/>':'';
    content=`${trail}${cube(106,43,24)}`;
  }else{
    const colors={classic:'#23262c',silver:'#b8c3ce',gold:'#d6ab38',diamond:'#94d9e5',emerald:'#26966a',ruby:'#b93e59'},fill=colors[style]||colors.classic;
    const finish=style==='classic'?`<defs><pattern id="${id}-checks" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><path d="M0 0h8v8H0zm8 8h8v8H8z" fill="#23262c"/></pattern></defs><rect x="84" y="10" width="28" height="80" fill="url(#${id}-checks)"/>`:`<rect x="84" y="10" width="28" height="80" fill="${fill}"/><path d="m84 10 28 20-28 20 28 20-28 20m28-80L84 30l28 20-28 20 28 20" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="1.5"/>`;
    content=`${finish}${cube(44,42,24)}`;
  }
  return `<svg class="cosmetic-sample" viewBox="0 0 160 100" fill="none" aria-hidden="true" focusable="false">${content}</svg>`;
}

export function renderShell(){
  document.querySelector('#app').innerHTML=`
    <section id="homeScreen" class="screen home-screen" aria-label="Главное меню">
      <div class="home-balance" aria-label="Баланс монет"><span class="coin-symbol">C</span><strong id="balance" data-balance>0</strong><span>монет</span></div>
      <div class="home-menu"><button class="primary home-start" data-screen="setup">Начать ${icon('play')}</button><button class="menu-button" data-screen="shop">${icon('shop')} Магазин</button><button class="menu-button" data-screen="settings">${icon('settings')} Настройки</button><button class="menu-button" data-screen="stats">${icon('stats')} Статистика</button></div>
    </section>
    <section id="gameScreen" class="screen game-screen" aria-label="Игра" hidden>
      <header class="screen-bar game-bar"><button class="back-button" data-screen="home" aria-label="В главное меню" title="В главное меню">${icon('arrow')}</button><h1 id="gameTitle">Настройка гонки</h1><button class="icon-button" data-screen="settings" aria-label="Настройки">${icon('settings')}</button></header>
      <div class="setup-view-tabs" id="setupViewTabs"><button class="active" data-setup-tab="settings">Настройка</button><button data-setup-tab="map">Карта</button></div>
      <div class="game-layout">
        <aside class="setup">
          <div class="setup-options prep-only"><div class="setting-group"><div class="label-row"><label for="count">Участники</label><strong id="countValue">6</strong></div><input id="count" type="range" min="2" max="12" value="6" step="1"></div><div class="setting-group"><div class="label-row"><label>Размер карты</label><span id="sectionCount" class="muted"></span></div><div class="size-options segmented">${Object.entries(SIZES).map(([key,s])=>`<button data-size="${key}" class="${key==='small'?'active':''}" aria-label="${s.label} карта">${key==='small'?'S':key==='medium'?'M':'L'}<small>${s.min}–${s.max}</small></button>`).join('')}</div></div></div>
          <div class="generation-actions prep-only"><button class="secondary generate-button" data-action="generate">${icon('refresh')} Новая карта</button><button class="secondary generation-settings-button" data-action="generation-settings" title="Выбрать ловушки генератора">${icon('settings')} Ловушки</button></div>
          <div class="label-row participant-heading"><h2 id="participantsLabel">Выбери кубик</h2><button class="text-button prep-only" data-screen="palette">Палитра</button></div>
          <p class="selection-hint" id="selectionHint">Выбери кубик здесь или на карте</p>
          <div id="participants" class="participants"></div>
          <div id="predictionSummary" class="prediction-summary"><span>Кубик не выбран</span></div>
          <div class="setup-bottom"><div class="reward-row prep-only"><span>Награда</span><strong><span class="coin-symbol">C</span><span id="rewardValue">360</span></strong></div><button class="primary start-button" id="startButton" data-action="start" disabled><span>Выбери кубик</span>${icon('play')}</button></div>
          <span id="phaseLabel" hidden></span><span id="phasePill" hidden></span>
        </aside>
        <section class="arena" aria-label="Карта">
          <div class="arena-top"><span id="mapSubtitle">Маленькая карта</span><button class="seed-button" data-action="copy-seed" aria-label="Скопировать seed"><span>Seed</span><strong id="seedValue"></strong>${icon('copy')}</button></div>
          <div id="viewport"><div class="stage-status"><span id="stageStatus">Готова к старту</span><span id="aliveCount">6 участников</span><time id="raceTime">00:00</time></div><div class="wall-warning" id="wallWarning" hidden></div><span id="stageHint" hidden></span><div class="pause-banner" id="pauseBanner" hidden><h2>Пауза</h2><button class="primary" data-action="pause">Продолжить ${icon('play')}</button></div><button class="restore-hud" data-action="hud" hidden>${icon('eye')} Интерфейс</button></div>
          <div class="arena-toolbar"><div class="time-controls"><button class="icon-button" data-action="pause" id="pauseButton" aria-label="Пауза" disabled>${icon('pause')}</button><div class="speed-controls" aria-label="Скорость симуляции">${[1,2,4,8].map(n=>`<button data-speed="${n}" class="${n===1?'active':''}">×${n}</button>`).join('')}</div></div><div class="camera-controls" role="group" aria-label="Камера"><button class="icon-button camera-follow-button" id="followSelected" data-action="follow-selected" aria-label="Следить за выбранным кубиком" title="Следить за выбранным кубиком" aria-pressed="false" disabled>${icon('target')}<span class="camera-target-id" aria-hidden="true" hidden></span></button><button class="icon-button camera-follow-button" id="followLeader" data-action="follow-leader" aria-label="Следить за лидером" title="Следить за лидером" aria-pressed="false">${icon('leader')}<span class="camera-target-id" aria-hidden="true" hidden></span></button><button class="icon-button" data-action="fit" aria-label="Показать всю карту" title="Показать всю карту">${icon('fit')}</button><button class="icon-button" data-action="reset-camera" aria-label="Сбросить камеру" title="Сбросить камеру">${icon('refresh')}</button><button class="icon-button" data-action="hud" aria-label="Скрыть интерфейс" title="Скрыть интерфейс">${icon('eye')}</button></div></div>
        </section>
      </div><div class="map-setup-actions"><span id="mapPrediction">Кубик не выбран</span><button id="mapStartButton" class="primary" data-action="start" disabled>Запустить</button></div>
    </section>
    <dialog id="modal" class="fullscreen-dialog"><header class="screen-bar modal-head"><button id="modalBack" class="back-button" data-action="close-modal" aria-label="Назад" title="Назад">${icon('arrow')}</button><h2 id="modalTitle"></h2><span class="bar-spacer"></span><span id="modalEyebrow" hidden></span></header><div id="modalBody"></div>
    <div id="systemControls"><button class="offline-status" id="offlineStatus" data-action="offline"><span class="live-dot"></span><span>Подготовка офлайн-ресурсов…</span></button><button class="secondary" data-action="install">Установить</button><button class="secondary" id="updateButton" data-action="update" hidden>Обновить</button></div>
    </dialog><div id="toasts" aria-live="polite"></div><input type="file" id="importFile" accept="application/json,.json" hidden>
  `;
}

export class UI {
  constructor(actions){
    renderShell();this.actions=actions;this.currentScreen='home';this.navigationId=0;this.settingsSection=null;this.shopCategory=null;this.shopPage=0;
    document.addEventListener('click',event=>{
      const target=event.target.closest('[data-action],[data-screen],[data-size],[data-speed],[data-cube],[data-shop],[data-equip],[data-category],[data-setting-section],[data-shop-page],[data-stat-tab],[data-menu],[data-setup-tab]');
      if(!target||target.disabled)return;
      if(target.dataset.action)actions.action(target.dataset.action,target);
      if(target.dataset.screen)actions.screen(target.dataset.screen);
      if(target.dataset.size)actions.size(target.dataset.size);
      if(target.dataset.speed)actions.speed(Number(target.dataset.speed));
      if(target.dataset.cube)actions.select(Number(target.dataset.cube));
      if(target.dataset.shop)actions.buy(target.dataset.shop);
      if(target.dataset.equip)actions.equip(target.dataset.equip);
      if(target.dataset.category)this.shop(actions.profile(),target.dataset.category);
      if(target.dataset.settingSection)this.settings(actions.profile(),target.dataset.settingSection);
      if(target.dataset.shopPage!==undefined)this.shop(actions.profile(),this.shopCategory,Number(target.dataset.shopPage));
      if(target.dataset.statTab)this.stats(actions.profile(),target.dataset.statTab);
      if(target.dataset.menu==='shop')this.shop(actions.profile());
      if(target.dataset.menu==='settings')this.settings(actions.profile());
      if(target.dataset.setupTab)this.setupView(target.dataset.setupTab);
    });
    document.querySelector('#count').addEventListener('input',event=>actions.count(Number(event.target.value)));
    document.querySelector('#modal').addEventListener('cancel',event=>{if(event.currentTarget.dataset.kind==='generation'){event.preventDefault();actions.action('close-generation',document.querySelector('#modalBack'));}});
    document.querySelector('#modal').addEventListener('close',()=>{this.navigationId++;document.body.dataset.menuSection='';document.querySelector('#app').append(document.querySelector('#toasts'));});
  }
  showScreen(screen){
    this.navigationId++;this.currentScreen=screen;
    const home=screen==='home';document.querySelector('#homeScreen').hidden=!home;document.querySelector('#gameScreen').hidden=home;
    document.querySelector('#gameTitle').textContent=screen==='race'?'Гонка':'Настройка гонки';if(screen==='setup')this.setupView('settings');
    if(home){document.body.classList.remove('hud-hidden');document.querySelector('.restore-hud').hidden=true;}
    this.close();
  }
  setupView(view){const screen=document.querySelector('#gameScreen');screen.dataset.setupView=view;document.querySelectorAll('[data-setup-tab]').forEach(b=>b.classList.toggle('active',b.dataset.setupTab===view));if(view==='map')requestAnimationFrame(()=>this.actions.action('fit'));}
  toast(message){const t=document.createElement('div');t.className='toast';t.textContent=message;document.querySelector('#toasts').append(t);setTimeout(()=>t.remove(),4200);}
  modal(title,html,eyebrow=''){
    this.navigationId++;document.querySelector('#modalTitle').textContent=title;document.querySelector('#modalEyebrow').textContent=eyebrow;document.querySelector('#modalBody').innerHTML=html;
    const back=document.querySelector('#modalBack');delete back.dataset.menu;back.dataset.action='close-modal';back.setAttribute('aria-label','Назад');back.title='Назад';
    const modal=document.querySelector('#modal');modal.append(document.querySelector('#toasts'));modal.dataset.kind='generic';document.body.dataset.menuSection='';if(!modal.open)modal.showModal();
  }
  setBack(menu){const back=document.querySelector('#modalBack');delete back.dataset.action;back.dataset.menu=menu;const label=menu==='shop'?'К категориям магазина':'К разделам настроек';back.setAttribute('aria-label',label);back.title=label;}
  close(){this.navigationId++;document.querySelector('#app').append(document.querySelector('#toasts'));document.querySelector('#modal').close();document.body.dataset.menuSection='';}
  prepare(race,profile){
    this.race=race;this.balance(profile);document.querySelector('#count').value=race.count;document.querySelector('#countValue').textContent=race.count;
    this.cameraFollow('manual',null,{selectedAvailable:false,leaderAvailable:true});
    document.querySelector('#sectionCount').textContent=`${race.map.rooms.length} частей`;document.querySelector('#mapSubtitle').textContent=`${SIZES[race.map.size].label} · ${race.map.rooms.length} частей`;
    document.querySelector('#seedValue').textContent=race.map.seed;document.querySelector('#rewardValue').textContent=number(10*race.count**2);
    document.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('active',b.dataset.size===race.map.size));
    document.querySelector('#participants').innerHTML=race.cubes.map(c=>`<button class="participant" data-cube="${c.id}" aria-label="Выбрать кубик ${c.id}" aria-pressed="false">${avatar(c.id,c.color)}<span class="participant-number">№ ${c.id}</span><span class="participant-status">Готов</span><span class="participant-progress"><i></i></span></button>`).join('');
    this.update(race);
  }
  cameraFollow(mode,targetId=null,{selectedAvailable=true,leaderAvailable=true}={}){
    const available={selected:!!selectedAvailable,leader:!!leaderAvailable};
    const active=(mode==='selected'||mode==='leader')&&available[mode]?mode:'manual';
    const target=Number.isInteger(Number(targetId))&&Number(targetId)>0?Number(targetId):null;
    this.cameraFollowMode=active;this.cameraFollowTargetId=active==='manual'?null:target;
    for(const [key,id,label,unavailable]of [['selected','followSelected','Следить за выбранным кубиком','Сначала выбери живого кубика'],['leader','followLeader','Следить за лидером','Нет доступного участника для слежения']]){
      const button=document.querySelector(`#${id}`);if(!button)continue;
      const pressed=active===key,suffix=pressed&&target!==null?` № ${target}`:'';
      button.disabled=!available[key];button.setAttribute('aria-pressed',String(pressed));
      button.setAttribute('aria-label',label+suffix);button.title=available[key]?label+suffix:`${label}: ${unavailable.toLowerCase()}`;
      const badge=button.querySelector('.camera-target-id');if(badge){badge.hidden=!pressed||target===null;badge.textContent=pressed&&target!==null?String(target):'';}
    }
    return {mode:this.cameraFollowMode,targetId:this.cameraFollowTargetId};
  }
  balance(profile){document.querySelectorAll('[data-balance]').forEach(el=>{el.textContent=number(profile.coins);});}
  update(race,progress){
    const running=race.started&&!race.finished,locked=!race.prediction.canChange(race.time,race.cubes,race.finished),selected=race.cubes.find(c=>c.id===race.prediction.selected);
    document.querySelector('.setup').classList.toggle('race-active',race.started);document.querySelector('#gameScreen').classList.toggle('race-mode',race.started);
    document.querySelector('#raceTime').textContent=clock(race.time);document.querySelector('#aliveCount').textContent=`${race.cubes.filter(c=>c.alive).length} / ${race.count}`;
    document.querySelector('#phaseLabel').textContent=race.finished?'Результат':running?'Гонка':'Подготовка';document.querySelector('#phasePill').textContent=race.finished?'Финиш':running?'В движении':'Выбор';
    document.querySelector('#stageStatus').textContent=race.finished?'Финиш':running?(race.paused?'Пауза':'Гонка'):'Карта';
    document.querySelector('#participantsLabel').textContent=running?'Участники':'Прогноз';document.querySelector('#selectionHint').textContent=running?(locked?'Прогноз зафиксирован':`Смена прогноза: ${Math.ceil(Math.max(0,5-race.time))} с`):'Выбери участника';
    document.querySelector('#count').disabled=race.started;document.querySelectorAll('[data-size],[data-action="generate"],[data-action="generation-settings"]').forEach(b=>{b.disabled=race.started;});
    const mapStart=document.querySelector('#mapStartButton');mapStart.disabled=!selected||race.started;document.querySelector('#mapPrediction').textContent=selected?`Прогноз: № ${selected.id}`:'Кубик не выбран';
    const button=document.querySelector('#startButton');button.disabled=!race.started&&!selected;button.dataset.action=race.finished?'results':running?'pause':'start';button.innerHTML=`<span>${race.finished?'Результаты':running?(race.paused?'Продолжить':'Пауза'):selected?'Запустить':'Выбери кубик'}</span>${icon(running?(race.paused?'play':'pause'):'play')}`;
    document.querySelector('#pauseButton').disabled=!running;document.querySelector('#pauseButton').innerHTML=icon(race.paused?'play':'pause');document.querySelector('#pauseBanner').hidden=!running||!race.paused;
    document.querySelector('#predictionSummary').innerHTML=selected?`${avatar(selected.id,selected.color)}<span>Прогноз: <strong>№ ${selected.id}</strong></span>${locked?`<span class="locked-mark">${icon('check')}</span>`:''}`:'<span>Кубик не выбран</span>';
    for(const c of race.cubes){const b=document.querySelector(`[data-cube="${c.id}"]`);if(!b)continue;b.classList.toggle('selected',race.prediction.selected===c.id);b.classList.toggle('dead',!c.alive);b.classList.toggle('winner',race.winner===c.id);b.setAttribute('aria-pressed',String(race.prediction.selected===c.id));b.disabled=locked||!c.alive;b.querySelector('.participant-status').textContent=race.winner===c.id?'Победа':!c.alive?'Погиб':running?'Жив':'Готов';if(progress)b.querySelector('.participant-progress i').style.width=`${race.winner===c.id?100:progress(c)*100}%`;}
    const warning=document.querySelector('#wallWarning'),remaining=SIZES[race.map.size].wall-race.time;warning.hidden=!running||remaining>5;warning.textContent=remaining>0?`Стена через ${Math.ceil(remaining)} с`:'Стена движется';
  }
  shop(profile,category=null,page=null){
    const debug=!!profile.settings?.debug,notice=debug?'<p class="shop-debug-notice">Режим отладки: примерка не сохраняется</p>':'';
    if(!category){this.shopCategory=null;this.shopPage=0;this.modal('Магазин',`${notice}<div class="category-grid">${Object.entries(SHOP_CATEGORIES).map(([key,c])=>`<button class="category-button" data-category="${key}">${icon(c.icon)}<span>${c.label}</span>${icon('arrow')}</button>`).join('')}</div>`);document.querySelector('#modal').dataset.kind='categories';return;}
    const items=getCategoryItems(category),pageCount=Math.max(1,Math.ceil(items.length/4));
    if(page===null)page=this.shopCategory===category?this.shopPage:0;page=Math.max(0,Math.min(pageCount-1,Math.floor(Number(page)||0)));this.shopCategory=category;this.shopPage=page;
    const header=debug?notice:`<div class="shop-balance"><span>Баланс</span><strong><span class="coin-symbol">C</span><span data-balance>${number(profile.coins)}</span></strong></div>`;
    const cards=items.slice(page*4,page*4+4).map(item=>{
      const owned=!item.price||profile.owned.includes(item.id),active=profile.equipped[category]===item.id,canEquip=debug||owned;
      const attributes=canEquip?`data-equip="${escape(item.id)}" aria-pressed="${active}"`:`data-shop="${escape(item.id)}" ${profile.coins<item.price?'disabled':''}`;
      const label=active?'Применено':debug?'Примерить':owned?'Применить':`${number(item.price)} монет`;
      return `<article class="shop-card" role="listitem" data-item="${escape(item.id)}"><div class="item-preview cosmetic-preview" data-preview="${escape(item.style||item.id)}">${shopPreview(item)}</div><div class="item-details"><span class="rarity">${escape(item.rarity)}</span><h3>${escape(item.name)}</h3></div><button class="${active?'equipped':'secondary'}" ${attributes}>${label}</button></article>`;
    }).join('');
    this.modal(SHOP_CATEGORIES[category].label,`${header}<div class="shop-grid" role="list">${cards}</div><div class="pagination"><button class="icon-button pagination-button" data-shop-page="${page-1}" aria-label="Предыдущая страница товаров" title="Предыдущая страница товаров" ${page===0?'disabled':''}>${icon('arrow')}</button><span>${page+1} / ${pageCount}</span><button class="icon-button pagination-button" data-shop-page="${page+1}" aria-label="Следующая страница товаров" title="Следующая страница товаров" ${page===pageCount-1?'disabled':''}>${icon('arrow')}</button></div>`);
    this.setBack('shop');document.querySelector('#modal').dataset.kind='shop';
  }
  generationSettings(options,page=0){
    const normalized=normalizeGenerationOptions(options),pageCount=Math.max(1,Math.ceil(GENERATION_OPTIONS.length/4));
    page=Math.max(0,Math.min(pageCount-1,Math.floor(Number(page)||0)));this.generationPage=page;
    this.modal('Ловушки',`<div class="generation-grid">${GENERATION_OPTIONS.slice(page*4,page*4+4).map(({key,label})=>`<label class="generation-option" for="generation-${escape(key)}"><span>${escape(label)}</span><input id="generation-${escape(key)}" type="checkbox" data-generation="${escape(key)}" ${normalized[key]?'checked':''}></label>`).join('')}</div><div class="pagination"><button class="icon-button pagination-button" data-action="generation-page" data-page="${page-1}" aria-label="Предыдущие ловушки" title="Предыдущие ловушки" ${page===0?'disabled':''}>${icon('arrow')}</button><span>${page+1} / ${pageCount}</span><button class="icon-button pagination-button" data-action="generation-page" data-page="${page+1}" aria-label="Следующие ловушки" title="Следующие ловушки" ${page===pageCount-1?'disabled':''}>${icon('arrow')}</button></div>`);
    const back=document.querySelector('#modalBack');delete back.dataset.menu;back.dataset.action='close-generation';back.setAttribute('aria-label','К настройке гонки');back.title='К настройке гонки';
    document.querySelector('#modal').dataset.kind='generation';
  }
  stats(profile,tab='overview'){
    const s=profile.stats;
    const tabs=`<div class="section-tabs" aria-label="Разделы статистики"><button data-stat-tab="overview" class="${tab==='overview'?'active':''}">Обзор</button><button data-stat-tab="counts" class="${tab==='counts'?'active':''}">Участники</button><button data-stat-tab="sizes" class="${tab==='sizes'?'active':''}">Карты</button><button data-stat-tab="history" class="${tab==='history'?'active':''}">История</button></div>`;
    let content='';
    if(tab==='overview')content=`<div class="stats-grid">${[['Завершено гонок',s.races],['Верных прогнозов',s.correct],['Неверных прогнозов',s.incorrect],['Точность',`${s.races?Math.round(s.correct/s.races*100):0}%`],['Текущая серия',s.streak],['Лучшая серия',s.maxStreak],['Заработано монет',number(profile.earned)],['Максимальная награда',number(s.maxReward)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
    if(tab==='counts')content=`<div class="stats-breakdown count-breakdown">${Array.from({length:11},(_,i)=>i+2).map(n=>{const g=s.byCount[n]||{races:0,correct:0};return`<div><span>${n} кубиков</span><strong>${g.correct} / ${g.races}</strong></div>`;}).join('')}</div>`;
    if(tab==='sizes')content=`<div class="stats-breakdown size-breakdown">${Object.entries(SIZES).map(([key,size])=>{const g=s.bySize[key]||{races:0,correct:0};return`<div><span>${size.label}</span><strong>${g.correct} / ${g.races}</strong></div>`;}).join('')}</div>`;
    if(tab==='history')content=s.recent.length?`<div class="history" tabindex="0" aria-label="История гонок">${s.recent.map(r=>`<div class="history-row"><span class="history-dot ${r.correct?'correct':''}"></span><span>${r.count} кубиков · ${SIZES[r.size]?.label||escape(r.size)}<small>${clock(r.time)} · победитель № ${r.winner} · прогноз № ${r.prediction}</small></span><strong>+${number(r.reward)}</strong></div>`).join('')}</div>`:'<div class="empty-state">Нет завершённых гонок</div>';
    this.modal('Статистика',`${tabs}<div class="stats-content ${tab==='history'?'history-content':''}">${content}</div>`);document.querySelector('#modal').dataset.kind='stats';
  }
  settings(profile,section=null){
    if(section===true)section='palette';if(section===false)section=null;this.settingsSection=section;
    if(!section){this.modal('Настройки',`<div class="category-grid">${Object.entries(SETTINGS_SECTIONS).map(([key,c])=>`<button class="category-button" data-setting-section="${key}">${icon(c.icon)}<span>${c.label}</span>${icon('arrow')}</button>`).join('')}</div><button class="category-button settings-editor-button" data-screen="editor">${icon('grid')}<span>Редактор частей</span>${icon('arrow')}</button>`);document.querySelector('#modal').dataset.kind='settings-categories';return;}
    const settings=profile.settings;let content='';
    if(section==='sound')content=`<div class="settings-content sound-settings">${[['master','Общая громкость'],['music','Музыка'],['effects','Эффекты']].map(([key,label])=>`<label class="slider-setting"><span>${label}</span><input data-setting="${key}" type="range" min="0" max="1" step="0.01" value="${settings[key]}" aria-label="${label}"></label>`).join('')}</div>`;
    if(section==='graphics')content=`<div class="settings-content graphics-settings"><label class="toggle-row" for="lowEffects"><span>Меньше эффектов</span><input id="lowEffects" data-setting="lowEffects" type="checkbox" ${settings.lowEffects?'checked':''}></label><label class="toggle-row" for="debug"><span>Режим отладки<small>Коллайдеры, скорости и механизмы</small></span><input id="debug" data-setting="debug" type="checkbox" ${settings.debug?'checked':''}></label></div>`;
    if(section==='palette')content=`<div class="palette-header"><span>Цвет участника</span><button class="text-button" data-action="reset-palette">Сбросить</button></div><div class="palette-editor">${settings.palette.map((color,i)=>`<label>${avatar(i+1,color)}<span>№ ${i+1}</span><input type="color" value="${color}" data-palette="${i}" aria-label="Цвет кубика ${i+1}"></label>`).join('')}</div><div class="palette-presets"><button class="secondary" data-action="palette-classic">Классическая</button><button class="secondary" data-action="palette-bright">Яркая</button><button class="secondary" data-action="palette-pastel">Пастельная</button></div>`;
    if(section==='save')content=`<div class="settings-content save-settings"><div class="save-actions"><button class="menu-button" data-action="export">${icon('download')} Экспорт JSON</button><button class="menu-button" data-action="import">${icon('refresh')} Импорт JSON</button></div><p class="save-note">Импорт заменит текущий прогресс после подтверждения.</p><p class="save-note">Храни резервную копию: браузер может удалить локальные данные.</p><span class="save-version">Версия ${VERSION}</span></div>`;
    this.modal(SETTINGS_SECTIONS[section].label,content);this.settingsSection=section;this.setBack('settings');document.querySelector('#modal').dataset.kind=`settings-${section}`;document.body.dataset.menuSection=section;
  }
  results(race){
    const c=race.cubes.find(c=>c.id===race.winner);
    this.modal('Результаты',`<div class="result-content"><div class="result-hero">${avatar(c.id,c.color,'winner-avatar')}<h3>Победитель — № ${c.id}</h3><p>${race.correct?'Верный прогноз':`Твой прогноз: № ${race.prediction.selected}`}</p><strong class="result-reward">+${number(race.reward)}<small> монет</small></strong></div><div class="result-stats"><span>Время<strong>${clock(race.time)}</strong></span><span>Участники<strong>${race.count}</strong></span><span>Погибло<strong>${race.cubes.filter(c=>!c.alive).length}</strong></span></div><p class="result-reason">${{finish:'Полное попадание на финиш',survivor:'Последний живой участник',last:'Последний погибший участник'}[race.finishReason]}</p><button class="primary" data-action="next">Следующая гонка ${icon('arrow')}</button></div>`);document.querySelector('#modal').dataset.kind='results';
  }
}
