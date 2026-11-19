import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,validateMap} from '../src/map.js';
import {U,SIZES,GENERATOR_VERSION} from '../src/config.js';

const types=new Set(['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall']);
const bounds=m=>({x:m.x-m.w/2,y:m.y-m.h/2,w:m.w,h:m.h});
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const inside=(point,rect)=>point.x>rect.x&&point.x<rect.x+rect.w&&point.y>rect.y&&point.y<rect.y+rect.h;
const coordinate=(x,y)=>`${x},${y}`;
function groups(map){
  const result=new Map();
  for(const item of map.mechanisms)if(types.has(item.type)){
    if(!result.has(item.groupId))result.set(item.groupId,[]);
    result.get(item.groupId).push(item);
  }
  return [...result.values()];
}
function fromStart(map){
  const distance=map.rooms.map(()=>Infinity),queue=[0];distance[0]=0;
  for(let i=0;i<queue.length;i++)for(const id of map.rooms[queue[i]].links)if(!Number.isFinite(distance[id])){distance[id]=distance[queue[i]]+1;queue.push(id);}
  return distance;
}
function envelope(m){
  let w=m.w,h=m.h,x=m.x,y=m.y;
  if(m.type==='spinner')w=h=Math.hypot(m.length,.45)*U;
  if(m.type==='bumper')w=h=1.2*U;
  if(m.type==='press'){
    const dx=m.dx*m.travel*U,dy=m.dy*m.travel*U;
    return{x:x-w/2+Math.min(0,dx),y:y-h/2+Math.min(0,dy),w:w+Math.abs(dx),h:h+Math.abs(dy)};
  }
  return{x:x-w/2,y:y-h/2,w,h};
}

test('New barrier placement is seed-repeatable and generates all four variants on connected maps',()=>{
  const found=new Set();
  for(const size of Object.keys(SIZES))for(let seed=0;seed<12;seed++){
    const map=generateMap(`breakable-placement-${seed}`,size);
    assert.deepEqual(map,generateMap(`breakable-placement-${seed}`,size));assert.equal(map.generatorVersion,GENERATOR_VERSION);assert.ok(validateMap(map));
    const barriers=map.mechanisms.filter(m=>types.has(m.type));assert.ok(barriers.length>0,'Every generated track in this sample has an added barrier');
    assert.ok(map.mechanisms.length<=200,'Placement must remain within the supported save format limit');
    for(const barrier of barriers)found.add(barrier.type);
  }
  assert.deepEqual([...found].sort(),[...types].sort());
});

test('Block rows are contiguous unit cells; counted walls are one-unit-thick single objects',()=>{
  for(const size of Object.keys(SIZES))for(let seed=0;seed<8;seed++)for(const group of groups(generateMap(`barrier-shape-${seed}`,size))){
    const item=group[0];assert.ok(typeof item.groupId==='string');assert.ok(group.every(m=>m.type===item.type&&m.roomId===item.roomId));
    if(item.type.endsWith('-block')){
      assert.ok(group.length>=2&&group.length<=6);
      for(const block of group){assert.equal(block.w,U);assert.equal(block.h,U);assert.equal(block.hits,1);assert.ok(Number.isInteger(block.x/U-.5));assert.ok(Number.isInteger(block.y/U-.5));}
      const vertical=group.every(b=>b.x===item.x),horizontal=group.every(b=>b.y===item.y);assert.ok(vertical||horizontal);
      const positions=group.map(b=>vertical?b.y:b.x).sort((a,b)=>a-b);for(let i=1;i<positions.length;i++)assert.equal(positions[i]-positions[i-1],U);
    }else{
      assert.equal(group.length,1);assert.equal(Math.min(item.w,item.h),U);assert.ok(Math.max(item.w,item.h)>=2*U&&Math.max(item.w,item.h)<=6*U);
      assert.ok(Number.isInteger(item.hits)&&item.hits>=3&&item.hits<=8);
    }
    if(item.type.includes('-color-')){assert.ok(Number.isInteger(item.colorSlot)&&item.colorSlot>=0&&item.colorSlot<12);assert.ok(group.every(m=>m.colorSlot===item.colorSlot));}
    else assert.ok(group.every(m=>!Object.hasOwn(m,'colorSlot')));
  }
});

