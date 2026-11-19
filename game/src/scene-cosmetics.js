import {Container,Graphics} from 'pixi.js';
import {U} from './config.js';
import {hash} from './random.js';

const THEME_PALETTES={
  classic:{floor:0xffffff,wall:0x969a9c,edge:0x797e80,background:0x969a9c,mode:'classic'},
  blueprint:{floor:0xe2edf3,wall:0x536e83,edge:0x354e62,background:0x536e83,mode:'classic'},
  candy:{floor:0xfff5f8,wall:0xc9a8ba,edge:0xaa879b,background:0xc9a8ba,mode:'classic'},
  night:{floor:0x101721,wall:0x272d3c,edge:0x505a6d,background:0x090d13,mode:'night',cubeGlow:true},
  neon:{floor:0x050609,wall:0x050609,edge:0xffffff,background:0x050609,objectColor:0x050609,mode:'neon',cubeGlow:false},
  paper:{floor:0xf3efe5,wall:0xfffefb,edge:0xb6b0a4,background:0xf3efe5,objectColor:0xfffefb,mode:'paper'},
};

const FINISH_STYLES={
  gold:{base:0xd8af42,edge:0x9b7422,light:0xfff0b2},
  silver:{base:0xb8c1ca,edge:0x79838e,light:0xf5fbff},
  diamond:{base:0xa9def2,edge:0x4d98b8,light:0xf3fdff},
  emerald:{base:0x289765,edge:0x16613d,light:0xc9ffe1},
  ruby:{base:0xc54162,edge:0x8e2447,light:0xffd8e4},
};

export function getTheme(id='classic'){
  const key=Object.hasOwn(THEME_PALETTES,id)?id:'classic';
  return{id:key,...THEME_PALETTES[key]};
}

// finishLayer paints every finish. Null means its classic checker treatment;
// the metal/gem styles additionally receive animated glints and a clipped sheen.
export function getFinishStyle(id){return FINISH_STYLES[id]?{...FINISH_STYLES[id]}:null;}

function visualRandom(seed){
  let state=hash(seed)||0x39ac15e7;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
}

export function rainbowColor(elapsedMs){
  const hue=((elapsedMs/48)%360+360)%360,sector=hue/60;
  const chroma=.9,x=chroma*(1-Math.abs(sector%2-1)),offset=.08;
  const values=sector<1?[chroma,x,0]:sector<2?[x,chroma,0]:sector<3?[0,chroma,x]:sector<4?[0,x,chroma]:sector<5?[x,0,chroma]:[chroma,0,x];
  const [r,g,b]=values.map(value=>Math.min(255,Math.round((value+offset)*255)));
  return(r<<16)|(g<<8)|b;
}

function colorNumber(value,fallback=0xffffff){
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))return Number.parseInt(value.slice(1),16);
  return fallback;
}

// Boundary segments use the existing unit-cell mask. Adjacent wall tiles share
// no visible interior edge, so neon follows the continuous map silhouette.
function wallSegments(map){
  if(!map.wallTiles?.length)return(map.walls||[]).flatMap(w=>{
    const x=w.x-w.w/2,y=w.y-w.h/2;
    return[[x,y,x+w.w,y],[x+w.w,y,x+w.w,y+w.h],[x+w.w,y+w.h,x,y+w.h],[x,y+w.h,x,y]];
  });
  const cells=new Set(map.wallTiles.map(t=>`${Math.round(t.x/U-.5)},${Math.round(t.y/U-.5)}`));
  const horizontal=new Map(),vertical=new Map();
  const add=(rows,axis,start)=>{if(!rows.has(axis))rows.set(axis,[]);rows.get(axis).push(start);};
  for(const tile of map.wallTiles){const x=Math.round(tile.x/U-.5),y=Math.round(tile.y/U-.5);
    if(!cells.has(`${x},${y-1}`))add(horizontal,y,x);
    if(!cells.has(`${x},${y+1}`))add(horizontal,y+1,x);
    if(!cells.has(`${x-1},${y}`))add(vertical,x,y);
    if(!cells.has(`${x+1},${y}`))add(vertical,x+1,y);
  }
  const segments=[];
  for(const [rows,isHorizontal]of [[horizontal,true],[vertical,false]])for(const [axis,starts]of rows){
    starts.sort((a,b)=>a-b);let first=starts[0],last=first;
    const flush=()=>segments.push(isHorizontal?[first*U,axis*U,(last+1)*U,axis*U]:[axis*U,first*U,axis*U,(last+1)*U]);
    for(let i=1;i<starts.length;i++){if(starts[i]===last+1)last=starts[i];else{flush();first=last=starts[i];}}flush();
  }
  return segments;
}

