import {U} from './config.js';
import {chooseFollowTarget} from './camera-follow.js';

export class Camera {
  constructor(element,world,getSize,onTap,onFollowChange=null){
    this.element=element;this.world=world;this.getSize=getSize;this.onTap=onTap;this.onFollowChange=onFollowChange;
    this.pointers=new Map();this.zoom=1;this.minZoom=.005;this.x=0;this.y=0;this.moved=false;this.gestureWasPinch=false;
    this.followMode='manual';this.followTargetId=null;this.followNeedsSnap=false;this.lastFollowPoint=null;
    element.addEventListener('pointerdown',e=>{
      if(e.target!==element&&e.target?.tagName!=='CANVAS')return;
      element.setPointerCapture(e.pointerId);
      if(this.pointers.size===0){this.moved=false;this.gestureWasPinch=false;}
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
      if(this.pointers.size>1){this.moved=true;this.gestureWasPinch=true;}
    });
    element.addEventListener('pointermove',e=>this.move(e));
    const end=e=>{
      if(!this.pointers.has(e.pointerId))return;
      if(!this.moved&&this.pointers.size===1){const r=element.getBoundingClientRect();this.onTap?.({x:(e.clientX-r.left-this.x)/this.zoom,y:(e.clientY-r.top-this.y)/this.zoom});}
      this.pointers.delete(e.pointerId);if(!this.pointers.size)this.gestureWasPinch=false;
    };
    element.addEventListener('pointerup',end);
    element.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size)this.gestureWasPinch=false;});
    element.addEventListener('wheel',e=>{e.preventDefault();const r=element.getBoundingClientRect();this.setZoom(this.zoom*Math.exp(-e.deltaY*.0013),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  }
  setFollow(mode){
    if(!['manual','selected','leader'].includes(mode))return false;
    if(mode==='manual'){this.stopFollow();return true;}
    if(this.followMode===mode)return true;
    this.followMode=mode;this.followTargetId=null;this.followNeedsSnap=true;this.lastFollowPoint=null;this.onFollowChange?.(mode,null,'enabled');return true;
  }
  stopFollow(reason='manual'){
    const changed=this.followMode!=='manual'||this.followTargetId!==null;
    this.followMode='manual';this.followTargetId=null;this.followNeedsSnap=false;this.lastFollowPoint=null;
    if(changed)this.onFollowChange?.('manual',null,reason);return changed;
  }
  updateFollow(race,dtMs){
    if(this.followMode==='manual')return null;
    const target=chooseFollowTarget(race,this.followMode,this.followTargetId);
    if(!target){
      if(this.followMode==='selected')this.stopFollow('target-lost');
      else if(this.followTargetId!==null){this.followTargetId=null;this.lastFollowPoint=null;this.onFollowChange?.(this.followMode,null,'target-lost');}
      return null;
    }
    if(this.followTargetId!==target.id){this.followTargetId=target.id;this.onFollowChange?.(this.followMode,target.id,'target-changed');}
    const {w,h}=this.getSize();if(!this.map||w<=0||h<=0)return target;
    const point=target.body.position;
    const jumped=this.lastFollowPoint?.id===target.id&&Math.hypot(point.x-this.lastFollowPoint.x,point.y-this.lastFollowPoint.y)>Math.max(8*U,Math.hypot(w,h)/this.zoom*1.5);
    if(this.followNeedsSnap){const focusZoom=Math.min(1.5,Math.max(.5,Math.min(w,h)/(10*U)));this.zoom=Math.min(4,Math.max(this.zoom,focusZoom));}
    const desiredX=w/2-point.x*this.zoom,desiredY=h/2-point.y*this.zoom;
    const elapsed=Number.isFinite(dtMs)?Math.max(0,Math.min(50,dtMs)):0,blend=this.followNeedsSnap||jumped?1:1-Math.exp(-elapsed/120);
    this.x+=(desiredX-this.x)*blend;this.y+=(desiredY-this.y)*blend;
    // Fast simulation or a new leader must not leave the followed cube outside
    // the viewport while real-time easing catches up.
    const radius=(target.size||1)*U*this.zoom/2;
    const marginX=Math.min(w*.4,Math.max(w*.2,radius+8,24)),marginY=Math.min(h*.4,Math.max(h*.2,radius+8,24));
    this.x=Math.max(marginX-point.x*this.zoom,Math.min(w-marginX-point.x*this.zoom,this.x));
    this.y=Math.max(marginY-point.y*this.zoom,Math.min(h-marginY-point.y*this.zoom,this.y));
    this.followNeedsSnap=false;this.lastFollowPoint={id:target.id,x:point.x,y:point.y};this.apply();return target;
  }
  setMap(map){this.stopFollow('map');this.map=map;this.fit();}
  fit(){
    this.stopFollow('manual');if(!this.map)return;const {w,h}=this.getSize();if(w<=0||h<=0){this.needsFit=true;return;}
    this.needsFit=false;this.minZoom=Math.max(.005,Math.min(Math.max(24,w-48)/this.map.width,Math.max(24,h-64)/this.map.height));this.zoom=this.minZoom;this.x=(w-this.map.width*this.zoom)/2;this.y=(h-this.map.height*this.zoom)/2;this.apply();
  }
  reset(){this.fit();}
  move(e){
    const old=this.pointers.get(e.pointerId);if(!old)return;const before=[...this.pointers.values()],previousDistance=before.length===2?Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y):0,dx=e.clientX-old.x,dy=e.clientY-old.y;
    old.x=e.clientX;old.y=e.clientY;const dragged=Math.hypot(e.clientX-old.startX,e.clientY-old.startY)>4;if(dragged)this.moved=true;
    if(this.pointers.size===2){
      this.moved=true;this.gestureWasPinch=true;const points=[...this.pointers.values()],r=this.element.getBoundingClientRect(),distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      if(previousDistance>0)this.setZoom(this.zoom*distance/previousDistance,(points[0].x+points[1].x)/2-r.left,(points[0].y+points[1].y)/2-r.top);
    }else{if(dragged&&!this.gestureWasPinch)this.stopFollow('manual');this.x+=dx;this.y+=dy;this.apply();}
  }
  setZoom(zoom,cx,cy){const next=Math.max(Math.min(4,this.minZoom*.7),Math.min(4,zoom)),ratio=next/this.zoom;this.x=cx-(cx-this.x)*ratio;this.y=cy-(cy-this.y)*ratio;this.zoom=next;this.apply();}
  apply(){if(!this.map)return;const {w,h}=this.getSize();if(w<=0||h<=0){this.needsFit=true;return;}const mw=this.map.width*this.zoom,mh=this.map.height*this.zoom;this.x=mw<w?(w-mw)/2:Math.max(w-mw-60,Math.min(60,this.x));this.y=mh<h?(h-mh)/2:Math.max(h-mh-60,Math.min(60,this.y));this.world.scale.set(this.zoom);this.world.position.set(this.x,this.y);}
}
