import {Container,Graphics} from 'pixi.js';
import {BASE_SPEED,U} from './config.js';
import {drawCube,normalizeSkinId} from './cube-cosmetics.js';

export const TRAIL_IDS=Object.freeze(['trail-classic','tail','ghost','fire','line']);
const ALIASES={classic:'trail-classic',comet:'tail',spark:'fire'};
const LIFE={tail:.48,ghost:.68,fire:.5};
const EPS=1e-8,CHUNK_SEGMENTS=128;
export function normalizeTrailId(id){const value=ALIASES[id]||id;return TRAIL_IDS.includes(value)?value:'trail-classic';}
const clamp=n=>Math.max(0,Math.min(1,n));
const pointCopy=p=>({x:p.x,y:p.y});

function rectangle(raw){
  if(raw?.min&&raw?.max)return{minX:raw.min.x,minY:raw.min.y,maxX:raw.max.x,maxY:raw.max.y};
  if(Number.isFinite(raw?.minX))return raw;
  return{minX:raw.x,minY:raw.y,maxX:raw.x+raw.w,maxY:raw.y+raw.h};
}
function clipInterval(a,b,r){
  let low=0,high=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q]of [[-dx,a.x-r.minX],[dx,r.maxX-a.x],[-dy,a.y-r.minY],[dy,r.maxY-a.y]]){
    if(p===0){if(q<0)return null;continue;}
    const t=q/p;if(p<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high)return null;
  }
  return[low,high];
}
function mergedIntervals(intervals){
  const result=[];intervals.sort((a,b)=>a[0]-b[0]);
  for(const current of intervals){const last=result.at(-1);if(last&&current[0]<=last[1])last[1]=Math.max(last[1],current[1]);else result.push([...current]);}
  return result;
}
function pointRectangleDistanceSquared(p,r){const x=Math.max(r.minX-p.x,0,p.x-r.maxX),y=Math.max(r.minY-p.y,0,p.y-r.maxY);return x*x+y*y;}
function pointSegmentDistanceSquared(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length):0;return (p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;}
function segmentRectangleDistanceSquared(a,b,r){
  if(clipInterval(a,b,r))return 0;
  return Math.min(pointRectangleDistanceSquared(a,r),pointRectangleDistanceSquared(b,r),
    ...[{x:r.minX,y:r.minY},{x:r.minX,y:r.maxY},{x:r.maxX,y:r.minY},{x:r.maxX,y:r.maxY}].map(p=>pointSegmentDistanceSquared(p,a,b)));
}

/** Exact coverage of a line segment, optionally including its round stroke.
 * A zero-width segment uses merged Liang–Barsky parameter intervals. For a
 * stroke, a vertical rectangle-union sweep examines uncovered open slabs and
 * computes exact segment/rectangle distances. It does not sample endpoints or
 * erase a partially covered segment; adjacent walls may cover a stroke jointly.
 */
export function segmentCoveredByRectangles(a,b,rectangles,radius=0){
  const bounds={minX:Math.min(a.x,b.x)-radius,minY:Math.min(a.y,b.y)-radius,maxX:Math.max(a.x,b.x)+radius,maxY:Math.max(a.y,b.y)+radius};
  const rects=rectangles.map(rectangle).filter(r=>r.minX<=bounds.maxX+EPS&&r.maxX>=bounds.minX-EPS&&r.minY<=bounds.maxY+EPS&&r.maxY>=bounds.minY-EPS);
  if(!rects.length)return false;
  if(radius<=0){
    const merged=mergedIntervals(rects.map(r=>clipInterval(a,b,r)).filter(Boolean));
    return merged.length===1&&merged[0][0]<=0&&merged[0][1]>=1;
  }
  const xs=[...new Set([bounds.minX,bounds.maxX,...rects.flatMap(r=>[Math.max(bounds.minX,r.minX),Math.min(bounds.maxX,r.maxX)])])].sort((x,y)=>x-y);
  for(let i=1;i<xs.length;i++){
    const minX=xs[i-1],maxX=xs[i];if(maxX<=minX)continue;
    const covered=mergedIntervals(rects.filter(r=>r.minX<=minX&&r.maxX>=maxX).map(r=>[Math.max(bounds.minY,r.minY),Math.min(bounds.maxY,r.maxY)]).filter(([low,high])=>high>=low));
    let cursor=bounds.minY;
    for(const [low,high]of [...covered,[bounds.maxY,bounds.maxY]]){
      if(low>cursor&&segmentRectangleDistanceSquared(a,b,{minX,minY:cursor,maxX,maxY:low})<radius*radius)return false;
      cursor=Math.max(cursor,high);
    }
  }
  return true;
}

