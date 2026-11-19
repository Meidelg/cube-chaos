const DIRECTIONS={N:{x:0,y:-1},E:{x:1,y:0},S:{x:0,y:1},W:{x:-1,y:0}};
export const OBJECT_TYPES=[
  {type:'breakable-color-block',label:'Цветной разрушаемый блок'},
  {type:'breakable-block',label:'Разрушаемый блок'},
  {type:'breakable-color-wall',label:'Цветная стена со счётчиком'},
  {type:'breakable-wall',label:'Стена со счётчиком'},
  {type:'laser',label:'Лазер'},
  {type:'spinner',label:'Вращающаяся лопасть'},
  {type:'press',label:'Пресс'},
  {type:'bumper',label:'Отбойник'},
  {type:'conveyor',label:'Конвейер'},
  {type:'boost',label:'Ускоритель'},
  {type:'slow',label:'Замедлитель'},
  {type:'resize',label:'Изменение размера'},
  {type:'portal',label:'Телепорт'},
  {type:'wall-start',label:'Пуск стены'},
];
const TYPES=new Set(OBJECT_TYPES.map(item=>item.type)),label=type=>OBJECT_TYPES.find(item=>item.type===type)?.label||'Объект';
const DEFAULTS={
  'breakable-color-block':{hits:1,colorSlot:0},'breakable-block':{hits:1},
  'breakable-color-wall':{hits:3,colorSlot:0},'breakable-wall':{hits:3},
  laser:{period:4,on:1.5,phase:0},spinner:{length:3,speed:.8,phase:0},
  press:{travel:3,period:5,phase:0},bumper:{multiplier:2},conveyor:{},
  boost:{multiplier:1.8,duration:1},slow:{multiplier:.5,duration:2},resize:{factor:2},portal:{pair:null},'wall-start':{},
};
let objectSerial=0;
export function createPartObject(type,cell,options={}){
  if(!TYPES.has(type))throw Error('Неизвестный тип объекта.');
  const object={id:`object-${Date.now().toString(36)}-${(++objectSerial).toString(36)}`,type,x:cell.x,y:cell.y,w:1,h:1,direction:'E',...DEFAULTS[type],...(type==='laser'?{end:{x:cell.x+2,y:cell.y}}:{}),...options};
  if(object.end)object.end={...object.end};return object;
}

function compileObject(object){
  const o={...DEFAULTS[object.type],w:1,h:1,direction:'E',...object},d=DIRECTIONS[o.direction];
  const spec={id:o.id,type:o.type,x:o.x+o.w/2,y:o.y+o.h/2,w:o.w,h:o.h,direction:o.direction,dx:d.x,dy:d.y,phase:o.phase||0};
  if(o.type.startsWith('breakable-')){spec.hits=o.type.endsWith('-block')?1:o.hits;if(o.type.includes('-color-'))spec.colorSlot=o.colorSlot;}
  if(o.type==='spinner')Object.assign(spec,{length:o.length,speed:o.speed,phase:((o.phase+Math.atan2(d.y,d.x))%(Math.PI*2)+Math.PI*2)%(Math.PI*2)});
  if(o.type==='press')Object.assign(spec,{travel:o.travel,period:o.period});
  if(['boost','slow','bumper'].includes(o.type))spec.multiplier=o.multiplier;
  if(['boost','slow'].includes(o.type))spec.duration=o.duration;
  if(o.type==='resize')spec.factor=2;
  if(o.type==='portal')spec.pair=o.pair;
  if(o.type==='laser'){
    const start={x:o.x+.5,y:o.y+.5},end={x:o.end.x+.5,y:o.end.y+.5},horizontal=o.y===o.end.y;
    const dx=Math.sign(end.x-start.x),dy=Math.sign(end.y-start.y);
    Object.assign(spec,{x:(start.x+end.x)/2,y:(start.y+end.y)/2,w:horizontal?Math.abs(end.x-start.x)+1:.2,h:horizontal?.2:Math.abs(end.y-start.y)+1,dx,dy,direction:dx>0?'E':dx<0?'W':dy>0?'S':'N',period:o.period,on:o.on,start,end,emitters:[{...start},{...end}]});
  }
  return spec;
}

