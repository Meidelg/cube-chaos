import {VERSION} from './config.js';
import {parseTileGrid} from './modules.js';
import {validatePartObjects,compilePartObjects} from './part-objects.js';

const DIRS={N:{x:0,y:-1},E:{x:1,y:0},S:{x:0,y:1},W:{x:-1,y:0}};
const integer=Number.isInteger;
let draftSerial=0;

// Port coordinates name the first boundary cell. Width extends down on W/E,
// and right on N/S, so even and odd openings never need rounded coordinates.
export function getPortCells(port){
  if(!port||!integer(port.width)||port.width<1||port.width>32)return[];
  return Array.from({length:port.width},(_,i)=>({x:port.x+(['N','S'].includes(port.side)?i:0),y:port.y+(['W','E'].includes(port.side)?i:0)}));
}
export function createPartDraft(w=12,h=10){
  w=Math.max(4,Math.min(32,Math.round(Number(w)||12)));h=Math.max(4,Math.min(32,Math.round(Number(h)||10)));
  const width=Math.min(6,h-2),top=Math.floor((h-width)/2);
  return{id:`part-${Date.now().toString(36)}-${(++draftSerial).toString(36)}`,name:'Новая часть',enabled:true,grid:Array.from({length:h},(_,y)=>(y>=top&&y<top+width?'б':'а').repeat(w)),entry:{x:0,y:top+Math.floor(width/2),side:'W',width:1},exit:{x:w-1,y:top+Math.floor(width/2),side:'E',width:1},wallStart:{x:0,y:top+Math.floor(width/2),direction:'E'},objects:[]};
}
export function validatePartDraft(draft){
  const errors=[],warnings=[];
  if(!draft||typeof draft!=='object'||Array.isArray(draft))return{valid:false,errors:['Часть должна быть объектом.'],warnings};
  if(typeof draft.id!=='string'||!draft.id.trim()||draft.id.length>120)errors.push('Задайте идентификатор части длиной до 120 символов.');
  if(typeof draft.name!=='string'||!draft.name.trim()||draft.name.length>80)errors.push('Название части должно содержать от 1 до 80 символов.');
  if(draft.enabled!==undefined&&typeof draft.enabled!=='boolean')errors.push('Признак использования части должен быть логическим.');
  let geometry;try{geometry=parseTileGrid(draft.grid);}catch(error){errors.push(error.message);return{valid:false,errors,warnings};}
  const {w,h,grid,airTiles}=geometry;
  if(w<4||h<4||w>32||h>32)errors.push('Размер части должен быть от 4×4 до 32×32 клеток.');
  if(!Array.isArray(draft.grid))errors.push('Сетка должна быть массивом строк.');
  if(!airTiles.length)errors.push('В части должен быть воздух.');
  const inBounds=(x,y)=>integer(x)&&integer(y)&&x>=0&&x<w&&y>=0&&y<h;
  const air=(x,y)=>inBounds(x,y)&&grid[y][x]==='б';
  const ports=[];
  for(const [label,p]of [['Начало секции',draft.entry],['Конец секции',draft.exit]]){
    if(!p||!DIRS[p.side]||!inBounds(p.x,p.y)||!integer(p.width)||p.width<1||p.width>32){errors.push(`${label}: поставьте хотя бы одну клетку прохода на границе.`);continue;}
    const edge=p.side==='W'?p.x===0:p.side==='E'?p.x===w-1:p.side==='N'?p.y===0:p.y===h-1;
    const cells=getPortCells(p);
    if(!edge||cells.some(c=>!inBounds(c.x,c.y)))errors.push(`${label}: проход должен целиком находиться на выбранной границе.`);
    else if(cells.some(c=>!air(c.x,c.y)))errors.push(`${label}: все клетки прохода должны быть воздухом.`);
    else ports.push(cells);
  }
  if(draft.entry&&draft.exit&&getPortCells(draft.entry).some(a=>getPortCells(draft.exit).some(b=>a.x===b.x&&a.y===b.y)))errors.push('Начало и конец секции не должны пересекаться.');
  const wall=draft.wallStart;
  if(!wall||!DIRS[wall.direction]||!air(wall.x,wall.y))errors.push('Поставьте начало движущейся стены в клетке воздуха и задайте направление.');
  else{const d=DIRS[wall.direction];if(!air(wall.x+d.x,wall.y+d.y))errors.push('Перед началом движущейся стены должен быть воздух по направлению её движения.');}
  if(ports.length===2&&airTiles.length){
    const visited=new Set(),queue=[ports[0][0]];visited.add(`${queue[0].x},${queue[0].y}`);
    for(let i=0;i<queue.length;i++)for(const d of Object.values(DIRS)){const x=queue[i].x+d.x,y=queue[i].y+d.y,k=`${x},${y}`;if(air(x,y)&&!visited.has(k)){visited.add(k);queue.push({x,y});}}
    if(ports[1].some(c=>!visited.has(`${c.x},${c.y}`)))errors.push('Между началом и концом секции нет прохода.');
    if(visited.size!==airTiles.length)errors.push('Все клетки воздуха должны соединяться с началом секции.');
    if(wall&&air(wall.x,wall.y)&&!visited.has(`${wall.x},${wall.y}`))errors.push('Начало движущейся стены должно соединяться с проходом секции.');
    // Unit-width routes are valid for ordinary cubes. A 2×2 footprint is
    // checked only to warn about clearance for enlarged participants.
    const clear=(x,y)=>air(x,y)&&air(x+1,y)&&air(x,y+1)&&air(x+1,y+1);
    const touch=(p,x,y)=>getPortCells(p).some(c=>c.x>=x&&c.x<=x+1&&c.y>=y&&c.y<=y+1);
    const starts=[];for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++)if(clear(x,y)&&touch(draft.entry,x,y))starts.push({x,y});
    const wideSeen=new Set(starts.map(c=>`${c.x},${c.y}`)),wideQueue=[...starts];
    for(let i=0;i<wideQueue.length;i++)for(const d of Object.values(DIRS)){const x=wideQueue[i].x+d.x,y=wideQueue[i].y+d.y,k=`${x},${y}`;if(clear(x,y)&&!wideSeen.has(k)){wideSeen.add(k);wideQueue.push({x,y});}}
    if(!wideQueue.some(c=>touch(draft.exit,c.x,c.y)))warnings.push('Проход шириной 1 клетка доступен обычному кубику; увеличенный кубик может не пройти.');
    if(airTiles.some(c=>!wideQueue.some(q=>c.x>=q.x&&c.x<=q.x+1&&c.y>=q.y&&c.y<=q.y+1)))warnings.push('Есть узкие клетки, в которых увеличенный кубик может застрять.');
  }
  const objects=validatePartObjects(draft);errors.push(...objects.errors);warnings.push(...objects.warnings);
  return{valid:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
export function compilePart(draft){
  const result=validatePartDraft(draft);if(!result.valid)throw Error(result.errors.join('\n'));
  const w=draft.grid[0].length,h=draft.grid.length;
  const port=(p,id)=>({id,x:p.side==='E'?w:p.side==='W'?0:p.x+p.width/2,y:p.side==='S'?h:p.side==='N'?0:p.y+p.width/2,direction:{...DIRS[p.side]},width:p.width});
  return{id:`custom:${draft.id}`,customId:draft.id,kind:'custom',label:draft.name.trim(),grid:[...draft.grid],ports:[port(draft.entry,'in'),port(draft.exit,'out')],wallMarker:{x:draft.wallStart.x+.5,y:draft.wallStart.y+.5,direction:{...DIRS[draft.wallStart.direction]}},mechanisms:compilePartObjects(draft)};
}
export function serializePartLibrary(parts){
  return JSON.stringify({gameVersion:VERSION,type:'cube-chaos-parts',formatVersion:2,parts:checkLibrary(parts)},null,2);
}
export function parsePartLibrary(input){
  let data;try{data=typeof input==='string'?JSON.parse(input):input;}catch{throw Error('Файл частей содержит некорректный JSON.');}
  if(data?.type!=='cube-chaos-parts'||![1,2].includes(data.formatVersion))throw Error('Неизвестный формат библиотеки частей.');
  if(data.formatVersion===2){
    if(typeof data.gameVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(data.gameVersion))throw Error('Не удалось прочитать версию библиотеки частей.');
    const incoming=data.gameVersion.split('.').map(Number),current=VERSION.split('.').map(Number);
    for(let i=0;i<3;i++)if(incoming[i]!==current[i]){if(incoming[i]>current[i])throw Error('Библиотека создана новой версией игры. Обновите игру.');break;}
  }
  return checkLibrary(data.parts);
}
function checkLibrary(parts){
  if(!Array.isArray(parts)||parts.length>64)throw Error('Библиотека может содержать не более 64 частей.');
  const ids=new Set();for(const part of parts){const result=validatePartDraft(part);if(!result.valid)throw Error(`${part?.name||'Часть'}: ${result.errors.join(' ')}`);if(ids.has(part.id))throw Error('Идентификаторы частей не должны повторяться.');ids.add(part.id);}
  return JSON.parse(JSON.stringify(parts));
}
// Legacy adapter helper. Current maps directly join overlapping ports while
// preserving the authored unit cells.
export function createPortAdapter(from,to){
  const h=Math.max(from,to)+2,w=4,a=Math.floor((h-from)/2),b=Math.floor((h-to)/2);
  const grid=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>y>=(x<2?a:b)&&y<(x<2?a+from:b+to)?'б':'а').join(''));
  return{id:`adapter:${from}:${to}`,kind:'adapter',label:'Переход',grid,ports:[{id:'in',x:0,y:a+from/2,width:from,direction:{x:-1,y:0}},{id:'out',x:w,y:b+to/2,width:to,direction:{x:1,y:0}}]};
}
