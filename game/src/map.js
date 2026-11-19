import {U,ROOM,SIZES,GENERATOR_VERSION} from './config.js';
import {Random,hash} from './random.js';
import {MODULES,instantiateModule,parseTileGrid,DEFAULT_PORT_WIDTH} from './modules.js';
import {compilePart} from './part-library.js';
import {getPartObjectBounds} from './part-objects.js';
import {normalizeGenerationOptions,filterRandomMechanisms} from './generation-options.js';
const key=(x,y)=>`${x},${y}`;
const VERSION=GENERATOR_VERSION;
const rectOverlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const same=(a,b)=>Math.abs(a-b)<1e-6;
const opposite=(a,b)=>a.x===-b.x&&a.y===-b.y;
function cellsOf(floors){const cells=[];for(const f of floors)for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)cells.push({x,y});return cells;}

function placeAuthoredMechanism(source,roomId,x,y){
  const spec=structuredClone(source),namespace=`authored:${roomId}:`;
  spec.sourceId=source.id;spec.id=namespace+source.id;spec.roomId=roomId;spec.authored=true;
  spec.x+=x;spec.y+=y;
  if(spec.pair!==undefined)spec.pair=namespace+spec.pair;
  if(spec.groupId!==undefined)spec.groupId=namespace+spec.groupId;
  for(const field of ['start','end'])if(spec[field])spec[field]={...spec[field],x:spec[field].x+x,y:spec[field].y+y};
  if(spec.emitters)spec.emitters=spec.emitters.map(point=>({...point,x:point.x+x,y:point.y+y}));
  return spec;
}
function worldAuthoredMechanism(source,minX,minY){
  const spec={...source,x:(source.x-minX)*U,y:(source.y-minY)*U,w:source.w*U,h:source.h*U};
  for(const field of ['start','end'])if(source[field])spec[field]={...source[field],x:(source[field].x-minX)*U,y:(source[field].y-minY)*U};
  if(source.emitters)spec.emitters=source.emitters.map(point=>({...point,x:(point.x-minX)*U,y:(point.y-minY)*U}));
  return spec;
}