test('Barriers occupy air, span solid corridor sides and avoid mechanisms including complete press travel',()=>{
  for(const size of Object.keys(SIZES))for(let seed=0;seed<8;seed++){
    const map=generateMap(`barrier-clearance-${seed}`,size),tiles=new Set(map.wallTiles.map(t=>coordinate(t.x,t.y)));
    for(const group of groups(map)){
      const left=Math.min(...group.map(m=>m.x-m.w/2)),top=Math.min(...group.map(m=>m.y-m.h/2)),right=Math.max(...group.map(m=>m.x+m.w/2)),bottom=Math.max(...group.map(m=>m.y+m.h/2));
      const rect={x:left,y:top,w:right-left,h:bottom-top},vertical=rect.h>rect.w;
      assert.equal(Math.min(rect.w,rect.h),U);
      for(const m of group){
        const r=bounds(m);
        for(let y=r.y+U/2;y<r.y+r.h;y+=U)for(let x=r.x+U/2;x<r.x+r.w;x+=U){assert.ok(map.floors.some(f=>inside({x,y},f)));assert.ok(!tiles.has(coordinate(x,y)));}
      }
      const before=vertical?{x:left+U/2,y:top-U/2}:{x:left-U/2,y:top+U/2},after=vertical?{x:left+U/2,y:bottom+U/2}:{x:right+U/2,y:top+U/2};
      assert.ok(tiles.has(coordinate(before.x,before.y))&&tiles.has(coordinate(after.x,after.y)),'The barrier terminates at actual solid corridor sides');
      for(const other of map.mechanisms)if(other.groupId!==group[0].groupId)assert.ok(!overlaps(rect,envelope(other)),`${group[0].id} intersects ${other.id}`);
    }
  }
});

test('Colored barriers stay on bypasses or dead ends away from the initial mandatory passage',()=>{
  for(const size of Object.keys(SIZES))for(let seed=0;seed<12;seed++){
    const map=generateMap(`colored-barrier-safety-${seed}`,size),distance=fromStart(map);
    for(const item of map.mechanisms.filter(m=>types.has(m.type))){
      const part=map.rooms[item.roomId];assert.notEqual(part.kind,'start');assert.notEqual(part.kind,'finish');
      if(item.type.includes('-color-')){assert.ok(['bypass','deadend'].includes(part.kind));assert.ok(distance[part.id]>=2);}
    }
  }
});

test('A colored barrier on a bypass leaves an ordinary alternate route between its linked ports',()=>{
  for(const size of Object.keys(SIZES))for(let seed=0;seed<10;seed++){
    const map=generateMap(`barrier-alternate-route-${seed}`,size);
    for(const group of groups(map)){
      if(!group[0].type.includes('-color-'))continue;
      const part=map.rooms[group[0].roomId];if(part.kind!=='bypass')continue;
      const available=new Set();
      for(let y=0;y<part.grid.length;y++)for(let x=0;x<part.grid[y].length;x++){
        const point={x:part.wx+(x+.5)*U,y:part.wy+(y+.5)*U};
        if(part.grid[y][x]==='б'&&!group.some(m=>inside(point,bounds(m))))available.add(coordinate(x,y));
      }
      const ports=part.ports.filter(p=>p.link!==null),cells=p=>{
        const result=[];
        for(let i=0;i<p.width/U;i++){
          const shift=i-(p.width/U-1)/2;
          const x=(p.x-part.wx)/U-p.direction.x*.5+(p.direction.y?shift:0),y=(p.y-part.wy)/U-p.direction.y*.5+(p.direction.x?shift:0);
          result.push({x:Math.floor(x),y:Math.floor(y)});
        }
        return result;
      };
      assert.ok(ports.length>=2);
      const queue=cells(ports[0]).filter(p=>available.has(coordinate(p.x,p.y))),seen=new Set(queue.map(p=>coordinate(p.x,p.y)));
      for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
        const next={x:queue[i].x+dx,y:queue[i].y+dy},key=coordinate(next.x,next.y);if(available.has(key)&&!seen.has(key)){seen.add(key);queue.push(next);}
      }
      for(const port of ports.slice(1))assert.ok(cells(port).some(p=>seen.has(coordinate(p.x,p.y))),`${group[0].groupId} blocks both arms of ${part.module}`);
    }
  }
});