function traceSegments(g,segments){for(const [x1,y1,x2,y2]of segments)g.moveTo(x1,y1).lineTo(x2,y2);}
function traceBody(g,body){g.poly(body.vertices.flatMap(v=>[v.x,v.y]));}
function traceRect(g,m){g.rect(m.x-m.w/2,m.y-m.h/2,m.w,m.h);}

function traceMovingObjects(g,race){
  for(const m of race.mechanisms.items){if(m.removed)continue;
    if(m.body){traceBody(g,m.body);continue;}
    if(m.type==='laser'){
      if(m.emitters?.length)for(const p of m.emitters)g.rect(p.x-U/2,p.y-U/2,U,U);
      else {const horizontal=m.w>=m.h;for(const sign of [-1,1])g.circle(m.x+(horizontal?sign*m.w/2:0),m.y+(horizontal?0:sign*m.h/2),4);}
      if(m.active)traceRect(g,m);
    }else if(m.type==='portal'){
      g.circle(m.x,m.y,Math.min(m.w,m.h)*.42).circle(m.x,m.y,Math.min(m.w,m.h)*.27);
    }else traceRect(g,m);
  }
  for(const front of race.mechanisms.fronts)if(front.body)traceBody(g,front.body);
}

function drawContourPass(g,trace,width,alpha){trace(g);g.stroke({color:0xffffff,width,alpha});}

/** Visual-only scene decoration. Root owns the insertion order of public layers. */
export class SceneCosmetics {
  constructor(world){
    this.world=world;this.elapsedMs=0;this.destroyed=false;
    this.backgroundLayer=new Graphics();this.paperLayer=new Graphics();
    this.edgeGlowLayer=new Container();this.edgeStrokeLayer=new Container();this.cubeGlowLayer=new Container();this.finishLayer=new Container();
    this.staticGlow=new Graphics();this.dynamicGlow=new Graphics();this.staticStroke=new Graphics();this.dynamicStroke=new Graphics();
    this.edgeGlowLayer.addChild(this.staticGlow,this.dynamicGlow);this.edgeStrokeLayer.addChild(this.staticStroke,this.dynamicStroke);
    this.finishBase=new Graphics();this.finishAnimation=new Graphics();this.finishMask=new Graphics();
    this.finishLayer.addChild(this.finishBase,this.finishAnimation,this.finishMask);this.finishAnimation.mask=this.finishMask;
    this.layers={background:this.backgroundLayer,paper:this.paperLayer,edgeGlow:this.edgeGlowLayer,edgeStroke:this.edgeStrokeLayer,cubeGlow:this.cubeGlowLayer,finish:this.finishLayer};
    for(const [name,layer]of Object.entries(this.layers)){layer.label=`cosmetics-${name}`;layer.eventMode='none';}
    this.cubeGlows=new Map();this.motionQuery=typeof globalThis.matchMedia==='function'?globalThis.matchMedia('(prefers-reduced-motion: reduce)'):null;
  }

