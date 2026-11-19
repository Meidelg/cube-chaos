// The authored tile pattern is the source of truth. Cyrillic «а» is a solid
// wall cell; «б» is walkable air. One character always occupies one game unit.
// Ports describe openings already present in these strings, never cut new ones.
export const DEFAULT_PORT_WIDTH=5;
// Legacy integer centers named six cells. Keep the first five unit cells and
// move the midpoint by half a cell; the discarded boundary cell is authored wall.
const port=(id,x,y,dx,dy)=>({id,x:x-(dy ? .5 : 0),y:y-(dx ? .5 : 0),direction:{x:dx,y:dy},width:DEFAULT_PORT_WIDTH});
export const MODULES = [
  {id:'start',kind:'start',label:'Старт',grid:[
    'ббббббббббббба',
    'ббббббббббббба',
    'бббббббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'ббббббббббббба',
    'ббббббббббббба',
    'ббббббббббббба',
  ],ports:[port('out',14,5,1,0)]},
  {id:'straight-8-6',kind:'straight',label:'Короткий участок',grid:[
    'бббббббб',
    'бббббббб',
    'бббббббб',
    'бббббббб',
    'бббббббб',
    'абббббба',
  ],ports:[port('in',0,3,-1,0),port('out',8,3,1,0)]},
  {id:'straight-12-6',kind:'straight',label:'Прямой участок',grid:[
    'бббббббббббб',
    'бббббббббббб',
    'бббббббббббб',
    'бббббббббббб',
    'бббббббббббб',
    'абббббббббба',
  ],ports:[port('in',0,3,-1,0),port('out',12,3,1,0)]},
  {id:'straight-18-6',kind:'straight',label:'Длинный участок',grid:[
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'абббббббббббббббба',
  ],ports:[port('in',0,3,-1,0),port('out',18,3,1,0)]},
  {id:'straight-24-6',kind:'straight',label:'Длинный участок',grid:[
    'бббббббббббббббббббббббб',
    'бббббббббббббббббббббббб',
    'бббббббббббббббббббббббб',
    'бббббббббббббббббббббббб',
    'бббббббббббббббббббббббб',
    'абббббббббббббббббббббба',
  ],ports:[port('in',0,3,-1,0),port('out',24,3,1,0)]},
  {id:'straight-10-8',kind:'straight',label:'Расширение',grid:[
    'ааббббббаа',
    'бббббббббб',
    'бббббббббб',
    'бббббббббб',
    'бббббббббб',
    'бббббббббб',
    'абббббббба',
    'ааббббббаа',
  ],ports:[port('in',0,4,-1,0),port('out',10,4,1,0)]},
  {id:'straight-16-8',kind:'straight',label:'Широкий участок',grid:[
    'ааббббббббббббаа',
    'бббббббббббббббб',
    'бббббббббббббббб',
    'бббббббббббббббб',
    'бббббббббббббббб',
    'бббббббббббббббб',
    'абббббббббббббба',
    'ааббббббббббббаа',
  ],ports:[port('in',0,4,-1,0),port('out',16,4,1,0)]},
  {id:'slalom',kind:'straight',label:'Внутренние стены',grid:[
    'ааббббббббббббаа',
    'ааббббббббббббаа',
    'бббббббббббббббб',
    'бббббббббббббббб',
    'бббббааббббббббб',
    'бббббааббббббббб',
    'бббббббббббббббб',
    'абббббббббббббба',
    'ааббббббббббббаа',
    'ааббббббббббббаа',
  ],ports:[port('in',0,5,-1,0),port('out',16,5,1,0)]},
  {id:'turn-tight',kind:'turn',label:'Поворот',grid:[
    'бббббббббббб',
    'бббббббббббб',
    'бббббббббббб',
    'бббббббббббб',
    'бббббббббббб',
    'аббббббббббб',
    'аааааабббббб',
    'аааааабббббб',
    'аааааабббббб',
    'аааааабббббб',
    'аааааабббббб',
    'ааааааббббба',
  ],ports:[port('in',0,3,-1,0),port('out',9,12,0,1)]},
  {id:'turn-long',kind:'turn',label:'Длинный поворот',grid:[
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'аббббббббббббббббб',
    'аааааааааааабббббб',
    'аааааааааааабббббб',
    'аааааааааааабббббб',
    'аааааааааааабббббб',
    'аааааааааааабббббб',
    'аааааааааааабббббб',
    'аааааааааааабббббб',
    'ааааааааааааббббба',
  ],ports:[port('in',0,3,-1,0),port('out',15,14,0,1)]},
  {id:'junction',kind:'junction',label:'Развилка',grid:[
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'бббббббббббббббббб',
    'абббббббббббббббба',
    'ааааааббббббаааааа',
    'ааааааббббббаааааа',
    'ааааааббббббаааааа',
    'ааааааббббббаааааа',
    'ааааааббббббаааааа',
    'ааааааббббббаааааа',
    'ааааааббббббаааааа',
    'аааааабббббааааааа',
  ],ports:[port('in',0,3,-1,0),port('out',18,3,1,0),port('branch',9,14,0,1)]},
  {id:'bypass',kind:'bypass',label:'Два маршрута',grid:[
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ббббббббббаааааааабббббббббб',
    'ббббббббббаааааааабббббббббб',
    'ббббббббббаааааааабббббббббб',
    'ббббббббббаааааааабббббббббб',
    'ббббббббббаааааааабббббббббб',
    'абббббббббааааааааббббббббба',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббаааа',
  ],ports:[port('in',0,9,-1,0),port('out',28,9,1,0)]},
  {id:'bypass-long',kind:'bypass',label:'Длинный обход',grid:[
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббааааааааааааааббббббаааа',
    'ббббббббббаааааааааааааабббббббббб',
    'ббббббббббаааааааааааааабббббббббб',
    'ббббббббббаааааааааааааабббббббббб',
    'ббббббббббаааааааааааааабббббббббб',
    'ббббббббббаааааааааааааабббббббббб',
    'абббббббббааааааааааааааббббббббба',
    'ааааббббббааааааааааааааббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
    'ааааббббббббббббббббббббббббббаааа',
  ],ports:[port('in',0,10,-1,0),port('out',34,10,1,0)]},
  {id:'dead-end-short',kind:'deadend',label:'Короткий тупик',grid:[
    'бббббббб',
    'бббббббб',
    'бббббббб',
    'бббббббб',
    'бббббббб',
    'аббббббб',
  ],ports:[port('in',0,3,-1,0)]},
  {id:'dead-end-long',kind:'deadend',label:'Длинный тупик',grid:[
    'ббббббббббббб',
    'ббббббббббббб',
    'ббббббббббббб',
    'ббббббббббббб',
    'ббббббббббббб',
    'абббббббббббб',
  ],ports:[port('in',0,3,-1,0)]},
  {id:'finish',kind:'finish',label:'Финиш',grid:[
    'аааабббббббббб',
    'аааабббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'бббббббббббббб',
    'аббббббббббббб',
    'аааабббббббббб',
    'аааабббббббббб',
  ],ports:[port('in',0,5,-1,0)],finish:{x:10,y:2,w:3,h:6}},
];

