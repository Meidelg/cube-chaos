const TYPES=new Set(['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall']);
export const isBreakable=type=>TYPES.has(type);
export const isColorBreakable=type=>type==='breakable-color-block'||type==='breakable-color-wall';
export const isCountedBreakable=type=>type==='breakable-color-wall'||type==='breakable-wall';
const sameColor=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();

// Damage runs after Matter has solved every contact in the physical step.
// Even a final hit therefore collides with a solid body and bounces before
// that body is removed. Resting contact is not a stream of new impacts.
export class Breakables {
  constructor(physics,items,audio=null){
    this.physics=physics;this.items=items.filter(m=>isBreakable(m.type));this.audio=audio;
    this.activeContacts=new Set();this.incoming=new Map();this.byBody=new Map();
    for(const m of this.items){
      m.maxHits=isCountedBreakable(m.type)?(Number.isInteger(m.hits)&&m.hits>0?m.hits:3):1;
      m.remainingHits=m.maxHits;m.damageColor=m.damageColor??null;m.lastHitTime=null;
      if(m.body)this.byBody.set(m.body.id,m);
    }
  }
  bindParticipants(cubes){
    if(!cubes.length)return;
    for(const m of this.items)if(isColorBreakable(m.type)){
      if(Number.isInteger(m.colorSlot)){const index=((m.colorSlot%cubes.length)+cubes.length)%cubes.length;m.damageColor=cubes[index].color;}
      else if(!m.damageColor)m.damageColor=cubes[0].color;
    }
  }
  beforeStep(){
    this.incoming.clear();
    for(const cube of this.physics.cubes)if(cube.alive)this.incoming.set(cube.body.id,{...cube.body.velocity});
  }
  afterStep(time){
    const contacts=new Map(),broken=new Set();
    for(const pair of this.physics.engine.pairs.list){
      if(!pair.isActive)continue;
      const a=pair.bodyA,b=pair.bodyB;
      const item=this.byBody.get(a.id)||this.byBody.get(b.id);
      if(!item||item.removed)continue;
      const body=item.body===a?b:a,cube=this.physics.cubes.find(c=>c.body===body&&c.alive);
      if(!cube)continue;
      const key=`${item.id}:${cube.id}`;contacts.set(key,item);
      if(this.activeContacts.has(key)||item.remainingHits===0)continue;
      const incoming=this.incoming.get(body.id),normal=pair.collision.normal;
      if(!incoming||!normal)continue;
      // Matter's normal points from collision bodyB to bodyA. Orient it
      // outward from the barrier, then require an incoming normal velocity.
      const sign=pair.collision.bodyA===body?1:-1;
      if((incoming.x*normal.x+incoming.y*normal.y)*sign>=-1e-5)continue;
      if(isColorBreakable(item.type)&&!sameColor(cube.color,item.damageColor))continue;
      item.remainingHits--;item.pulse=1;item.lastHitTime=time;
      if(item.remainingHits===0)broken.add(item);else this.audio?.play('barrier-hit');
    }
    // Do not remove a body inside the pair loop: simultaneous contacts have
    // all been physically resolved against the same still-solid obstacle.
    for(const m of broken){m.removed=true;this.physics.removeMoving(m.body);this.audio?.play('barrier-break');}
    this.activeContacts=new Set([...contacts].filter(([,m])=>!m.removed).map(([key])=>key));
  }
  snapshot(){
    return{items:this.items.map(m=>({id:m.id,remainingHits:m.remainingHits,damageColor:m.damageColor})),contacts:[...this.activeContacts]};
  }
  restore(data){
    const saved=new Map((data?.items||[]).map(m=>[m.id,m]));
    for(const m of this.items){const state=saved.get(m.id);if(!state)continue;
      if(!Number.isInteger(state.remainingHits)||state.remainingHits<0||state.remainingHits>m.maxHits)throw Error('Некорректный счётчик разрушаемой стены');
      m.remainingHits=state.remainingHits;
      if(isColorBreakable(m.type)&&typeof state.damageColor==='string')m.damageColor=state.damageColor;
      if(m.remainingHits===0&&!m.removed){m.removed=true;this.physics.removeMoving(m.body);}
    }
    this.activeContacts=new Set((data?.contacts||[]).filter(key=>{
      const index=typeof key==='string'?key.lastIndexOf(':'):-1;
      return index>=0&&this.items.some(m=>m.id===key.slice(0,index)&&!m.removed)&&Number.isInteger(Number(key.slice(index+1)));
    }));
  }
}