  setRace(race,cosmetics={},settings={}){
    if(this.destroyed)return;
    if(this.race!==race)this.elapsedMs=0;
    this.race=race;this.cosmetics={...cosmetics};this.settings=settings;this.theme=getTheme(cosmetics.theme);this.finishStyle=getFinishStyle(cosmetics.finish);this.hasSpecialFinish=!!this.finishStyle;
    for(const g of [this.backgroundLayer,this.paperLayer,this.staticGlow,this.dynamicGlow,this.staticStroke,this.dynamicStroke,this.finishBase,this.finishAnimation,this.finishMask])g.clear();
    this.cubeGlowLayer.removeChildren().forEach(child=>child.destroy());this.cubeGlows.clear();
    const map=race.map;
    this.backgroundLayer.rect(0,0,map.width,map.height).fill(this.theme.background);
    this.paperLayer.visible=this.theme.mode==='paper';
    if(this.paperLayer.visible)this.drawPaper(map);
    const neon=this.theme.mode==='neon';this.edgeStrokeLayer.visible=neon;this.edgeGlowLayer.visible=neon;
    if(neon){
      const segments=wallSegments(map),f=map.finish;
      segments.push([f.x,f.y,f.x+f.w,f.y],[f.x+f.w,f.y,f.x+f.w,f.y+f.h],[f.x+f.w,f.y+f.h,f.x,f.y+f.h],[f.x,f.y+f.h,f.x,f.y]);
      const trace=g=>traceSegments(g,segments);
      drawContourPass(this.staticStroke,trace,1.3,1);
      drawContourPass(this.staticGlow,trace,10,.025);drawContourPass(this.staticGlow,trace,6,.065);drawContourPass(this.staticGlow,trace,3,.16);
    }
    for(const cube of race.cubes){const glow=new Graphics();this.cubeGlowLayer.addChild(glow);this.cubeGlows.set(cube.id,{cube,glow,size:null,color:null});}
    this.prepareFinish(map);
    this.update(0);
  }

  drawPaper(map){
    const random=visualRandom(`${map.seed}:paper`),count=Math.min(1800,Math.max(240,Math.floor(map.width*map.height/(U*U)*.7)));
    for(let i=0;i<count;i++){const x=random()*map.width,y=random()*map.height,length=1+random()*5;this.paperLayer.moveTo(x,y).lineTo(x+length,y+(random()-.5)*1.2);}
    this.paperLayer.stroke({color:0xafa58f,width:.45,alpha:.2});
    for(let i=0;i<Math.min(700,count);i++)this.paperLayer.circle(random()*map.width,random()*map.height,.22+random()*.28);
    this.paperLayer.fill({color:0xc7bcaa,alpha:.16});
  }

  prepareFinish(map){
    this.finishLayer.visible=true;
    const f=map.finish;this.finishLayer.position.set(f.x,f.y);this.finishMask.rect(0,0,f.w,f.h).fill(0xffffff);
    if(!this.hasSpecialFinish){
      if(this.theme.mode==='neon'){
        for(let x=0;x<2;x++)for(let y=0;y<Math.ceil(f.h/(U/2));y++)this.finishBase.rect(x*U/2,y*U/2,U/2,Math.min(U/2,f.h-y*U/2));
        this.finishBase.stroke({color:0xffffff,width:1});
      }else{
        const paper=this.theme.mode==='paper',base=paper?0xfffefb:this.cosmetics.finish==='mint'?0x94d4ac:0xa9e6b7;
        this.finishBase.rect(0,0,f.w,f.h).fill(base);
        for(let x=0;x<2;x++)for(let y=0;y<Math.ceil(f.h/(U/2));y++)this.finishBase.rect(x*U/2,y*U/2,U/2,Math.min(U/2,f.h-y*U/2)).fill((x+y)%2?0xffffff:paper?0x8a8375:0x252a30);
      }
    }else if(this.theme.mode!=='neon'){
      this.finishBase.rect(0,0,f.w,f.h).fill(this.finishStyle.base);
      this.finishBase.rect(1,1,Math.max(0,f.w-2),Math.max(0,f.h-2)).stroke({color:this.finishStyle.edge,width:1});
      if(['diamond','emerald','ruby'].includes(this.cosmetics.finish)){
        this.finishBase.moveTo(f.w*.18,0).lineTo(f.w*.5,f.h*.38).lineTo(f.w*.82,0).moveTo(f.w*.5,f.h*.38).lineTo(f.w*.18,f.h).moveTo(f.w*.5,f.h*.38).lineTo(f.w*.82,f.h).stroke({color:this.finishStyle.light,width:1,alpha:.45});
      }
    }
    this.finishBase.tint=0xffffff;
    const random=visualRandom(`${map.seed}:${this.cosmetics.finish}:finish`);
    this.stars=Array.from({length:7},()=>({x:(.1+random()*.8)*f.w,y:(.08+random()*.84)*f.h,phase:random(),size:2+random()*3}));
  }