// Local tile units, top-left bounds. These include the entire movement envelope,
// not only the initial rectangle, and are shared with map seam protection.
export function getPartObjectBounds(spec){
  if(spec.type==='spinner'){const radius=Math.hypot(spec.length,.45)/2;return{x:spec.x-radius,y:spec.y-radius,w:radius*2,h:radius*2};}
  const width=spec.type==='bumper'?1.2:spec.type==='resize'?2:spec.w,height=spec.type==='bumper'?1.2:spec.type==='resize'?2:spec.h;
  const travel=spec.type==='press'?spec.travel:0,dx=(spec.dx||0)*travel,dy=(spec.dy||0)*travel;
  const bounds={x:spec.x-width/2+Math.min(0,dx),y:spec.y-height/2+Math.min(0,dy),w:width+Math.abs(dx),h:height+Math.abs(dy)};
  if(spec.type==='laser')for(const p of spec.emitters||[]){const right=Math.max(bounds.x+bounds.w,p.x+.5),bottom=Math.max(bounds.y+bounds.h,p.y+.5);bounds.x=Math.min(bounds.x,p.x-.5);bounds.y=Math.min(bounds.y,p.y-.5);bounds.w=right-bounds.x;bounds.h=bottom-bounds.y;}
  return bounds;
}