export function generateMap(seed,size='small',customParts=[],options={}){
  const spec=SIZES[size];if(!spec)throw Error('Неизвестный размер карты');
  const generationOptions=normalizeGenerationOptions(options);
  const configured=map=>{
    map.mechanisms=filterRandomMechanisms(map.mechanisms,generationOptions);
    map.generationOptions={...generationOptions};map.generationOptionsHash=hash(JSON.stringify(generationOptions)).toString(16).padStart(8,'0');
    // Disabled portals cannot remain shortcuts in progress/leader estimates.
    updateNavigation(map);return map;
  };
  const library=compileLibrary(customParts),moduleLibraryHash=libraryHash(library);
  const rng=new Random(`${VERSION}:${seed}:${size}${library.length?`:${moduleLibraryHash}`:''}`),count=rng.int(spec.min,spec.max);
  // Keep authored cells at unit scale. Prefer centered port overlaps; nearest
  // feasible side offsets retain seeded tie-breaking and physical seam walls.
  for(let attempt=0;attempt<(library.length?96:24);attempt++){
    try{return configured(assemble(seed,size,count,rng,library,moduleLibraryHash));}catch(error){if(error.code!=='PACKING')throw error;}
  }
  // A valid one-cell boundary lane can be incompatible with another copy next
  // to it. Keep the authored piece and requested count, then use ordinary
  // sections rather than dropping the enabled library on a retry.
  if(library.length)for(let attempt=0;attempt<16;attempt++){
    try{return configured(assemble(seed,size,count,rng,library,moduleLibraryHash,false,true));}catch(error){if(error.code!=='PACKING')throw error;}
  }
  throw Error('Не удалось подобрать совместимые части трассы');
}
function compileLibrary(parts){if(!Array.isArray(parts)||parts.length>64)throw Error('Библиотека может содержать не более 64 частей');const ids=new Set();return parts.filter(p=>p.enabled!==false).map(p=>{const part=compilePart(p);if(ids.has(part.id))throw Error('Идентификаторы частей не должны повторяться');ids.add(part.id);return part;}).sort((a,b)=>a.id.localeCompare(b.id));}
function libraryHash(library){return hash(JSON.stringify([VERSION,library])).toString(16).padStart(8,'0');}
function startModule(width){
  const height=Math.max(10,width+2),top=Math.floor((height-width)/2);
  return{id:`start-neck-${width}`,kind:'start',label:'Старт',grid:Array.from({length:height},(_,y)=>'б'.repeat(14)+(y>=top&&y<top+width?'б':'а').repeat(3)),ports:[{id:'out',x:17,y:top+width/2,width,direction:{x:1,y:0}}],chamber:{x:0,y:0,w:14,h:height},neck:{x:14,y:top,w:3,h:width}};
}
function assemble(seed,size,count,rng,library=[],moduleLibraryHash=libraryHash([]),preview=false,simple=false){
  const parts=[],occupied=new Map();
  function place(module,x,y){
    const p={id:parts.length,module:module.id,kind:module.kind,label:module.label,rotation:module.rotation||0,grid:[...module.grid],areas:module.areas.map(f=>({...f,x:f.x+x,y:f.y+y})),wallTiles:module.wallTiles.map(t=>({x:t.x+x,y:t.y+y})),x,y,w:module.w,h:module.h,links:[],ports:module.ports.map(port=>({...port,x:port.x+x,y:port.y+y,link:null})),floors:module.floors.map(f=>({...f,x:f.x+x,y:f.y+y})),finish:module.finish?{...module.finish,x:module.finish.x+x,y:module.finish.y+y}:null,...(module.wallMarker?{wallMarker:{x:module.wallMarker.x+x,y:module.wallMarker.y+y,direction:{...module.wallMarker.direction}}}:{})};
    p.mechanisms=(module.mechanisms||[]).map(spec=>placeAuthoredMechanism(spec,p.id,x,y));
    for(const field of ['chamber','neck'])if(module[field])p[field]={...module[field],x:module[field].x+x,y:module[field].y+y};
    parts.push(p);for(const cell of cellsOf(p.floors))occupied.set(key(cell.x,cell.y),p.id);return p;
  }
  function fits(module,x,y,at,connection){
    const bounds={x,y,w:module.w,h:module.h};if(parts.some(p=>rectOverlap(bounds,p)))return false;
    const cells=cellsOf(module.floors.map(f=>({...f,x:f.x+x,y:f.y+y})));
    for(const c of cells){if(occupied.has(key(c.x,c.y)))return false;
      for(const d of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}])if(occupied.has(key(c.x+d.x,c.y+d.y))){
        // Check the midpoint of the adjoining tile faces against the selected port.
        const mx=c.x+.5+d.x*.5,my=c.y+.5+d.y*.5;
        if(module.kind==='custom'||parts[at.owner].kind==='custom'||at.width!==connection.width)continue;
        if(at.direction.x){if(!same(mx,connection.x)||Math.abs(my-connection.y)>connection.width/2-.001)return false;}
        else if(!same(my,connection.y)||Math.abs(mx-connection.x)>connection.width/2-.001)return false;
      }
    }
    return true;
  }
  function attach(at,kind,needExit=true){
    const choices=[];
    const sources=Array.isArray(kind)?kind:typeof kind==='object'?[kind]:MODULES.filter(m=>m.kind===kind);
    for(const source of sources)for(let turns=0;turns<4;turns++){
      const m=instantiateModule(source,turns);
      for(const entry of m.ports){if((source.kind==='custom'&&entry.id!=='in')||!opposite(entry.direction,at.direction))continue;
        const difference=Math.abs(entry.width-at.width);
        for(let tileOffset=0;tileOffset<=difference;tileOffset++){
          const shift=tileOffset-difference/2,x=at.x-entry.x+(at.direction.y?shift:0),y=at.y-entry.y+(at.direction.x?shift:0);
          const center=at.width<=entry.width?at:{x:entry.x+x,y:entry.y+y},connection={x:center.x,y:center.y,width:Math.min(at.width,entry.width)};
          if(!Number.isInteger(x)||!Number.isInteger(y)||!fits(m,x,y,at,connection))continue;
          if(needExit){for(const exit of m.ports.filter(p=>p.id!==entry.id))choices.push({m,x,y,entry,exit,connection,alignment:Math.abs(shift),score:exit.direction.x===1?2:exit.direction.x===0?1:0,tie:rng.next()});}
          else choices.push({m,x,y,entry,exit:null,connection,alignment:Math.abs(shift),score:0,tie:rng.next()});
        }
      }
    }
    if(!choices.length)return null;
    choices.sort((a,b)=>a.alignment-b.alignment||b.score-a.score||a.tie-b.tie);const selected=choices[0];
    const p=place(selected.m,selected.x,selected.y),entry=p.ports.find(e=>e.id===selected.entry.id),parent=parts[at.owner];
    at.link=p.id;entry.link=parent.id;at.connection={...selected.connection};entry.connection={...selected.connection};parent.links.push(p.id);p.links.push(parent.id);
    return{part:p,out:selected.exit?p.ports.find(e=>e.id===selected.exit.id):null};
  }
  const firstCustom=library.length?rng.pick(library):null,firstWidth=firstCustom?firstCustom.ports.find(p=>p.id==='in').width:DEFAULT_PORT_WIDTH;
  const start=place(instantiateModule(startModule(firstWidth)),0,0);for(const p of start.ports)p.owner=start.id;
  let current=start.ports[0],branches=0;
  if(library.length){
    const added=attach(current,firstCustom);if(!added)throw packingError();for(const p of added.part.ports)p.owner=added.part.id;current=added.out;
  }
  const branchTarget=preview?0:Math.min(Math.max(1,Math.floor(count/5)),Math.max(0,count-parts.length-2)),interior=count-parts.length-1-branchTarget;
  for(let i=0;i<interior;i++){
    const desired=i===0?'junction':i===1?(interior>=3?'turn':'bypass'):i===2?'bypass':rng.pick(['straight','straight','turn','junction','bypass']);
    let added=!simple&&library.length&&rng.next()<.6?attach(current,library):null;if(!added)added=attach(current,desired);if(!added)added=attach(current,'straight');if(!added)throw packingError();
    for(const port of added.part.ports)port.owner=added.part.id;current=added.out;
    if(branches<branchTarget){const free=added.part.ports.filter(p=>p.link===null&&p!==current);
      for(const port of free){const dead=attach(port,'deadend',false);if(dead){for(const p of dead.part.ports)p.owner=dead.part.id;branches++;break;}}
    }
  }
  // If a reserved branch did not fit, fill that count with another authored part.
  while(parts.length<count-1){let added=attach(current,'turn')||attach(current,'straight');if(!added)throw packingError();for(const p of added.part.ports)p.owner=added.part.id;current=added.out;}
  const last=attach(current,'finish',false);if(!last)throw packingError();for(const p of last.part.ports)p.owner=last.part.id;
  const finishId=last.part.id;
  closeUnusedSeams(parts);
  const minX=Math.min(...parts.map(p=>p.x))-1,minY=Math.min(...parts.map(p=>p.y))-1;
  const floors=[],mechanisms=[];
  for(const part of parts){part.x-=minX;part.y-=minY;part.wx=part.x*U;part.wy=part.y*U;part.width=part.w*U;part.height=part.h*U;
    part.ports=part.ports.map(p=>({...p,x:(p.x-minX)*U,y:(p.y-minY)*U,width:p.width*U,...(p.connection?{connection:{x:(p.connection.x-minX)*U,y:(p.connection.y-minY)*U,width:p.connection.width*U}}:{})}));
    part.floors=part.floors.map(f=>({x:(f.x-minX)*U,y:(f.y-minY)*U,w:f.w*U,h:f.h*U,roomId:part.id}));floors.push(...part.floors);
    part.areas=part.areas.map(f=>({x:(f.x-minX)*U,y:(f.y-minY)*U,w:f.w*U,h:f.h*U,roomId:part.id}));
    part.wallTiles=part.wallTiles.map(t=>({x:(t.x-minX+.5)*U,y:(t.y-minY+.5)*U,w:U,h:U,roomId:part.id,authored:true}));
    if(part.wallMarker)part.wallMarker={...part.wallMarker,x:(part.wallMarker.x-minX)*U,y:(part.wallMarker.y-minY)*U};
    if(part.finish)part.finish={x:(part.finish.x-minX)*U,y:(part.finish.y-minY)*U,w:part.finish.w*U,h:part.finish.h*U};
    for(const field of ['chamber','neck'])if(part[field]){const r=part[field];part[field]={x:(r.x-minX)*U,y:(r.y-minY)*U,w:r.w*U,h:r.h*U};}
    mechanisms.push(...part.mechanisms.map(spec=>worldAuthoredMechanism(spec,minX,minY)));delete part.mechanisms;
  }
  const distances=parts.map(()=>Infinity),toward=parts.map(()=>null),queue=[finishId];distances[finishId]=0;
  for(let i=0;i<queue.length;i++){const p=parts[queue[i]];for(const id of p.links)if(!Number.isFinite(distances[id])){distances[id]=distances[p.id]+1;toward[id]=p.id;queue.push(id);}}
  for(const p of parts){p.distance=distances[p.id];p.next=toward[p.id];
    const exit=p.next===null?{x:1,y:0}:p.ports.find(port=>port.link===p.next).direction;p.exit={...exit};
    const linked=p.ports.find(port=>port.link===p.next),target=p.next===null?{x:p.finish.x+p.finish.w/2,y:p.finish.y+p.finish.h/2}:linked.connection||linked;
    p.sweeps=makeSweeps(p,target);p.wallLength=Math.max(...p.sweeps.map(s=>s.startOffset+s.length));
  }
  const remaining=p=>p.wallRemaining??(p.wallRemaining=p.wallLength+(p.next===null?0:remaining(parts[p.next])));
  const maxRemaining=Math.max(...parts.map(remaining));for(const p of parts)p.wallStart=(maxRemaining-p.wallRemaining)/32;
  const {walls,wallTiles}=buildWallGeometry(floors,parts.flatMap(p=>p.wallTiles));
  for(const part of parts)delete part.wallTiles;
  for(const part of parts)if(!preview&&!['start','finish','custom','adapter'].includes(part.kind))addMechanisms(part,mechanisms,rng);
  if(count>=9){const options=parts.filter(p=>(p.kind==='straight'||p.kind==='bypass')&&p.areas.some(f=>Math.max(f.w,f.h)>=10*U));if(options.length>=2){for(const [i,p]of [options[0],options.at(-1)].entries()){const f=[...p.areas].sort((a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h))[0],horizontal=f.w>=f.h,offset=(rng.next()<.5?-1:1)*3*U;mechanisms.push({id:`portal${i}`,type:'portal',pair:`portal${1-i}`,x:f.x+f.w/2+(horizontal?offset:0),y:f.y+f.h/2+(horizontal?0:offset),w:2*U,h:2*U,roomId:p.id,phase:0});}}}
  if(!preview)addBreakableMechanisms(parts,mechanisms,rng,size);
  const finish={...parts[finishId].finish,roomId:finishId},map={seed:String(seed),size,generatorVersion:VERSION,moduleLibraryHash,rooms:parts,walls,wallTiles,mechanisms,floors,start:{x:start.chamber.x+start.chamber.w/2,y:start.chamber.y+start.chamber.h/2,chamber:{...start.chamber},neck:{...start.neck}},finish,width:Math.max(...parts.map(p=>p.wx+p.width))+U,height:Math.max(...parts.map(p=>p.wy+p.height))+U,...(preview?{preview:true}:{})};
  validateMap(map);updateNavigation(map);return map;
}
export function createPartPreview(draft){
  const library=[compilePart(draft)],rng=new Random(`preview:${draft.id}`);
  // Compact turns may need one ordinary section before the full-size finish.
  for(const count of [3,4])for(let attempt=0;attempt<32;attempt++)try{return assemble(`preview:${draft.id}`,'small',count,rng,library,libraryHash(library),true);}catch(error){if(error.code!=='PACKING')throw error;}
  throw Error('Начало и конец части слишком близки: не удалось подключить старт и финиш.');
}
function closeUnusedSeams(parts){
  const cells=new Map(),closed=new Map(parts.map(p=>[p.id,new Set()])),protectedCells=new Set();
  for(const p of parts){for(const c of cellsOf(p.floors))cells.set(key(c.x,c.y),p.id);for(const port of p.ports)if(port.link!==null){const c=port.connection||port;for(let i=0;i<c.width;i++){const x=Math.floor(c.x-port.direction.x*.5+(port.direction.y?i-(c.width-1)/2:0)),y=Math.floor(c.y-port.direction.y*.5+(port.direction.x?i-(c.width-1)/2:0));protectedCells.add(key(x,y));}}if(p.wallMarker)protectedCells.add(key(Math.floor(p.wallMarker.x),Math.floor(p.wallMarker.y)));}
  // Seam sealing is allowed to fill unused openings, never an authored
  // mechanism, its laser emitters/beam or the complete path of a moving press.
  for(const p of parts)for(const mechanism of p.mechanisms){
    const bounds=getPartObjectBounds(mechanism);
    for(let y=Math.floor(bounds.y+1e-7);y<Math.ceil(bounds.y+bounds.h-1e-7);y++)for(let x=Math.floor(bounds.x+1e-7);x<Math.ceil(bounds.x+bounds.w-1e-7);x++)protectedCells.add(key(x,y));
  }
  for(const [coord,owner]of cells){const [x,y]=coord.split(',').map(Number);for(const [dx,dy]of [[1,0],[0,1]]){const otherKey=key(x+dx,y+dy),other=cells.get(otherKey);if(other===undefined||other===owner)continue;const a=parts[owner],b=parts[other],port=a.ports.find(p=>p.link===other),c=port?.connection||port,mx=x+.5+dx*.5,my=y+.5+dy*.5;
      if(c&&(port.direction.x?same(mx,c.x)&&Math.abs(my-c.y)<c.width/2:same(my,c.y)&&Math.abs(mx-c.x)<c.width/2))continue;
      const options=[{p:a,k:coord},{p:b,k:otherKey}].sort((aa,bb)=>(aa.p.kind==='custom')-(bb.p.kind==='custom'));
      const chosen=options.find(o=>!protectedCells.has(o.k));if(!chosen)throw packingError();closed.get(chosen.p.id).add(chosen.k);
    }}
  for(const p of parts){const blocked=closed.get(p.id);if(!blocked.size)continue;const grid=p.grid.map((row,y)=>Array.from(row,(cell,x)=>blocked.has(key(p.x+x,p.y+y))?'а':cell).join('')),geometry=parseTileGrid(grid);
    const free=new Set(geometry.airTiles.map(c=>key(c.x,c.y))),queue=geometry.airTiles.length?[geometry.airTiles[0]]:[],visited=new Set(queue.map(c=>key(c.x,c.y)));
    for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=queue[i].x+dx,y=queue[i].y+dy,k=key(x,y);if(free.has(k)&&!visited.has(k)){visited.add(k);queue.push({x,y});}}
    if(visited.size!==free.size||!free.size)throw packingError();
    p.floors=geometry.floors.map(f=>({...f,x:p.x+f.x,y:p.y+f.y}));p.areas=geometry.areas.map(f=>({...f,x:p.x+f.x,y:p.y+f.y}));
    for(const coord of blocked){const [x,y]=coord.split(',').map(Number);p.wallTiles.push({x,y,seam:true});}
  }
}
function packingError(){return Object.assign(Error('Недостаточно места для части'),{code:'PACKING'});}
function sharedEdge(a,b){
  if(same(a.x+a.w,b.x)||same(b.x+b.w,a.x)){const lo=Math.max(a.y,b.y),hi=Math.min(a.y+a.h,b.y+b.h);if(hi>lo)return{x:same(a.x+a.w,b.x)?b.x:a.x,y:(lo+hi)/2};}
  if(same(a.y+a.h,b.y)||same(b.y+b.h,a.y)){const lo=Math.max(a.x,b.x),hi=Math.min(a.x+a.w,b.x+b.w);if(hi>lo)return{x:(lo+hi)/2,y:same(a.y+a.h,b.y)?b.y:a.y};}
  return null;
}
export function makeSweeps(part,target){
  let floors=part.floors,sourceIndex=-1;
  if(part.wallMarker){
    const marker=part.wallMarker,d=marker.direction,horizontal=Boolean(d.x),at=floors.findIndex(f=>marker.x>=f.x&&marker.x<f.x+f.w&&marker.y>=f.y&&marker.y<f.y+f.h);
    if(at>=0){
      const f=floors[at],edge=(horizontal?marker.x:marker.y)-(d.x+d.y)*U/2,low=horizontal?f.x:f.y,high=low+(horizontal?f.w:f.h),cut=Math.max(low,Math.min(high,edge)),pieces=[];
      if(cut>low+.001)pieces.push({...f,...(horizontal?{w:cut-low}:{h:cut-low}),source:d.x+d.y<0});
      if(cut<high-.001)pieces.push({...f,...(horizontal?{x:cut,w:high-cut}:{y:cut,h:high-cut}),source:d.x+d.y>0});
      floors=[...floors.slice(0,at),...pieces,...floors.slice(at+1)];sourceIndex=floors.findIndex(f=>f.source);
    }
  }
  const graph=floors.map(()=>[]);for(let i=0;i<floors.length;i++)for(let j=i+1;j<floors.length;j++){const point=sharedEdge(floors[i],floors[j]);if(point){graph[i].push({id:j,point});graph[j].push({id:i,point});}}
  let root=floors.findIndex(f=>target.x>=f.x-.001&&target.x<=f.x+f.w+.001&&target.y>=f.y-.001&&target.y<=f.y+f.h+.001);if(root<0)root=0;
  const next=floors.map(()=>null),depth=floors.map(()=>Infinity),queue=[root];depth[root]=0;
  for(let i=0;i<queue.length;i++)for(const edge of graph[queue[i]])if(!Number.isFinite(depth[edge.id])){depth[edge.id]=depth[queue[i]]+1;next[edge.id]={id:queue[i],point:edge.point};queue.push(edge.id);}
  const sweeps=floors.map((f,i)=>{const point=i===root?target:next[i].point,dx=point.x-(f.x+f.w/2),dy=point.y-(f.y+f.h/2);const horizontal=i===sourceIndex?Boolean(part.wallMarker.direction.x):Math.abs(dx)>=Math.abs(dy),direction=i===sourceIndex?{dx:part.wallMarker.direction.x,dy:part.wallMarker.direction.y}:horizontal?{dx:Math.sign(dx)||part.exit.x||1,dy:0}:{dx:0,dy:Math.sign(dy)||part.exit.y||1};return{...f,...direction,length:horizontal?f.w:f.h,startOffset:0,next:next[i]?.id??null};});
  const remaining=i=>sweeps[i].remaining??(sweeps[i].remaining=sweeps[i].length+(sweeps[i].next===null?0:remaining(sweeps[i].next)));
  const longest=Math.max(...sweeps.map((_,i)=>remaining(i))),sourceOffset=sourceIndex<0?0:longest-sweeps[sourceIndex].remaining;for(const s of sweeps){s.startOffset=Math.max(0,longest-s.remaining-sourceOffset);delete s.remaining;}return sweeps;
}
// Tiles retain their individual identity for drawing/debugging. Only the
// Matter collider rectangles are merged; authored internal walls remain solid.
export function buildWallGeometry(floors,authoredTiles=[]){
  const occupied=new Map();for(const f of floors)for(let y=Math.round(f.y/U);y<Math.round((f.y+f.h)/U);y++)for(let x=Math.round(f.x/U);x<Math.round((f.x+f.w)/U);x++)occupied.set(key(x,y),f.roomId);
  const tiles=new Map();
  for(const tile of authoredTiles){const x=Math.round(tile.x/U-.5),y=Math.round(tile.y/U-.5),k=key(x,y);if(occupied.has(k))throw Error('Авторская стена перекрывает воздух другой части');tiles.set(k,{x,y,roomId:tile.roomId,authored:true});}
  for(const [coord,owner]of occupied){const [x,y]=coord.split(',').map(Number);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy,k=key(nx,ny);if(!occupied.has(k)&&!tiles.has(k))tiles.set(k,{x:nx,y:ny,roomId:owner,authored:false});
  }}
  const rows=new Map();for(const tile of tiles.values()){if(!rows.has(tile.y))rows.set(tile.y,new Map());rows.get(tile.y).set(tile.x,tile.roomId);}
  const walls=[],active=new Map();for(const y of [...rows.keys()].sort((a,b)=>a-b)){const xs=[...rows.get(y).keys()].sort((a,b)=>a-b);let start=xs[0],end=start;
    const run=()=>{const k=`${start}:${end}`,old=active.get(k);if(old&&old.y+old.h===y){old.h++;}else{const w={x:start,y,w:end-start+1,h:1,roomId:rows.get(y).get(start)};walls.push(w);active.set(k,w);}};
    for(let i=1;i<xs.length;i++){if(xs[i]===end+1)end=xs[i];else{run();start=end=xs[i];}}run();
  }
  return{walls:walls.map(w=>({x:(w.x+w.w/2)*U,y:(w.y+w.h/2)*U,w:w.w*U,h:w.h*U,roomId:w.roomId})),wallTiles:[...tiles.values()].sort((a,b)=>a.y-b.y||a.x-b.x).map(t=>({...t,x:(t.x+.5)*U,y:(t.y+.5)*U,w:U,h:U}))};
}
function addMechanisms(part,items,rng){
  const options=part.areas.filter(f=>Math.min(f.w,f.h)>=4*U);if(!options.length)return;
  const f=[...options].sort((a,b)=>b.w*b.h-a.w*a.h)[0],horizontal=f.w>=f.h,x=f.x+f.w/2,y=f.y+f.h/2;
  const type=rng.pick(['none','spinner','bumper','conveyor','press','boost','slow','laser','resize']);if(type==='none')return;
  const base={id:`m${items.length}`,type,x,y,w:U,h:U,roomId:part.id,phase:rng.next()*Math.PI*2};
  if(type==='spinner')Object.assign(base,{length:3.2,speed:(rng.next()<.5?-1:1)*.8});
  if(type==='conveyor')Object.assign(base,{w:horizontal?Math.min(f.w-2*U,6*U):3*U,h:horizontal?3*U:Math.min(f.h-2*U,6*U),dx:horizontal?1:0,dy:horizontal?0:1});
  if(type==='press')Object.assign(base,horizontal?{x,y:f.y+.75*U,w:3*U,h:U,dx:0,dy:1,travel:f.h/U-1.25,period:5}:{x:f.x+.75*U,y,w:U,h:3*U,dx:1,dy:0,travel:f.w/U-1.25,period:5});
  if(type==='boost'||type==='slow')Object.assign(base,{w:horizontal?2*U:4*U,h:horizontal?4*U:2*U,multiplier:type==='boost'?1.8:.5,duration:type==='boost'?1:2});
  if(type==='laser')Object.assign(base,{w:horizontal?.22*U:Math.min(f.w-2*U,4*U),h:horizontal?Math.min(f.h-2*U,4*U):.22*U,period:4,on:1.5});
  items.push(base);
}