// Partition along every change in the actual tile pattern. Unlike a single
// greedy cover, this keeps corner/junction cells separate for pursuit turns.
function partitionAir(grid){
  const w=grid[0].length,h=grid.length,xCuts=new Set([0,w]),yCuts=new Set([0,h]);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++)if(grid[y][x]==='б'&&(x===0||grid[y][x-1]==='а'))xCuts.add(x);
    for(let x=1;x<=w;x++)if(grid[y][x-1]==='б'&&(x===w||grid[y][x]==='а'))xCuts.add(x);
    if(y===0||grid[y]!==grid[y-1])yCuts.add(y);
  }
  const xs=[...xCuts].sort((a,b)=>a-b),ys=[...yCuts].sort((a,b)=>a-b),rects=[];
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++)if(grid[ys[j]][xs[i]]==='б')rects.push({x:xs[i],y:ys[j],w:xs[i+1]-xs[i],h:ys[j+1]-ys[j]});
  return rects;
}
// A second, non-overlapping rectangular cover is used only to find broad, safe
// mechanism areas. Both covers are derived from the same canonical tile strings.
function broadAirAreas(grid){
  const used=new Set(),rects=[],w=grid[0].length,h=grid.length;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(grid[y][x]!=='б'||used.has(`${x},${y}`))continue;let width=0;
    while(x+width<w&&grid[y][x+width]==='б'&&!used.has(`${x+width},${y}`))width++;
    let height=1;
    outer:while(y+height<h){for(let i=0;i<width;i++)if(grid[y+height][x+i]!=='б'||used.has(`${x+i},${y+height}`))break outer;height++;}
    for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++)used.add(`${x+dx},${y+dy}`);
    rects.push({x,y,w:width,h:height});
  }
  return rects;
}
export function parseTileGrid(input){
  const grid=typeof input==='string'?input.replace(/\r\n/g,'\n').split('\n'):Array.isArray(input)?[...input]:null;
  if(!grid?.length||typeof grid[0]!=='string'||!grid[0].length||grid.some(row=>typeof row!=='string'||row.length!==grid[0].length))throw Error('Тайловая часть должна быть непустым прямоугольником строк');
  if(grid.some(row=>/[^аб]/u.test(row)))throw Error('Допустимы только кириллические «а» (стена) и «б» (воздух)');
  const airTiles=[],wallTiles=[];for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++)(grid[y][x]==='б'?airTiles:wallTiles).push({x,y});
  return{grid,w:grid[0].length,h:grid.length,airTiles,wallTiles,floors:partitionAir(grid),areas:broadAirAreas(grid)};
}
export function rotateTileGrid(input,turns=1){
  let grid=parseTileGrid(input).grid;
  for(let i=0;i<((turns%4)+4)%4;i++){const w=grid[0].length,h=grid.length;grid=Array.from({length:w},(_,y)=>Array.from({length:h},(_,x)=>grid[h-1-x][y]).join(''));}
  return grid;
}
export function rotatePoint(x,y,turns,w=14,h=10){let width=w,height=h;for(let i=0;i<((turns%4)+4)%4;i++){[x,y]=[height-y,x];[width,height]=[height,width];}return{x,y};}
const moduleCache=new WeakMap();
export function instantiateModule(id,turns=0){
  const source=typeof id==='object'?id:MODULES.find(m=>m.id===id);if(!source)throw Error(`Неизвестная часть ${id}`);
  turns=((turns%4)+4)%4;const signature=JSON.stringify([source.grid,source.ports,source.finish,source.wallMarker,source.mechanisms]);
  let cached=moduleCache.get(source);if(cached?.signature===signature&&cached.rotations.has(turns))return cached.rotations.get(turns);
  if(cached?.signature!==signature){cached={signature,rotations:new Map()};moduleCache.set(source,cached);}
  const original=parseTileGrid(source.grid);
  const geometry=parseTileGrid(rotateTileGrid(original.grid,turns));
  const transformRect=r=>{const p=rotatePoint(r.x+r.w/2,r.y+r.h/2,turns,original.w,original.h),w=turns%2?r.h:r.w,h=turns%2?r.w:r.h;return{x:p.x-w/2,y:p.y-h/2,w,h};};
  const ports=(source.ports||[]).map(port=>{const p=rotatePoint(port.x,port.y,turns,original.w,original.h);let{x,y}=port.direction;for(let i=0;i<turns;i++)[x,y]=[-y,x];return{...port,...p,direction:{x:x||0,y:y||0}};});
  for(const p of ports){const horizontal=p.direction.x!==0,len=horizontal?geometry.h:geometry.w,start=(horizontal?p.y:p.x)-p.width/2;
    if(!Number.isInteger(start)||start<0||start+p.width>len||Math.abs(p.direction.x)+Math.abs(p.direction.y)!==1||(horizontal?(p.direction.x<0?p.x!==0:p.x!==geometry.w):(p.direction.y<0?p.y!==0:p.y!==geometry.h)))throw Error(`Некорректный порт ${source.id}:${p.id}`);
    for(let i=0;i<p.width;i++){const x=horizontal?(p.direction.x<0?0:geometry.w-1):start+i,y=horizontal?start+i:(p.direction.y<0?0:geometry.h-1);if(geometry.grid[y][x]!=='б')throw Error(`Стена перекрывает порт ${source.id}:${p.id}`);}
  }
  let wallMarker;if(source.wallMarker){const p=rotatePoint(source.wallMarker.x,source.wallMarker.y,turns,original.w,original.h);let{x,y}=source.wallMarker.direction;for(let i=0;i<turns;i++)[x,y]=[-y,x];wallMarker={...p,direction:{x:x||0,y:y||0}};}
  const mechanisms=source.mechanisms?.map(spec=>{
    const p=rotatePoint(spec.x,spec.y,turns,original.w,original.h),result={...spec,...p,w:turns%2?spec.h:spec.w,h:turns%2?spec.w:spec.h};
    if(typeof spec.direction==='string'){const directions=['N','E','S','W'];result.direction=directions[(directions.indexOf(spec.direction)+turns)%4];}
    if(Number.isFinite(spec.dx)&&Number.isFinite(spec.dy)){let x=spec.dx,y=spec.dy;for(let i=0;i<turns;i++)[x,y]=[-y,x];result.dx=x||0;result.dy=y||0;}
    if(spec.type==='spinner')result.phase=((spec.phase+turns*Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    for(const endpoint of ['start','end'])if(spec[endpoint])result[endpoint]=rotatePoint(spec[endpoint].x,spec[endpoint].y,turns,original.w,original.h);
    if(spec.emitters)result.emitters=spec.emitters.map(emitter=>rotatePoint(emitter.x,emitter.y,turns,original.w,original.h));
    return result;
  });
  const result={...source,...geometry,rotation:turns,ports,...(source.finish?{finish:transformRect(source.finish)}:{}),...(wallMarker?{wallMarker}:{}),...(mechanisms?{mechanisms}:{})};cached.rotations.set(turns,result);return result;
}