export function pursuitRectangles(race){
  return (race?.mechanisms?.fronts||[]).filter(front=>front.body).map(front=>{
    const vertices=front.body.vertices;
    if(vertices?.length)return{minX:Math.min(...vertices.map(p=>p.x)),minY:Math.min(...vertices.map(p=>p.y)),maxX:Math.max(...vertices.map(p=>p.x)),maxY:Math.max(...vertices.map(p=>p.y))};
    return rectangle(front.body.bounds);
  });
}

function collinearExtension(segment,next,width,color){
  if(segment.width!==width||segment.color!==color)return false;
  const ax=segment.b.x-segment.a.x,ay=segment.b.y-segment.a.y,bx=next.x-segment.b.x,by=next.y-segment.b.y;
  const length=Math.hypot(ax,ay);return length>EPS&&ax*bx+ay*by>0&&Math.abs(ax*by-ay*bx)/length<.01;
}
function strokeSegment(g,s){g.moveTo(s.a.x,s.a.y).lineTo(s.b.x,s.b.y).stroke({color:s.color,width:s.width,alpha:1,cap:'round',join:'round'});}

/** Renderer-owned visual history, with no writes to cubes, bodies or race RNG.
 * Prefer a Pixi Container target. Permanent lines are cached in Graphics chunks;
 * draw(externalGraphics) is also supported as an uncached testing/fallback path.
 * Ages use race.time, so pausing or backgrounding does not age the trails.
 */