  update(realDeltaMs=0){
    if(this.destroyed||!this.race)return;
    const dt=Number.isFinite(realDeltaMs)?Math.max(0,Math.min(250,realDeltaMs)):0;this.elapsedMs+=dt;
    const reduced=!!this.motionQuery?.matches,low=!!this.settings.lowEffects,neon=this.theme.mode==='neon';
    this.outlineColor=rainbowColor(reduced?0:this.elapsedMs);
    if(neon){
      this.edgeStrokeLayer.tint=this.outlineColor;this.edgeGlowLayer.tint=this.outlineColor;
      this.finishBase.tint=this.outlineColor;
      this.dynamicStroke.clear();this.dynamicGlow.clear();
      const trace=g=>traceMovingObjects(g,this.race);
      drawContourPass(this.dynamicStroke,trace,1.3,1);
      this.edgeGlowLayer.visible=!low;
      if(!low){drawContourPass(this.dynamicGlow,trace,9,.025);drawContourPass(this.dynamicGlow,trace,5,.07);drawContourPass(this.dynamicGlow,trace,2.5,.18);}
    }
    this.cubeGlowLayer.visible=!!this.theme.cubeGlow&&!low;
    for(const entry of this.cubeGlows.values()){
      const {cube,glow}=entry;glow.visible=cube.alive;if(!glow.visible||!this.cubeGlowLayer.visible)continue;
      if(entry.size!==cube.size){const radius=cube.size*U*.62;glow.clear();for(const [scale,alpha]of [[2.1,.015],[1.75,.025],[1.4,.045],[1.1,.07]])glow.circle(0,0,radius*scale).fill({color:0xffffff,alpha});entry.size=cube.size;}
      if(entry.color!==cube.color){glow.tint=colorNumber(cube.color);entry.color=cube.color;}
      glow.position.set(cube.body.position.x,cube.body.position.y);glow.alpha=reduced?1:.9+.1*Math.sin(this.elapsedMs/900+cube.id*.8);
    }
    this.finishAnimation.clear();
    if(this.hasSpecialFinish&&!low){
      const f=this.race.map.finish,g=this.finishAnimation,color=neon?this.outlineColor:0xffffff;
      if(!reduced){
        const phase=(this.elapsedMs%4800)/4800;
        if(phase<.32){const x=-f.h-f.w+(f.w*2+f.h*2)*(phase/.32),band=Math.max(5,f.w*.11);g.poly([x-band,-f.h,x+band,-f.h,x+band+f.h*2,f.h*2,x-band+f.h*2,f.h*2]).fill({color,alpha:.32});}
        for(const star of this.stars){const phase=(this.elapsedMs/2800+star.phase)%1,strength=Math.max(0,1-Math.abs(phase-.5)/.12);if(strength<=0)continue;const radius=star.size*strength;g.moveTo(star.x-radius,star.y).lineTo(star.x+radius,star.y).moveTo(star.x,star.y-radius).lineTo(star.x,star.y+radius).stroke({color,width:1,alpha:.85*strength});}
      }
    }
  }

  destroy(){
    if(this.destroyed)return;this.destroyed=true;this.race=null;this.cubeGlows.clear();
    for(const layer of Object.values(this.layers)){layer.removeFromParent();layer.destroy({children:true});}
  }
}
