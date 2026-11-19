import Matter from 'matter-js';
import {U,BASE_SPEED,STEP} from './config.js';
export const {Bodies,Body,Composite,Engine,Query}=Matter;
// Resting slop can pull an almost tangential, outgoing cube back into a wall
// each tick. This gravity-free simulation requires separation even at tiny
// normal velocities, rather than a resting penetration band.
const options={restitution:1,friction:0,frictionStatic:0,frictionAir:0,slop:0};
export const overlaps=(a,b)=>a.min.x<b.max.x&&a.max.x>b.min.x&&a.min.y<b.max.y&&a.max.y>b.min.y;
export function box(x,y,w,h){return{min:{x:x-w/2,y:y-h/2},max:{x:x+w/2,y:y+h/2}};}
export class Physics {
  constructor(map){
    this.engine=Engine.create({gravity:{x:0,y:0},positionIterations:10,velocityIterations:10,enableSleeping:false});
    this.walls=map.walls.map(w=>Bodies.rectangle(w.x,w.y,w.w,w.h,{...options,isStatic:true,label:'wall'}));
    this.cubes=[];this.moving=[];Composite.add(this.engine.world,this.walls);
  }
  addCube(id,x,y,color,velocity){
    const body=Bodies.rectangle(x,y,U,U,{...options,label:`cube-${id}`,inertia:Infinity});Body.setInertia(body,Infinity);Body.setMass(body,1);Body.setVelocity(body,velocity);
    const cube={id,color,body,alive:true,size:1,deathTime:null,boostUntil:0,boostAmount:0,slowUntil:0,slowMultiplier:1,portalUntil:0,usedResize:[],inside:[],safe:[{x,y}],stuckSince:null,trail:[]};this.cubes.push(cube);Composite.add(this.engine.world,body);return cube;
  }
  addMoving(body){body.slop=0;this.moving.push(body);Composite.add(this.engine.world,body);}
  removeMoving(body){this.moving=this.moving.filter(b=>b!==body);Composite.remove(this.engine.world,body);}
  normalize(cube,time,conveyor={x:0,y:0}){
    const body=cube.body,v=body.velocity,old=cube.conveyor||{x:0,y:0};
    let vx=v.x-old.x,vy=v.y-old.y;const speed=Math.hypot(vx,vy);
    const touchingMover=this.moving.some(b=>!b.isSensor&&overlaps(box(body.position.x,body.position.y,cube.size*U+2,cube.size*U+2),b.bounds));
    if(speed>.04&&!touchingMover){const boost=Math.max(0,cube.boostUntil-time)*cube.boostAmount;const target=BASE_SPEED*(cube.slowUntil>time?cube.slowMultiplier:1)+boost;vx=vx/speed*target;vy=vy/speed*target;}
    else if(speed<=.04){vx=0;vy=0;}
    const cap=BASE_SPEED*4,m=Math.hypot(vx,vy);if(m>cap){vx=vx/m*cap;vy=vy/m*cap;}
    Body.setVelocity(body,{x:vx+conveyor.x,y:vy+conveyor.y});cube.conveyor=conveyor;Body.setAngle(body,0);Body.setAngularVelocity(body,0);
  }
  step(){
    const incoming=new Map(this.cubes.filter(c=>c.alive).map(c=>[c.body.id,{...c.body.velocity}]));
    Engine.update(this.engine,STEP);
    this.resolveStaticRestitution(incoming);
  }
  resolveStaticRestitution(incoming){
    const epsilon=1e-7,cubes=new Map(this.cubes.filter(c=>c.alive).map(c=>[c.body.id,c]));
    const contacts=new Map(),constrained=new Set();
    const stationary=body=>{
      const motion=body.plugin?.motion;
      return body.isStatic&&!body.isSensor&&Math.hypot(body.velocity.x,body.velocity.y)<=epsilon&&
        Math.abs(body.angle-body.anglePrev)<=epsilon&&(!motion||Math.hypot(motion.x||0,motion.y||0)<=epsilon);
    };
    for(const pair of this.engine.pairs.list){
      if(!pair.isActive||pair.isSensor)continue;
      const a=pair.collision.parentA,b=pair.collision.parentB,ca=cubes.get(a.id),cb=cubes.get(b.id);
      if(ca&&cb){constrained.add(a.id);constrained.add(b.id);continue;}
      const cube=ca||cb;if(!cube)continue;
      const obstacle=ca?b:a;
      if(!stationary(obstacle)){constrained.add(cube.body.id);continue;}
      const normal=pair.collision.normal,sign=ca?1:-1;
      if(!contacts.has(cube.body.id))contacts.set(cube.body.id,[]);
      contacts.get(cube.body.id).push({pair,x:normal.x*sign,y:normal.y*sign});
    }
    for(const [id,list]of contacts){
      if(constrained.has(id))continue;
      // Opposing contacts are a real pinch or a corridor exactly as wide as
      // the cube. Do not manufacture an escape velocity from that constraint.
      if(list.some(a=>list.some(b=>a.x*b.x+a.y*b.y<-.5)))continue;
      const cube=cubes.get(id),body=cube.body,previous=incoming.get(id),velocity={...body.velocity};
      if(!previous)continue;let changed=false;
      for(const contact of list){
        const approach=previous.x*contact.x+previous.y*contact.y;
        if(approach>=-epsilon)continue;
        const expected=-approach*contact.pair.restitution;
        const resolved=velocity.x*contact.x+velocity.y*contact.y;
        // Matter's resting-contact solver can cancel restitution for shallow
        // impacts at the 120 Hz step. Restore only the missing normal impulse
        // from the actual incoming velocity and detected surface normal.
        if(expected-resolved<=epsilon)continue;
        velocity.x+=(expected-resolved)*contact.x;velocity.y+=(expected-resolved)*contact.y;changed=true;
      }
      if(list.some(n=>velocity.x*n.x+velocity.y*n.y<-epsilon))continue;
      if(changed){
        Body.setVelocity(body,velocity);
        // A repaired elastic bounce must not reuse a resting impulse next tick.
        for(const {pair}of list)for(let i=0;i<pair.contactCount;i++){pair.contacts[i].normalImpulse=0;pair.contacts[i].tangentImpulse=0;}
      }
      if(cube.conveyor){
        // normalize removes the last applied conveyor contribution next tick.
        // It must remove its reflected contribution, rather than subtracting
        // the old inward vector from an already reflected body velocity.
        const conveyor={...cube.conveyor},reflected=[];
        for(const n of list){
          if(previous.x*n.x+previous.y*n.y>=-epsilon||velocity.x*n.x+velocity.y*n.y<=epsilon||reflected.some(old=>old.x*n.x+old.y*n.y>1-epsilon))continue;
          const component=conveyor.x*n.x+conveyor.y*n.y;
          conveyor.x-=2*component*n.x;conveyor.y-=2*component*n.y;reflected.push(n);
        }
        cube.conveyor=conveyor;
      }
    }
  }
  kill(cube,time,reason){if(!cube.alive)return;cube.alive=false;cube.deathTime=time;cube.reason=reason;Composite.remove(this.engine.world,cube.body);}
  canPlace(cube,p,size=cube.size){const bounds=box(p.x,p.y,size*U-.1,size*U-.1);return![...this.walls,...this.moving.filter(b=>!b.isSensor)].some(b=>overlaps(bounds,b.bounds));}
  checkSafety(cube,time){
    if(!cube.alive)return;const p=cube.body.position;
    const movers=this.moving.filter(b=>!b.isSensor&&overlaps(box(p.x,p.y,cube.size*U+4,cube.size*U+4),b.bounds));
    const contacts=Query.collides(cube.body,this.walls);
    // Only deep, persistent static penetration, without a moving mechanism nearby,
    // qualifies as numerical corruption. A stationary cube in a dead end is valid.
    if(contacts.some(c=>c.depth>cube.size*U*.45)&&!movers.length){
      cube.stuckSince??=time;
      if(time-cube.stuckSince>.2){const safe=cube.safe.find(p=>this.canPlace(cube,p));if(safe){Body.setPosition(cube.body,safe);cube.stuckSince=null;}}
    }else{cube.stuckSince=null;if(time-(cube.lastSafe||0)>.25&&this.canPlace(cube,p)){cube.safe.unshift({x:p.x,y:p.y});cube.safe.length=Math.min(12,cube.safe.length);cube.lastSafe=time;}}
  }
  checkCrush(cube,time){
    if(!cube.alive)return;
    const p=cube.body.position,size=cube.size*U;
    for(const mover of this.moving){
      if(mover.isSensor||!mover.plugin?.crush||!overlaps(box(p.x,p.y,size+4,size+4),mover.bounds))continue;
      const v=mover.plugin.motion;if(!v||Math.hypot(v.x,v.y)<.001)continue;
      const horizontal=Math.abs(v.x)>=Math.abs(v.y),axis=horizontal?'x':'y',cross=horizontal?'y':'x',sign=Math.sign(v[axis]);
      const front=sign>0?mover.bounds.max[axis]:mover.bounds.min[axis];
      for(const obstacle of [...this.walls,...this.moving.filter(b=>b!==mover&&!b.isSensor)]){
        const b=obstacle.bounds;
        if(b.max[cross]<=p[cross]-size*.35||b.min[cross]>=p[cross]+size*.35)continue;
        const back=sign>0?b.min[axis]:b.max[axis],gap=(back-front)*sign;
        if(gap>=-size*.3&&gap<size*.85&&(p[axis]-front)*sign>=-size*.65&&(back-p[axis])*sign>=-size*.65){this.kill(cube,time,'Раздавлен');return;}
      }
    }
  }
  destroy(){Composite.clear(this.engine.world,false);Engine.clear(this.engine);}
}