const BREAKABLE_TYPES=['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall'];
// Use the full swept envelope for moving mechanisms, not just their authored
// starting box. New barriers must never spawn in a press trajectory or portal.
function mechanismEnvelope(m){
  let width=m.w||U,height=m.h||U;
  if(m.type==='spinner')width=height=m.length*U;
  if(m.type==='bumper')width=height=1.2*U;
  const travel=m.type==='press'?(m.travel||0)*U:0,dx=(m.dx||0)*travel,dy=(m.dy||0)*travel;
  return{x:m.x-width/2+Math.min(0,dx),y:m.y-height/2+Math.min(0,dy),w:width+Math.abs(dx),h:height+Math.abs(dy)};
}
function bypassStaysOpen(candidate){
  if(candidate.part.kind!=='bypass')return true;
  if(candidate.coloredRouteSafe!==undefined)return candidate.coloredRouteSafe;
  const {part,rect}=candidate,grid=part.grid,width=grid[0].length,height=grid.length;
  const blocked={x:Math.round((rect.x-part.wx)/U),y:Math.round((rect.y-part.wy)/U),w:Math.round(rect.w/U),h:Math.round(rect.h/U)};
  const free=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&grid[y][x]==='б'&&!(x>=blocked.x&&x<blocked.x+blocked.w&&y>=blocked.y&&y<blocked.y+blocked.h);
  const ports=part.ports.filter(p=>p.link!==null),cells=p=>Array.from({length:p.width/U},(_,i)=>{
    const shift=i-(p.width/U-1)/2;
    return{x:Math.floor((p.x-part.wx)/U-p.direction.x*.5+(p.direction.y?shift:0)),y:Math.floor((p.y-part.wy)/U-p.direction.y*.5+(p.direction.x?shift:0))};
  });
  if(ports.length<2)return candidate.coloredRouteSafe=false;
  const visited=new Uint8Array(width*height),queue=[];
  for(const cell of cells(ports[0]))if(free(cell.x,cell.y)){visited[cell.y*width+cell.x]=1;queue.push(cell);}
  for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const x=queue[i].x+dx,y=queue[i].y+dy,index=y*width+x;
    if(free(x,y)&&!visited[index]){visited[index]=1;queue.push({x,y});}
  }
  return candidate.coloredRouteSafe=ports.slice(1).every(port=>cells(port).some(cell=>visited[cell.y*width+cell.x]));
}
function addBreakableMechanisms(parts,items,rng,size){
  const air=new Set();for(const part of parts)for(const f of part.floors)for(let y=Math.round(f.y/U);y<Math.round((f.y+f.h)/U);y++)for(let x=Math.round(f.x/U);x<Math.round((f.x+f.w)/U);x++)air.add(key(x,y));
  const fromStart=parts.map(()=>Infinity),queue=[0];fromStart[0]=0;
  for(let i=0;i<queue.length;i++)for(const id of parts[queue[i]].links)if(!Number.isFinite(fromStart[id])){fromStart[id]=fromStart[queue[i]]+1;queue.push(id);}
  const candidates=[];
  for(const part of parts){
    if(part.kind==='start'||part.kind==='finish'||part.kind==='custom')continue;
    const coloredAllowed=fromStart[part.id]>=2&&['bypass','deadend'].includes(part.kind);
    const seen=new Set();
    for(const area of part.areas){
      const horizontal=area.w>=area.h,length=Math.round((horizontal?area.w:area.h)/U),across=Math.round((horizontal?area.h:area.w)/U);
      if(across<2||across>6||length<4)continue;
      const x0=Math.round(area.x/U),y0=Math.round(area.y/U);
      for(let offset=1;offset<length-1;offset++){
        const x=horizontal?x0+offset:x0,y=horizontal?y0:y0+offset;
        // A transverse wall spans a real corridor, with solid geometry on both
        // ends. Open junctions and the middle of a broad room are not candidates.
        const before=horizontal?key(x,y-1):key(x-1,y),after=horizontal?key(x,y+across):key(x+across,y);
        if(air.has(before)||air.has(after))continue;
        const signature=`${x}:${y}:${horizontal}`;if(seen.has(signature))continue;seen.add(signature);
        const rect={x:x*U,y:y*U,w:horizontal?U:across*U,h:horizontal?across*U:U};
        const clearance={x:rect.x-U/2,y:rect.y-U/2,w:rect.w+U,h:rect.h+U};
        if(items.some(item=>rectOverlap(clearance,mechanismEnvelope(item))))continue;
        candidates.push({part,horizontal,across,x,y,rect,coloredAllowed});
      }
    }
  }
  const desired=size==='small'?1:size==='medium'?2:Math.min(4,Math.max(2,Math.floor(parts.length/6)));
  const usedParts=new Set(),firstType=rng.int(0,BREAKABLE_TYPES.length-1);
  for(let group=0;group<desired;group++){
    let chosen=null,type=null;
    // Try the four variants in a seed-selected order. If a colored wall has no
    // safe alternative/dead-end location, use an any-color variant instead.
    for(let attempt=0;attempt<BREAKABLE_TYPES.length;attempt++){
      const variant=BREAKABLE_TYPES[(firstType+group+attempt)%BREAKABLE_TYPES.length],colored=variant.includes('-color-');
      const available=candidates.filter(c=>!usedParts.has(c.part.id)&&(!colored||(c.coloredAllowed&&bypassStaysOpen(c))));
      if(available.length){chosen=rng.pick(available);type=variant;break;}
    }
    if(!chosen)break;
    usedParts.add(chosen.part.id);
    const {rect,across,horizontal,part}=chosen,groupId=`break-group-${group}`,colorSlot=type.includes('-color-')?rng.int(0,11):null;
    const base={type,roomId:part.id,phase:0,groupId,...(colorSlot===null?{}:{colorSlot})};
    if(type.endsWith('-block')){
      for(let i=0;i<across;i++)items.push({...base,id:`${groupId}-${i}`,x:rect.x+(horizontal?.5:i+.5)*U,y:rect.y+(horizontal?i+.5:.5)*U,w:U,h:U,hits:1});
    }else items.push({...base,id:groupId,x:rect.x+rect.w/2,y:rect.y+rect.h/2,w:rect.w,h:rect.h,hits:rng.int(3,8)});
  }
}
export function updateNavigation(map){
  const parts=map.rooms,links=parts.map(p=>p.links.map(id=>({id,cost:(Math.max(p.width||ROOM.w*U,p.height||ROOM.h*U)+Math.max(parts[id].width||ROOM.w*U,parts[id].height||ROOM.h*U))/2})));
  for(const m of map.mechanisms)if(m.type==='portal'){const pair=map.mechanisms.find(p=>p.id===m.pair);if(pair)links[m.roomId].push({id:pair.roomId,cost:U});}
  const d=parts.map(()=>Infinity),open=new Set(parts.map(p=>p.id));d[map.finish.roomId]=0;
  while(open.size){let at=null;for(const id of open)if(at===null||d[id]<d[at])at=id;open.delete(at);for(const edge of links[at])if(d[edge.id]>d[at]+edge.cost)d[edge.id]=d[at]+edge.cost;}
  for(const p of parts)p.navigationDistance=d[p.id];
}
export function validateMap(map){
  if(!Array.isArray(map.rooms)||!map.rooms.length||map.rooms.length>30)throw Error('Некорректные части трассы');
  const seen=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const id of map.rooms[queue[i]].links){if(!map.rooms[id])throw Error('Несуществующая часть трассы');if(!seen.has(id)){seen.add(id);queue.push(id);}}
  if(seen.size!==map.rooms.length||!seen.has(map.finish.roomId))throw Error('Карта не связна');
  for(const p of map.rooms){if(p.id!==map.rooms.indexOf(p))throw Error('Некорректный номер части');for(const id of p.links){const n=map.rooms[id];if(!n.links.includes(p.id))throw Error('Одностороннее соединение частей');
      if((map.generatorVersion||1)===1){if(Math.abs(n.x-p.x)+Math.abs(n.y-p.y)!==1)throw Error('Некорректное соединение секций');}
      else{const a=p.ports.find(port=>port.link===id),b=n.ports.find(port=>port.link===p.id);if(!a||!b||!opposite(a.direction,b.direction))throw Error('Несовместимые точки соединения');
        const ac=a.connection||a,bc=b.connection||b;if(!same(ac.x,bc.x)||!same(ac.y,bc.y)||ac.width!==bc.width||ac.width<1||ac.width>Math.min(a.width,b.width)||!same(a.direction.x?a.x:a.y,a.direction.x?b.x:b.y)||Math.abs(a.direction.x?ac.y-a.y:ac.x-a.x)>a.width/2-ac.width/2+.001||Math.abs(b.direction.x?bc.y-b.y:bc.x-b.x)>b.width/2-bc.width/2+.001)throw Error('Несовместимые точки соединения');}
    }}
  if((map.generatorVersion||1)>=2){for(let i=0;i<map.rooms.length;i++)for(let j=i+1;j<map.rooms.length;j++){const a=map.rooms[i],b=map.rooms[j];if(rectOverlap({x:a.wx,y:a.wy,w:a.width,h:a.height},{x:b.wx,y:b.wy,w:b.width,h:b.height}))throw Error('Части трассы перекрываются');}}
  return true;
}
export function roomAt(map,p){return map.rooms.find(r=>(r.floors||[{x:r.wx,y:r.wy,w:ROOM.w*U,h:ROOM.h*U}]).some(f=>p.x>=f.x&&p.x<f.x+f.w&&p.y>=f.y&&p.y<f.y+f.h));}
export function progress(map,p){
  const r=roomAt(map,p);if(!r)return 0;
  if((map.generatorVersion||1)===1){const distance=r=>r.navigationDistance??r.distance,max=Math.max(...map.rooms.map(distance))+1;return Math.max(0,Math.min(.99,1-distance(r)/max));}
  const linked=r.ports.find(port=>port.link===r.next),target=r.next===null?{x:map.finish.x+map.finish.w/2,y:map.finish.y+map.finish.h/2}:linked.connection||linked;
  const local=Math.hypot(p.x-target.x,p.y-target.y),maximum=Math.max(...map.rooms.map(p=>p.navigationDistance+Math.max(p.width,p.height)));
  return Math.max(0,Math.min(.99,1-(r.navigationDistance+local)/Math.max(U,maximum)));
}
