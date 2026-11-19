import {U,ROOM,SIZES,BASE_SPEED} from './config.js';
import {Bodies,Body,overlaps,box} from './physics.js';
import {Breakables,isBreakable} from './breakables.js';
const WALL_SPEED=32,CONTACT_EPSILON=1e-7;
const physicalContact=(a,b,sweep)=>{const axis=sweep.dx?'x':'y',cross=sweep.dx?'y':'x';return a.min[axis]<=b.max[axis]+CONTACT_EPSILON&&a.max[axis]>=b.min[axis]-CONTACT_EPSILON&&a.min[cross]<b.max[cross]-CONTACT_EPSILON&&a.max[cross]>b.min[cross]+CONTACT_EPSILON;};
export class Mechanisms {
  constructor(map,physics,audio){
    this.map=map;this.physics=physics;this.audio=audio;this.wallActive=false;
    this.items=map.mechanisms.map(spec=>{
      const m={...spec,removed:false,active:false,pulse:0};
      if(m.type==='spinner'||m.type==='press'||m.type==='bumper'||isBreakable(m.type)){
        const w=m.type==='spinner'?m.length*U:m.type==='bumper'?1.2*U:m.w,h=m.type==='spinner'?.45*U:m.type==='bumper'?1.2*U:m.h;
        const options={isStatic:true,restitution:1,friction:0,frictionStatic:0,slop:.015};
        m.body=m.type==='bumper'?Bodies.circle(m.x,m.y,w/2,options):Bodies.rectangle(m.x,m.y,w,h,options);
        m.body.plugin={crush:m.type==='press',motion:{x:0,y:0}};physics.addMoving(m.body);
      }
      return m;
    });
    this.breakables=new Breakables(physics,this.items,audio);
    this.wallStarts=map.rooms.map(()=>null);
    this.fronts=map.rooms.flatMap(r=>{
      const width=r.width??ROOM.w*U,height=r.height??ROOM.h*U;
      const sweeps=r.sweeps?.length?r.sweeps:[{x:r.wx,y:r.wy,w:width,h:height,dx:r.exit.x,dy:r.exit.y,length:r.exit.x?width:height,startOffset:0}];
      return sweeps.map((sweep,index)=>({roomId:r.id,index,sweep,amount:0,body:null,active:false}));
    });
    this.triggeredWallStarts=Object.create(null);
    this.wallStartMarkers=this.items.filter(m=>m.type==='wall-start');
    this.triggeredFronts=new Map();
    for(const marker of this.wallStartMarkers){
      const front={roomId:marker.roomId,index:0,triggerId:marker.id,sweep:this.markerSweep(marker),amount:0,body:null,active:false};
      this.fronts.push(front);this.triggeredFronts.set(marker.id,front);
    }
    this.update(0,0);
  }
  markerSweep(marker){
    const room=this.map.rooms[marker.roomId],width=room.width??ROOM.w*U,height=room.height??ROOM.h*U;
    const floors=room.floors?.length?room.floors:this.map.floors?.filter(f=>f.roomId===room.id)||[];
    const floor=floors.find(f=>marker.x>=f.x&&marker.x<f.x+f.w&&marker.y>=f.y&&marker.y<f.y+f.h)||{x:room.wx,y:room.wy,w:width,h:height};
    const horizontal=marker.dx!==0,axis=horizontal?'x':'y',cross=horizontal?'y':'x',sign=horizontal?marker.dx:marker.dy;
    const start=marker[axis]-sign*U/2,crossStart=horizontal?floor.y:floor.x,crossSpan=horizontal?floor.h:floor.w;
    let length=sign>0?(floor[axis]+(horizontal?floor.w:floor.h)-start):(start-floor[axis]);
    // A floor rectangle is normally pure air. Retain that same physical rule
    // for legacy/manual maps containing an additional fixed obstacle inside it.
    for(const wall of this.physics.walls){const b=wall.bounds;
      if(b.max[cross]<=crossStart+CONTACT_EPSILON||b.min[cross]>=crossStart+crossSpan-CONTACT_EPSILON)continue;
      const distance=((sign>0?b.min[axis]:b.max[axis])-start)*sign;
      if(distance>=-CONTACT_EPSILON)length=Math.min(length,Math.max(0,distance));
    }
    length=Math.max(0,length);
    return{roomId:room.id,x:horizontal?(sign>0?start:start-length):floor.x,y:horizontal?floor.y:(sign>0?start:start-length),w:horizontal?length:floor.w,h:horizontal?floor.h:length,dx:marker.dx,dy:marker.dy,length,startOffset:0};
  }
  move(body,p,angle=body.angle){const old={...body.position};Body.setPosition(body,p,true);Body.setAngle(body,angle,true);body.plugin.motion={x:p.x-old.x,y:p.y-old.y};}
  growFront(front,time){
    const room=this.map.rooms[front.roomId],s=front.sweep;
    const start=front.triggerId?this.triggeredWallStarts[front.triggerId]:this.wallStarts[room.id]??(SIZES[this.map.size].wall+room.wallStart);
    if(start===undefined)return false;
    const elapsed=time-start-(s.startOffset||0)/WALL_SPEED;if(elapsed<0||s.length===0)return false;
    const horizontal=s.dx!==0,span=s.length??(horizontal?s.w:s.h),amount=Math.min(span,elapsed*WALL_SPEED);
    front.amount=amount;front.active=true;
    const size=Math.max(.01,amount),w=horizontal?size:s.w,h=horizontal?s.h:size;
    const x=horizontal?s.x+(s.dx>0?size/2:span-size/2):s.x+s.w/2;
    const y=horizontal?s.y+s.h/2:s.y+(s.dy>0?size/2:span-size/2);
    if(!front.body){front.body=Bodies.rectangle(x,y,w,h,{isStatic:true,restitution:0,friction:0});front.body.plugin={crush:true,motion:{x:s.dx,y:s.dy}};this.physics.addMoving(front.body);}
    else {Body.scale(front.body,w/front.physicalWidth,h/front.physicalHeight);this.move(front.body,{x,y});front.body.plugin.motion={x:s.dx*(front.previousAmount===amount?0:1),y:s.dy*(front.previousAmount===amount?0:1)};}
    front.physicalWidth=w;front.physicalHeight=h;front.previousAmount=amount;return true;
  }
  frontBounds(front){return box(front.body.position.x,front.body.position.y,front.physicalWidth,front.physicalHeight);}
  mechanismOverlaps(m,bounds){return overlaps(bounds,box(m.x,m.y,m.w,m.h))||(m.type==='laser'&&m.emitters?.some(e=>overlaps(bounds,box(e.x,e.y,U,U))));}
  update(time,dt){
    for(const m of this.items){if(m.removed)continue;m.pulse=Math.max(0,m.pulse-dt*3);
      if(m.type==='spinner')this.move(m.body,{x:m.x,y:m.y},m.phase+time*m.speed);
      if(m.type==='press'){const offset=(1-Math.cos(time*Math.PI*2/m.period+m.phase))*.5*m.travel*U;this.move(m.body,{x:m.x+m.dx*offset,y:m.y+m.dy*offset});}
      if(m.type==='laser')m.active=(time+m.phase)%m.period<m.on;
    }
    const wallTime=time-SIZES[this.map.size].wall;this.wallActive=wallTime>=0;
    if(wallTime<0)return;
    // Queue only newly activated fronts. Each body is grown at most once per
    // physical step, including chains and portal handoffs within this update.
    const updated=new Set(),active=[];
    const grow=front=>{if(updated.has(front)||!this.growFront(front,time))return;updated.add(front);active.push(front);};
    for(const front of this.fronts)grow(front);
    for(let i=0;i<active.length;i++){
      const front=active[i],bounds=this.frontBounds(front);
      // A marker is consumed only after its contact has latched a start time.
      // Ordinary mechanisms and expanded broadphase bounds cannot trigger it.
      for(const marker of this.wallStartMarkers)if(!marker.removed&&!Object.hasOwn(this.triggeredWallStarts,marker.id)&&physicalContact(bounds,box(marker.x,marker.y,U,U),front.sweep)){
        this.triggeredWallStarts[marker.id]=time;marker.removed=true;grow(this.triggeredFronts.get(marker.id));
      }
      for(const m of this.items)if(!m.removed&&m.type!=='wall-start'&&m.roomId===front.roomId&&this.mechanismOverlaps(m,bounds)){
        if(m.type==='portal'){const target=this.items.find(t=>t.id===m.pair&&!t.removed);if(target){const targetRoom=this.map.rooms[target.roomId],scheduled=SIZES[this.map.size].wall+targetRoom.wallStart;if(!this.fronts.some(f=>!f.triggerId&&f.roomId===target.roomId&&f.active)){this.wallStarts[target.roomId]=Math.min(this.wallStarts[target.roomId]??scheduled,time);for(const destination of this.fronts)if(!destination.triggerId&&destination.roomId===target.roomId)grow(destination);}}}
        m.removed=true;if(m.body)this.physics.removeMoving(m.body);
      }
    }
  }
  apply(cube,time){
    if(!cube.alive)return;const body=cube.body,p=body.position,inside=[],conveyor={x:0,y:0};
    for(const m of this.items){if(m.removed)continue;
      const bounds=m.type==='laser'?box(p.x,p.y,cube.size*U,cube.size*U):body.bounds;
      const hit=m.type==='bumper'?Math.hypot(p.x-m.x,p.y-m.y)<cube.size*U*.6+.65*U:overlaps(bounds,box(m.x,m.y,m.w,m.h))||(m.type==='laser'&&m.emitters?.some(e=>overlaps(bounds,box(e.x,e.y,U,U))));
      if(!hit)continue;inside.push(m.id);const entered=!cube.inside.includes(m.id);
      if(m.type==='conveyor'){conveyor.x+=m.dx*.9;conveyor.y+=m.dy*.9;}
      if(m.type==='laser'&&m.active){this.physics.kill(cube,time,'Лазер');this.audio?.play('death');break;}
      if(!entered)continue;
      if(m.type==='boost'||m.type==='bumper'){
        cube.boostUntil=time+1;cube.boostAmount=BASE_SPEED*((m.multiplier||2)-1);m.pulse=1;
        if(m.type==='bumper'){let dx=p.x-m.x,dy=p.y-m.y;const length=Math.hypot(dx,dy)||1;Body.setVelocity(body,{x:dx/length*BASE_SPEED*2,y:dy/length*BASE_SPEED*2});}
        this.audio?.play('bounce');
      }
      if(m.type==='slow'){cube.slowUntil=time+m.duration;cube.slowMultiplier=m.multiplier;}
      if(m.type==='resize'&&!cube.usedResize.includes(m.id)){
        const size=cube.size*2;if(this.physics.canPlace(cube,p,size)){const mass=body.mass;Body.scale(body,2,2);Body.setMass(body,mass);Body.setInertia(body,Infinity);cube.size=size;cube.usedResize.push(m.id);m.pulse=1;}
      }
      if(m.type==='portal'&&time>=cube.portalUntil){const target=this.items.find(t=>t.id===m.pair&&!t.removed);if(target&&this.physics.canPlace(cube,{x:target.x,y:target.y})){Body.setPosition(body,{x:target.x,y:target.y});cube.portalUntil=time+1;inside.push(target.id);this.audio?.play('portal');}}
    }
    cube.inside=inside;this.physics.normalize(cube,time,conveyor);
  }
  snapshot(){return{removed:this.items.filter(m=>m.removed).map(m=>m.id),wallStarts:[...this.wallStarts],triggeredWallStarts:{...this.triggeredWallStarts},breakables:this.breakables.snapshot()};}
  restore(data){
    for(const m of this.items)if(data?.removed?.includes(m.id)){m.removed=true;if(m.body)this.physics.removeMoving(m.body);}
    this.wallStarts=this.map.rooms.map(r=>data?.wallStarts?.[r.id]??null);
    this.triggeredWallStarts=Object.create(null);
    for(const [id,time]of Object.entries(data?.triggeredWallStarts||{})){if(!this.triggeredFronts.has(id)||!Number.isFinite(time)||time<0)throw Error('Некорректный запуск движущейся стены');this.triggeredWallStarts[id]=time;this.wallStartMarkers.find(m=>m.id===id).removed=true;}
    this.breakables.restore(data?.breakables);
  }
}
