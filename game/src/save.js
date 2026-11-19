import {VERSION,SAVE_VERSION,DEFAULT_SETTINGS,COLORS,U,STEP} from './config.js';
import {isBreakable,isColorBreakable,isCountedBreakable} from './breakables.js';
import {hash} from './random.js';
import {validateMap} from './map.js';
import {validatePartDraft} from './part-library.js';
import {defaultEquipped,migrateCatalog} from './shop.js';
import {GENERATION_OPTIONS} from './generation-options.js';
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const complete=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Запись прервана'));});
export function freshProfile(){return{coins:0,earned:0,owned:[],equipped:defaultEquipped(),stats:{races:0,correct:0,incorrect:0,streak:0,maxStreak:0,maxReward:0,byCount:{},bySize:{},recent:[]},completed:[],partLibrary:[],settings:structuredClone(DEFAULT_SETTINGS)};}
export function pack(profile,race=null){const data={gameVersion:VERSION,formatVersion:SAVE_VERSION,profile,race,savedAt:Date.now()};return{...data,checksum:hash(JSON.stringify(data)).toString(16)};}
function compareVersion(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
export function unpack(data){
  if(!data||typeof data.gameVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(data.gameVersion))throw Error('Не удалось прочитать версию сохранения');
  if(compareVersion(data.gameVersion,VERSION)>0){const error=Error('Это сохранение создано новой версией игры. Обновите игру.');error.code='FUTURE_VERSION';throw error;}
  if(data.formatVersion!==SAVE_VERSION)throw Error('Неподдерживаемый формат сохранения');
  const {checksum,...payload}=data;if(hash(JSON.stringify(payload)).toString(16)!==checksum)throw Error('Нарушена целостность сохранения');
  const p=data.profile;
  if(!p||!Number.isSafeInteger(p.coins)||p.coins<0||!Number.isSafeInteger(p.earned)||p.earned<0||!Array.isArray(p.completed)||!Array.isArray(p.owned)||!p.stats||!p.settings||!p.equipped)throw Error('Некорректные данные прогресса');
  const s=p.stats;if(!['races','correct','incorrect','streak','maxStreak','maxReward'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.correct+s.incorrect!==s.races||!Array.isArray(s.recent)||s.recent.length>20||!s.byCount||!s.bySize)throw Error('Некорректная статистика');
  if(!Array.isArray(p.settings.palette)||p.settings.palette.length!==12||p.settings.palette.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw Error('Некорректная палитра');
  for(const key of ['master','music','effects'])if(!Number.isFinite(p.settings[key])||p.settings[key]<0||p.settings[key]>1)throw Error('Некорректные настройки звука');
  if(p.settings.generationOptions!==undefined){const options=p.settings.generationOptions;if(!options||typeof options!=='object'||Array.isArray(options)||GENERATION_OPTIONS.some(({key})=>Object.hasOwn(options,key)&&typeof options[key]!=='boolean'))throw Error('Некорректные настройки генерации');}
  if(p.partLibrary!==undefined){
    if(!Array.isArray(p.partLibrary)||p.partLibrary.length>64)throw Error('Некорректная библиотека частей');
    const ids=new Set();for(const part of p.partLibrary){const result=validatePartDraft(part);if(!result.valid||ids.has(part.id))throw Error(`Некорректная часть карты: ${result.errors.join(' ')||'Повторяющийся идентификатор'}`);ids.add(part.id);}
  }
  if(data.race){const r=data.race;if(typeof r.id!=='string'||!Number.isInteger(r.count)||r.count<2||r.count>12||!Number.isSafeInteger(r.ticks)||r.ticks<0||r.cubes?.length!==r.count||!r.map||![1,2,3,4,5,6,7,8,9,10,11].includes(r.map.generatorVersion)||!Array.isArray(r.map.rooms)||r.map.rooms.length>30||!Array.isArray(r.map.walls)||r.map.walls.length>5000||!Array.isArray(r.map.mechanisms)||r.map.mechanisms.length>4000)throw Error('Некорректное состояние гонки');validateMap(r.map);
    for(const c of r.cubes)if(!Number.isInteger(c.id)||!Number.isFinite(c.position?.x)||!Number.isFinite(c.position?.y)||!Number.isFinite(c.velocity?.x)||!Number.isFinite(c.velocity?.y)||!Number.isFinite(c.size)||c.size<1||c.size>64)throw Error('Повреждены данные участников');
    validateBreakables(r);validateAuthoredMechanisms(r.map);validateTriggeredWalls(r);validateCosmeticTrail(r);
  }
  return data;
}
function validateCosmeticTrail(race){
  const h=race.cosmeticTrail;if(h===undefined)return;
  const fail=()=>{throw Error('Повреждена история следа');};
  if(!h||h.version!==1||h.raceId!==race.id||h.trail!=='line'||!Array.isArray(h.cubes)||h.cubes.length>race.count)fail();
  const ids=new Set();
  for(const c of h.cubes){if(!c||!Number.isInteger(c.id)||c.id<1||c.id>race.count||ids.has(c.id)||!Array.isArray(c.segments))fail();ids.add(c.id);
    for(const s of c.segments)if(!s||![s.a?.x,s.a?.y,s.b?.x,s.b?.y,s.width].every(Number.isFinite)||s.width<=0||s.width>U*64||!(typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)||Number.isInteger(s.color)&&s.color>=0&&s.color<=0xffffff))fail();
  }
}
export function validateAuthoredMechanisms(map){
  const supported=new Set(['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall','laser','spinner','press','bumper','conveyor','boost','slow','resize','portal','wall-start']);
  const byId=new Map(map.mechanisms.map(m=>[m.id,m]));
  if(byId.size!==map.mechanisms.length)throw Error('Повторяющиеся идентификаторы механизмов');
  for(const m of map.mechanisms){if(!m.authored)continue;
    const fail=()=>{throw Error('Повреждены авторские механизмы');};
    if(!supported.has(m.type)||typeof m.id!=='string'||!m.id||!Number.isInteger(m.roomId)||!map.rooms[m.roomId]||![m.x,m.y,m.w,m.h].every(Number.isFinite)||m.w<=0||m.h<=0||m.x<0||m.y<0||m.x>map.width||m.y>map.height)fail();
    for(const key of ['speed','period','on','phase','multiplier','duration','travel','dx','dy','colorSlot','hits','length'])if(m[key]!==undefined&&!Number.isFinite(m[key]))fail();
    if(m.type==='laser'){
      if(!(m.period>0)||!(m.on>=0&&m.on<=m.period)||!Number.isFinite(m.phase)||!Array.isArray(m.emitters)||m.emitters.length!==2||m.emitters.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))fail();
      const [a,b]=m.emitters;if((a.x===b.x)===(a.y===b.y)||Math.abs(m.x-(a.x+b.x)/2)>1e-6||Math.abs(m.y-(a.y+b.y)/2)>1e-6)fail();
    }
    if(['press','conveyor','wall-start'].includes(m.type)&&(!Number.isFinite(m.dx)||!Number.isFinite(m.dy)||Math.abs(m.dx)+Math.abs(m.dy)!==1))fail();
    if(m.type==='press'&&(!(m.period>0)||!(m.travel>=0)||!Number.isFinite(m.phase)))fail();
    if(m.type==='spinner'&&(!(m.length>0)||!Number.isFinite(m.speed)||!Number.isFinite(m.phase)))fail();
    if(['boost','slow'].includes(m.type)&&!(m.multiplier>0))fail();
    if(m.type==='slow'&&!(m.duration>0))fail();
    if(m.type==='portal'){const peer=byId.get(m.pair);if(!peer||peer===m||peer.type!=='portal'||peer.pair!==m.id)fail();}
    if(m.type.startsWith('breakable-color-')&&(!Number.isInteger(m.colorSlot)||m.colorSlot<0||m.colorSlot>11))fail();
  }
}
function validateTriggeredWalls(race){
  const starts=race.mechanisms?.triggeredWallStarts;if(starts===undefined)return;
  const markers=new Set(race.map.mechanisms.filter(m=>m.type==='wall-start').map(m=>m.id));
  if(!starts||typeof starts!=='object'||Array.isArray(starts)||Object.keys(starts).length>markers.size)throw Error('Повреждено состояние запуска стен');
  for(const [id,time]of Object.entries(starts))if(!markers.has(id)||!Number.isFinite(time)||time<0||time>race.ticks*STEP/1000+1e-6)throw Error('Повреждено состояние запуска стен');
}
function validateBreakables(race){
  const items=new Map(race.map.mechanisms.filter(m=>isBreakable(m.type)).map(m=>[m.id,m]));
  for(const m of items.values()){
    const shape=[m.x,m.y,m.w,m.h].every(Number.isFinite)&&m.w>0&&m.h>0;
    const thickness=isCountedBreakable(m.type)?Math.abs(Math.min(m.w,m.h)-U)<1e-6:Math.abs(m.w-U)<1e-6&&Math.abs(m.h-U)<1e-6;
    if(typeof m.id!=='string'||!shape||!thickness||(m.hits!==undefined&&(!Number.isSafeInteger(m.hits)||m.hits<1)))throw Error('Повреждены разрушаемые препятствия');
  }
  const saved=race.mechanisms?.breakables;if(!saved)return;
  if(!Array.isArray(saved.items)||saved.items.length>items.size||!Array.isArray(saved.contacts)||saved.contacts.length>items.size*race.count)throw Error('Повреждено состояние разрушаемых препятствий');
  const seen=new Set();
  for(const s of saved.items){const m=items.get(s.id),max=m&&(isCountedBreakable(m.type)?m.hits??3:1);
    if(!m||seen.has(s.id)||!Number.isSafeInteger(s.remainingHits)||s.remainingHits<0||s.remainingHits>max||(isColorBreakable(m.type)&&!/^#[0-9a-f]{6}$/i.test(s.damageColor)))throw Error('Повреждены счётчики разрушаемых препятствий');seen.add(s.id);
  }
  for(const key of saved.contacts){const at=typeof key==='string'?key.lastIndexOf(':'):-1,id=at>=0?Number(key.slice(at+1)):NaN;
    if(at<0||!items.has(key.slice(0,at))||!Number.isInteger(id)||id<1||id>race.count)throw Error('Повреждены контакты разрушаемых препятствий');
  }
}
export function award(profile,race){
  if(!race.finished||profile.completed.includes(race.id))return false;
  profile.completed.push(race.id);profile.coins+=race.reward;profile.earned+=race.reward;
  const s=profile.stats;s.races++;s.correct+=race.correct?1:0;s.incorrect+=race.correct?0:1;s.streak=race.correct?s.streak+1:0;s.maxStreak=Math.max(s.streak,s.maxStreak);s.maxReward=Math.max(s.maxReward,race.reward);
  for(const [group,key] of [['byCount',String(race.count)],['bySize',race.map.size]]){const g=s[group][key]||{races:0,correct:0};g.races++;g.correct+=race.correct?1:0;s[group][key]=g;}
  s.recent.unshift({id:race.id,count:race.count,size:race.map.size,seed:race.map.seed,winner:race.winner,prediction:race.prediction.selected,correct:race.correct,reward:race.reward,time:race.time,date:Date.now(),deaths:race.cubes.filter(c=>!c.alive).length});s.recent=s.recent.slice(0,20);return true;
}
export class SaveManager {
  constructor(){this.queue=Promise.resolve();this.profile=freshProfile();this.race=null;this.error=null;}
  async open(){
    this.db=await new Promise((resolve,reject)=>{const req=indexedDB.open('cube-chaos',1);req.onupgradeneeded=()=>req.result.createObjectStore('state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const tx=this.db.transaction('state','readonly'),store=tx.objectStore('state');const [current,backup]=await Promise.all([request(store.get('current')),request(store.get('backup'))]);
    if(current||backup){let restored=false;for(const data of [current,backup]){if(!data)continue;try{const valid=unpack(data);this.profile=migrateCatalog(valid.profile);this.race=valid.race;restored=true;if(data===backup)this.recovered=true;break;}catch(e){if(e.code==='FUTURE_VERSION')throw e;this.error=e;}}
      if(!restored)throw this.error;this.error=null;
    }
    try{const settings=JSON.parse(localStorage.getItem('cube-settings')||'null');if(settings&&COLORS.every((_,i)=>/^#[0-9a-f]{6}$/i.test(settings.palette?.[i])))this.profile.settings={...this.profile.settings,...settings};}catch{}
    return this;
  }
  transaction(update){
    const operation=this.queue.catch(()=>{}).then(async()=>{
      const next=structuredClone({profile:this.profile,race:this.race});const result=update(next);next.profile=migrateCatalog(next.profile);
      const packed=pack(next.profile,next.race);unpack(packed);
      const tx=this.db.transaction('state','readwrite'),done=complete(tx),store=tx.objectStore('state');
      const get=store.get('current');get.onsuccess=()=>{if(get.result){try{unpack(get.result);store.put(get.result,'backup');}catch{}}store.put(packed,'current');};
      await done;this.profile=next.profile;this.race=next.race;return result;
    });this.queue=operation;return operation;
  }
  saveRace(snapshot){return this.transaction(s=>{s.race=snapshot;});}
  finish(race){return this.transaction(s=>{award(s.profile,race);s.race=null;});}
  saveSettings(settings){try{localStorage.setItem('cube-settings',JSON.stringify(settings));}catch{}return this.transaction(s=>{s.profile.settings=structuredClone(settings);});}
  export(){return JSON.stringify(pack(this.profile,this.race),null,2);}
  import(text){if(text.length>8_000_000)throw Error('Файл слишком большой');const data=unpack(JSON.parse(text));return this.transaction(s=>{s.profile=migrateCatalog(data.profile);s.race=data.race;try{localStorage.removeItem('cube-settings');}catch{}});}
}