export function validatePartObjects(draft){
  const errors=[],warnings=[],objects=draft?.objects;
  if(objects===undefined)return{errors,warnings};
  if(!Array.isArray(objects)||objects.length>128)return{errors:['В части может быть не более 128 объектов.'],warnings};
  const grid=draft?.grid,w=Array.isArray(grid)&&typeof grid[0]==='string'?grid[0].length:0,h=Array.isArray(grid)?grid.length:0;
  const ids=new Map(),valid=[];
  const range=(value,min,max,whole=false)=>Number.isFinite(value)&&value>=min&&value<=max&&(!whole||Number.isInteger(value));
  for(let index=0;index<objects.length;index++){
    const object=objects[index],before=errors.length;
    if(!object||typeof object!=='object'||Array.isArray(object)||!TYPES.has(object.type)){errors.push(`Объект ${index+1}: неизвестный тип.`);continue;}
    const title=`${label(object.type)} ${index+1}`,o={...DEFAULTS[object.type],w:1,h:1,direction:'E',...object};
    if(typeof o.id!=='string'||!o.id.trim()||o.id.length>120)errors.push(`${title}: задайте идентификатор длиной до 120 символов.`);
    else if(ids.has(o.id))errors.push(`${title}: идентификатор объекта уже используется.`);else ids.set(o.id,o);
    if(!range(o.x,0,w-1,true)||!range(o.y,0,h-1,true))errors.push(`${title}: координаты должны указывать целую клетку внутри части.`);
    if(!range(o.w,1,32,true)||!range(o.h,1,32,true))errors.push(`${title}: размеры должны быть целыми от 1 до 32 клеток.`);
    if(!DIRECTIONS[o.direction])errors.push(`${title}: выберите направление N, E, S или W.`);
    if((o.type.endsWith('-block')||['laser','spinner','bumper','resize','portal','wall-start'].includes(o.type))&&(o.w!==1||o.h!==1))errors.push(`${title}: объект размещается одной клеткой.`);
    if(o.type.endsWith('-wall')&&o.w!==1&&o.h!==1)errors.push(`${title}: толщина разрушаемой стены должна быть 1 клетка.`);
    if(o.type.startsWith('breakable-')&&!range(o.hits,1,999,true))errors.push(`${title}: число ударов должно быть целым от 1 до 999.`);
    if(o.type.endsWith('-block')&&o.hits!==1)errors.push(`${title}: блок разрушается за один подходящий удар.`);
    if(o.type.includes('-color-')&&!range(o.colorSlot,0,11,true))errors.push(`${title}: номер цвета должен быть от 0 до 11.`);
    if(['spinner','press','laser'].includes(o.type)&&!range(o.phase,-Math.PI*2,Math.PI*2))errors.push(`${title}: начальная фаза должна быть конечным числом от −2π до 2π.`);
    if(o.type==='spinner'&&(!range(o.length,.5,12)||!range(o.speed,-4,4)))errors.push(`${title}: длина лопасти — 0,5–12, скорость — от −4 до 4.`);
    if(o.type==='press'&&(!range(o.travel,0,24)||!range(o.period,.25,60)))errors.push(`${title}: ход пресса — 0–24, период — 0,25–60 секунд.`);
    if(['boost','bumper'].includes(o.type)&&!range(o.multiplier,1,4))errors.push(`${title}: множитель ускорения должен быть от 1 до 4.`);
    if(o.type==='boost'&&o.duration!==1)errors.push(`${title}: ускорение длится ровно 1 секунду.`);
    if(o.type==='slow'&&(!range(o.multiplier,.05,1)||!range(o.duration,.1,30)))errors.push(`${title}: множитель замедления — 0,05–1, длительность — 0,1–30 секунд.`);
    if(o.type==='resize'&&o.factor!==2)errors.push(`${title}: доступно увеличение только в 2 раза.`);
    if(o.type==='laser'){
      if(!o.end||!range(o.end.x,0,w-1,true)||!range(o.end.y,0,h-1,true)||((o.x!==o.end.x)&&(o.y!==o.end.y))||(o.x===o.end.x&&o.y===o.end.y))errors.push(`${title}: две разные клетки лазера должны лежать на одной строке или колонке.`);
      if(!range(o.period,.25,60)||!range(o.on,.05,o.period))errors.push(`${title}: период должен быть 0,25–60 секунд, активное время — от 0,05 секунды до периода.`);
    }
    if(o.type==='portal'&&(typeof o.pair!=='string'||!o.pair||o.pair===o.id))errors.push(`${title}: назначьте второй телепорт пары.`);
    if(errors.length!==before)continue;
    const spec=compileObject(o),bounds=getPartObjectBounds(spec),left=Math.floor(bounds.x+1e-8),top=Math.floor(bounds.y+1e-8),right=Math.ceil(bounds.x+bounds.w-1e-8),bottom=Math.ceil(bounds.y+bounds.h-1e-8);
    let clear=left>=0&&top>=0&&right<=w&&bottom<=h;
    for(let y=top;clear&&y<bottom;y++)for(let x=left;x<right;x++)if(grid[y]?.[x]!=='б'){clear=false;break;}
    if(!clear)errors.push(`${title}: объект и вся область его движения должны находиться в воздухе внутри части.`);
    valid.push({o,spec,bounds,title});
  }
  for(const {o,title}of valid)if(o.type==='portal'){
    const other=ids.get(o.pair);
    if(!other||other.type!=='portal'||other.pair!==o.id)errors.push(`${title}: телепорты должны взаимно ссылаться друг на друга.`);
    else if(other.x===o.x&&other.y===o.y)errors.push(`${title}: телепорты пары должны находиться в разных клетках.`);
  }
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){const a=valid[i].bounds,b=valid[j].bounds;if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y){warnings.push('Области некоторых объектов пересекаются. Проверьте их взаимодействие в тестовой гонке.');i=valid.length;break;}}
  return{errors:[...new Set(errors)],warnings};
}

export function compilePartObjects(draft){
  const result=validatePartObjects(draft);if(result.errors.length)throw Error(result.errors.join('\n'));
  return(draft.objects||[]).map(compileObject);
}