export class TrailEffects {
  constructor(target=null){
    this.target=target;this.states=new Map();this.trailId='trail-classic';this.skinId='skin-classic';this.lastPruneTime=-Infinity;
    if(target&&typeof target.addChild==='function'&&typeof target.moveTo!=='function'){
      this.lineLayer=new Container();this.transient=new Graphics();target.addChild(this.lineLayer,this.transient);
    }else this.transient=target;
  }
  setRace(race,cosmetics={},settings={}){
    const trail=normalizeTrailId(cosmetics.trail);
    if(this.race!==race||this.trailId!==trail)this.clear();
    this.race=race;this.cosmetics=cosmetics;this.settings=settings;this.trailId=trail;this.skinId=normalizeSkinId(cosmetics.skin);
    for(const cube of race?.cubes||[])if(!this.states.has(cube.id))this.states.set(cube.id,this.makeState(cube));
    return this;
  }
  makeState(cube){return{samples:[],segments:[],chunks:[],last:{...pointCopy(cube.body.position),time:this.race?.time||0,size:cube.size||1,color:cube.color},lastPortalUntil:cube.portalUntil||0,lastEmission:-Infinity};}
  clear(){
    for(const state of this.states.values())for(const chunk of state.chunks)this.destroyChunk(chunk);
    this.states.clear();this.transient?.clear?.();this.lastPruneTime=-Infinity;
  }
  destroyChunk(chunk){if(chunk.graphics){chunk.graphics.removeFromParent();chunk.graphics.destroy();chunk.graphics=null;}}
  clearState(state){for(const chunk of state.chunks)this.destroyChunk(chunk);state.samples=[];state.segments=[];state.chunks=[];state.last=null;}
  update(realDeltaMs=0){
    if(!this.race)return;const now=this.race.time||0,active=this.race.started&&!this.race.paused&&!this.race.finished;
    const currentIds=new Set(this.race.cubes.map(c=>c.id));
    for(const [id,state]of this.states)if(!currentIds.has(id)){this.clearState(state);this.states.delete(id);}
    for(const cube of this.race.cubes){
      let state=this.states.get(cube.id);if(!state){state=this.makeState(cube);this.states.set(cube.id,state);}
      if(!cube.alive){this.clearState(state);continue;}
      if(this.trailId!=='line'){const lifetime=LIFE[this.trailId]||0;state.samples=state.samples.filter(sample=>now-sample.time<=lifetime+EPS);}
      if(!active||this.trailId==='trail-classic')continue;
      const current={...pointCopy(cube.body.position),time:now,size:cube.size||1,color:cube.color},previous=state.last;
      const distance=previous?Math.hypot(current.x-previous.x,current.y-previous.y):0;
      const elapsed=previous?Math.max(0,now-previous.time):0;
      const teleported=(cube.portalUntil||0)>state.lastPortalUntil+EPS||previous&&distance>Math.max(3*U,elapsed*60*BASE_SPEED*5);
      state.lastPortalUntil=cube.portalUntil||0;
      if(this.trailId==='line'){
        if(previous&&distance>EPS&&!teleported)this.appendLine(state,previous,current,Math.max(2,current.size*U*.12),cube.color);
        state.last=current;
      }else if(distance>U*.06||teleported){
        const interval=this.trailId==='ghost'?.055:this.trailId==='fire'?.025:.008;
        if(now-state.lastEmission>=interval-EPS||teleported){state.samples.push({...current,breakBefore:!!teleported});state.lastEmission=now;state.last=current;}
      }
    }
    if(this.trailId==='line'&&now-this.lastPruneTime>=1/12){this.pruneLines(pursuitRectangles(this.race));this.lastPruneTime=now;}
  }
  appendLine(state,a,b,width,color){
    const previous=state.segments.at(-1);
    if(previous&&Math.abs(previous.b.x-a.x)<EPS&&Math.abs(previous.b.y-a.y)<EPS&&collinearExtension(previous,b,width,color)){previous.b=pointCopy(b);previous.chunk.dirty=true;return;}
    let chunk=state.chunks.at(-1);
    if(!chunk||chunk.segments.length>=CHUNK_SEGMENTS){chunk={segments:[],graphics:null,dirty:true};state.chunks.push(chunk);}
    const segment={a:pointCopy(a),b:pointCopy(b),width,color,chunk};chunk.segments.push(segment);chunk.dirty=true;state.segments.push(segment);
  }
  pruneLines(rects){
    if(!rects.length)return;
    for(const state of this.states.values()){
      let changed=false;
      for(const chunk of state.chunks){
        const remaining=chunk.segments.filter(s=>!segmentCoveredByRectangles(s.a,s.b,rects,s.width/2));
        if(remaining.length!==chunk.segments.length){chunk.segments=remaining;chunk.dirty=true;changed=true;}
        if(!remaining.length)this.destroyChunk(chunk);
      }
      if(changed){state.chunks=state.chunks.filter(c=>c.segments.length);state.segments=state.chunks.flatMap(c=>c.segments);}
    }
  }
  draw(externalGraphics=null){
    if(!this.race)return;const now=this.race.time||0,g=externalGraphics||this.transient;
    if(this.trailId==='line'){
      if(externalGraphics||!this.lineLayer){g?.clear?.();if(g)for(const state of this.states.values())for(const segment of state.segments)strokeSegment(g,segment);}
      else for(const state of this.states.values())for(const chunk of state.chunks)if(chunk.dirty){
        if(!chunk.graphics){chunk.graphics=new Graphics();this.lineLayer.addChild(chunk.graphics);}
        chunk.graphics.clear();for(const segment of chunk.segments)strokeSegment(chunk.graphics,segment);chunk.dirty=false;
      }
      return;
    }
    g?.clear?.();if(!g||this.trailId==='trail-classic')return;
    for(const cube of this.race.cubes){if(!cube.alive)continue;const state=this.states.get(cube.id);if(!state)continue;
      if(this.trailId==='ghost'){
        for(const sample of state.samples){const life=clamp(1-(now-sample.time)/LIFE.ghost);if(!life)continue;drawCube(g,{id:cube.id,color:sample.color,size:sample.size},this.skinId,{x:sample.x,y:sample.y,alpha:.5*life,raceId:this.race.id});}
      }else{
        this.drawTail(g,cube,state.samples,now,this.trailId==='fire');
        if(this.trailId==='fire')this.drawFire(g,cube,state.samples,now);
      }
    }
  }
  drawTail(g,cube,samples,now,fire=false){
    const lifetime=fire?LIFE.fire:LIFE.tail,size=(cube.size||1)*U;
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i];if(b.breakBefore)continue;const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<EPS)continue;
      const oldRadius=size*(fire?.34:.42)*clamp(1-(now-a.time)/lifetime),newRadius=size*(fire?.34:.42)*clamp(1-(now-b.time)/lifetime),nx=-dy/length,ny=dx/length;
      g.poly([a.x+nx*oldRadius,a.y+ny*oldRadius,b.x+nx*newRadius,b.y+ny*newRadius,b.x-nx*newRadius,b.y-ny*newRadius,a.x-nx*oldRadius,a.y-ny*oldRadius]).fill({color:fire?0xeb633b:cube.color,alpha:1});
      if(!this.settings.lowEffects)g.circle(b.x,b.y,newRadius).fill({color:fire?0xeb633b:cube.color,alpha:1});
    }
  }
  drawFire(g,cube,samples,now){
    const stride=this.settings.lowEffects?2:1;
    for(let i=1;i<samples.length;i+=stride){const sample=samples[i],previous=samples[i-1];if(sample.breakBefore)continue;
      const life=clamp(1-(now-sample.time)/LIFE.fire),dx=sample.x-previous.x,dy=sample.y-previous.y,length=Math.hypot(dx,dy);if(!life||length<EPS)continue;
      const tx=dx/length,ty=dy/length,nx=-ty,ny=tx,size=sample.size*U,flameLength=size*(.65+.13*Math.sin(i*2.1))*life,width=size*.31*life;
      const point=(along,across)=>[sample.x+tx*along+nx*across,sample.y+ty*along+ny*across];
      g.poly([...point(flameLength*.12,width),...point(-flameLength*.28,width*.65),...point(-flameLength,0),...point(-flameLength*.35,-width*.7),...point(flameLength*.12,-width)]).fill({color:0xf29a32,alpha:1});
      if(!this.settings.lowEffects)g.poly([...point(flameLength*.1,width*.45),...point(-flameLength*.58,0),...point(flameLength*.1,-width*.45)]).fill({color:0xffd66e,alpha:1});
    }
  }
  getSegments(cubeId){return(this.states.get(cubeId)?.segments||[]).map(({a,b,width,color})=>({a:pointCopy(a),b:pointCopy(b),width,color}));}
  exportHistory(){
    if(this.trailId!=='line'||!this.race)return null;
    return{version:1,raceId:this.race.id,trail:'line',cubes:this.race.cubes.filter(c=>c.alive).map(c=>({id:c.id,segments:this.getSegments(c.id)}))};
  }
  importHistory(history){
    if(this.trailId!=='line'||history?.version!==1||history.raceId!==this.race?.id||history.trail!=='line')return false;
    this.clear();
    for(const cube of this.race.cubes){const state=this.makeState(cube);this.states.set(cube.id,state);if(!cube.alive)continue;
      for(const s of history.cubes.find(c=>c.id===cube.id)?.segments||[])this.appendLine(state,s.a,s.b,s.width,s.color);
    }
    this.draw();return true;
  }
  destroy(){this.clear();this.lineLayer?.removeFromParent();this.lineLayer?.destroy({children:true});if(this.transient&&this.transient!==this.target){this.transient.removeFromParent();this.transient.destroy();}this.race=null;this.target=null;}
}
