import {Application,Container,Graphics,Text} from 'pixi.js';
import {U,SIZES} from './config.js';
import {Camera} from './camera.js';
import {SceneCosmetics,getTheme} from './scene-cosmetics.js';
import {drawCube} from './cube-cosmetics.js';
import {TrailEffects} from './trail-effects.js';
const breakableTypes=new Set(['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall']);
const countedBreakableTypes=new Set(['breakable-color-wall','breakable-wall']);
function breakableColor(m){return m.type.includes('-color-')?(m.damageColor||'#a8b0b7'):'#cbd2d3';}
function counterInk(color){
  const hex=typeof color==='number'?color:Number.parseInt(String(color).replace('#',''),16);
  const channels=[(hex>>16)&255,(hex>>8)&255,hex&255].map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;});
  const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  return (luminance+.05)/.05>=1.05/(luminance+.05)?0x000000:0xffffff;
}
function drawBreakable(g,m,override){
  const fill=override??breakableColor(m),ink=counterInk(fill),w=m.w,h=m.h,x=m.x,y=m.y;
  if(m.body)g.poly(m.body.vertices.flatMap(vertex=>[vertex.x,vertex.y])).fill(fill);
  else g.rect(x-w/2,y-h/2,w,h).fill(fill);
  if(countedBreakableTypes.has(m.type)){
    const horizontal=w>=h;
    const cx=horizontal?x-w/2+U*.4:x,cy=horizontal?y:y-h/2+U*.4;
    g.moveTo(cx-3,cy-4).lineTo(cx+1,cy-1).lineTo(cx-1,cy+2).lineTo(cx+3,cy+5).stroke({color:ink,width:1.5});
  }else{
    g.moveTo(x-3,y-U*.32).lineTo(x+2,y-2).lineTo(x-2,y+2).lineTo(x+3,y+U*.32).stroke({color:ink,width:1.6});
  }
}
export class Renderer {
  async init(host,onTap){
    this.host=host;this.app=new Application();await this.app.init({backgroundAlpha:1,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight),preference:'webgl'});host.prepend(this.app.canvas);this.app.canvas.setAttribute('aria-label','Карта гонки Cube Chaos');
    this.world=new Container();this.app.stage.addChild(this.world);this.floor=new Graphics();this.decor=new Container();this.effects=new Graphics();this.frontLayer=new Graphics();this.wallLayer=new Graphics();this.mechanismLayer=new Graphics();this.mechanismLabels=new Container();this.cubeLayer=new Container();this.debugLayer=new Graphics();
    this.world.addChild(this.floor,this.decor,this.effects,this.mechanismLayer,this.mechanismLabels,this.frontLayer,this.wallLayer,this.cubeLayer,this.debugLayer);
    this.camera=new Camera(host,this.world,()=>({w:host.clientWidth,h:host.clientHeight}),onTap);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
  }
  ensureCosmetics(){
    if(this.sceneCosmetics)return;
    this.sceneCosmetics=new SceneCosmetics(this.world);this.trailLayer=new Container();this.trailEffects=new TrailEffects(this.trailLayer);
    const s=this.sceneCosmetics;
    this.world.addChild(s.backgroundLayer,this.floor,s.paperLayer,s.finishLayer,this.decor,this.trailLayer,this.effects,s.edgeGlowLayer,this.mechanismLayer,this.mechanismLabels,this.frontLayer,this.wallLayer,s.edgeStrokeLayer,s.cubeGlowLayer,this.cubeLayer,this.debugLayer);
  }
  setRace(race,cosmetics,settings){this.ensureCosmetics();const changedRace=this.race!==race;this.race=race;this.settings=settings;this.cosmetics=cosmetics;this.theme=getTheme(cosmetics.theme);this.floor.clear();this.wallLayer.clear();this.decor.removeChildren().forEach(c=>c.destroy());this.mechanismLabels.removeChildren().forEach(c=>c.destroy());this.cubeLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.cubeSprites=new Map();
    const map=race.map,t=this.theme;
    this.app.renderer.background.color=t.background;this.app.renderer.background.alpha=1;
    for(const r of map.floors)this.floor.rect(r.x,r.y,r.w,r.h).fill(t.floor);
    for(const w of map.walls)this.wallLayer.rect(w.x-w.w/2,w.y-w.h/2,w.w,w.h);
    this.wallLayer.fill(t.wall);
    for(const c of race.cubes){const container=new Container(),shape=new Graphics(),number=new Text({text:String(c.id),style:{fontFamily:'Arial',fontSize:8,fontWeight:'800',fill:0xffffff}});number.anchor.set(.5);container.addChild(shape,number);this.cubeLayer.addChild(container);this.cubeSprites.set(c.id,{container,shape,number});}
    this.debugLabels=[];
    for(const m of race.mechanisms.items){const label=new Text({text:'',style:{fontFamily:'monospace',fontSize:9,fill:0xd13970}});label.position.set(m.x+U,m.y-U);this.decor.addChild(label);this.debugLabels.push({m,label});}
    this.breakableLabels=[];
    for(const m of race.mechanisms.items)if(countedBreakableTypes.has(m.type)){
      const label=new Text({text:'',style:{fontFamily:'Arial',fontSize:18,fontWeight:'700',fill:counterInk(breakableColor(m))}});label.anchor.set(.5);label.position.set(m.x,m.y);this.mechanismLabels.addChild(label);this.breakableLabels.push({m,label,text:null,ink:null});
    }
    this.targetLabels=[];
    if(['paper','neon'].includes(t.mode))for(const m of race.mechanisms.items)if(m.type.startsWith('breakable-color-')){
      const label=new Text({text:'',style:{fontFamily:'Arial',fontSize:8,fontWeight:'700',fill:t.mode==='paper'?0x4a4740:0xffffff}});label.anchor.set(.5);label.position.set(m.x,m.y+Math.min(m.h/2-5,8));this.mechanismLabels.addChild(label);this.targetLabels.push({m,label});
    }
    this.sceneCosmetics.setRace(race,cosmetics,settings);this.trailEffects.setRace(race,cosmetics,settings);
    if(changedRace)this.camera.setMap(map);this.draw(0);
  }
  draw(deltaMs=1000/60){if(!this.race)return;this.camera.updateFollow(this.race,deltaMs);this.sceneCosmetics.update(deltaMs);this.trailEffects.update(deltaMs);this.trailEffects.draw();const race=this.race,time=race.time,paper=this.theme.mode==='paper',neon=this.theme.mode==='neon',objectColor=color=>paper?this.theme.objectColor:color;this.effects.clear();this.frontLayer.clear();this.mechanismLayer.clear();this.debugLayer.clear();
    for(const m of race.mechanisms.items){if(m.removed||neon)continue;const g=this.mechanismLayer;
      if(breakableTypes.has(m.type))drawBreakable(g,m,paper?this.theme.objectColor:undefined);
      else if(m.body){const points=m.body.vertices.flatMap(v=>[v.x,v.y]);g.poly(points).fill(objectColor(m.type==='bumper'?0xe6bd59:m.type==='spinner'?0xa3a7ac:0x737a84));if(m.type==='spinner')g.circle(m.x,m.y,5).fill(objectColor(0x454d57));if(m.type==='bumper')g.circle(m.x,m.y,6+m.pulse*4).stroke({color:0xffffff,width:2});}
      else if(m.type==='portal'){g.roundRect(m.x-m.w/2,m.y-m.h/2,m.w,m.h,5).fill({color:objectColor(0xa283da),alpha:paper?1:.2});g.circle(m.x,m.y,U*.7).stroke({color:objectColor(0x9874ce),width:3});g.circle(m.x,m.y,U*.45+Math.sin(time*3)*2).stroke({color:objectColor(0xb397e1),width:2});}
      else if(m.type==='laser'){g.rect(m.x-m.w/2,m.y-m.h/2,m.w,m.h).fill({color:objectColor(0xed7781),alpha:m.active?.9:.12});const horizontal=m.w>=m.h;if(m.emitters?.length===2){for(const p of m.emitters)g.rect(p.x-U/2,p.y-U/2,U,U).fill(objectColor(m.active?0xb85e65:0x95696c));}else for(const sign of [-1,1])g.circle(m.x+(horizontal?sign*m.w/2:0),m.y+(horizontal?0:sign*m.h/2),5).fill(objectColor(0xb85e65));}
      else if(m.type==='wall-start'){
        g.rect(m.x-U/2,m.y-U/2,U,U).fill(objectColor(0xcbd0cf));
        const dx=m.dx,dy=m.dy,tx=-dy,ty=dx;
        for(const offset of [-.28,-.1])g.moveTo(m.x+dx*U*offset-tx*U*.32,m.y+dy*U*offset-ty*U*.32).lineTo(m.x+dx*U*offset+tx*U*.32,m.y+dy*U*offset+ty*U*.32).stroke({color:0x4a5552,width:1.6});
        g.moveTo(m.x,m.y).lineTo(m.x+dx*U*.35,m.y+dy*U*.35).lineTo(m.x+dx*U*.2+tx*U*.13,m.y+dy*U*.2+ty*U*.13).moveTo(m.x+dx*U*.35,m.y+dy*U*.35).lineTo(m.x+dx*U*.2-tx*U*.13,m.y+dy*U*.2-ty*U*.13).stroke({color:0x4a5552,width:1.6});
      }
      else {const color={conveyor:0xa4b7c8,boost:0xb6d88d,slow:0xe9bd74,resize:0xc3a0e5}[m.type]||0xa4b7c8;g.roundRect(m.x-m.w/2,m.y-m.h/2,m.w,m.h,3).fill({color:objectColor(color),alpha:paper?1:.5});
        if(m.type==='conveyor'){for(let i=-1;i<=1;i++){const x=m.x+(m.dx?i*U:0),y=m.y+(m.dy?i*U:0);g.moveTo(x-5*m.dx+5*m.dy,y-5*m.dy-5*m.dx).lineTo(x+5*m.dx,y+5*m.dy).lineTo(x-5*m.dx-5*m.dy,y-5*m.dy+5*m.dx).stroke({color:0x738aa0,width:2});}}
        else if(m.type==='resize'){g.rect(m.x-5,m.y-5,10,10).stroke({color:0x8e67b9,width:2});g.moveTo(m.x-3,m.y).lineTo(m.x+3,m.y).moveTo(m.x,m.y-3).lineTo(m.x,m.y+3).stroke({color:0x8e67b9,width:1.5});}
        else {for(let i=-1;i<=1;i++)g.moveTo(m.x-5,m.y+i*U*.6+3).lineTo(m.x,m.y+i*U*.6-3).lineTo(m.x+5,m.y+i*U*.6+3).stroke({color:m.type==='boost'?0x789b4c:0xad8348,width:2});}
      }
    }
    for(const entry of this.breakableLabels){
      const {m,label}=entry;label.visible=!m.removed;if(!label.visible)continue;
      const text=String(Math.max(0,m.remainingHits??m.hits??1)),ink=paper?0x4a4740:neon?this.sceneCosmetics.outlineColor:counterInk(breakableColor(m));
      if(entry.text!==text){label.text=text;label.style.fontSize=Math.min(18,(Math.min(m.w,m.h)-4)/(text.length*.6));entry.text=text;}
      if(entry.ink!==ink){label.style.fill=ink;entry.ink=ink;}
    }
    for(const {m,label}of this.targetLabels){label.visible=!m.removed;label.text=race.cubes.filter(c=>c.color.toLowerCase()===m.damageColor?.toLowerCase()).map(c=>`№${c.id}`).join(' ');if(neon)label.style.fill=this.sceneCosmetics.outlineColor;}
    for(const front of race.mechanisms.fronts)if(front.body)this.frontLayer.poly(front.body.vertices.flatMap(v=>[v.x,v.y])).fill(objectColor(0x24272b));
    for(const c of race.cubes){const sprite=this.cubeSprites.get(c.id),p=c.body.position,size=c.size*U,g=sprite.shape;sprite.container.position.set(p.x,p.y);sprite.container.visible=c.alive||race.winner===c.id;sprite.container.alpha=c.alive?1:.45;g.clear();
      if(race.prediction.selected===c.id){g.roundRect(-size/2-5,-size/2-5,size+10,size+10,4).stroke({color:0x6f62cb,width:2});g.circle(0,-size/2-11,2.5).fill(0x6f62cb);}
      drawCube(g,c,this.cosmetics.skin,{time,raceId:race.id});
      sprite.number.style.fontSize=Math.max(8,size*.29);sprite.number.position.set(0,size*.25);
      if(this.settings.debug&&c.alive){const b=c.body.bounds;this.debugLayer.rect(b.min.x,b.min.y,b.max.x-b.min.x,b.max.y-b.min.y).stroke({color:0xff3377,width:1});this.debugLayer.moveTo(p.x,p.y).lineTo(p.x+c.body.velocity.x*10,p.y+c.body.velocity.y*10).stroke({color:0x208ef7,width:1.5});}
    }
    if(this.settings.debug)for(const body of [...race.physics.walls,...race.physics.moving])this.debugLayer.poly(body.vertices.flatMap(v=>[v.x,v.y])).stroke({color:body.plugin?.crush?0xff9324:0x26abb0,width:.75});
    for(const {m,label}of this.debugLabels){label.visible=this.settings.debug&&!m.removed;if(label.visible)label.text=`${m.id} ${m.type}${m.type==='laser'?(m.active?' ON':' OFF'):m.body?' '+m.body.angle.toFixed(2):''}`;}
  }
  resize(fit=false){if(this.host.clientWidth<=0||this.host.clientHeight<=0)return;this.app.renderer.resize(this.host.clientWidth,this.host.clientHeight);if(fit||this.camera.needsFit)this.camera.fit();else this.camera.apply();}
}
