import {U,STEP,COLORS,BASE_SPEED} from './config.js';
import {Random} from './random.js';
import {Physics,Body} from './physics.js';
import {Mechanisms} from './mechanisms.js';
import {Prediction} from './prediction.js';
export class Race {
  constructor(map,count,palette=COLORS,audio=null,snapshot=null){
    this.map=map;this.count=count;this.audio=audio;this.physics=new Physics(map);this.mechanisms=new Mechanisms(map,this.physics,audio);this.prediction=new Prediction();
    this.id=snapshot?.id||crypto.randomUUID();this.rng=new Random(snapshot?.rng??crypto.getRandomValues(new Uint32Array(1))[0]);this.ticks=0;this.started=false;this.finished=false;this.paused=false;this.winner=null;
    const component=BASE_SPEED/Math.sqrt(2),directions=[[1,-1],[1,1],[-1,1],[-1,-1]];
    for(let i=0;i<count;i++){const [dx,dy]=this.rng.pick(directions),x=map.start.x+((i%4)-1.5)*1.5*U,y=map.start.y+(Math.floor(i/4)-1)*1.5*U;this.physics.addCube(i+1,x,y,palette[i],{x:dx*component,y:dy*component});}
    this.mechanisms.breakables.bindParticipants(this.cubes);
    if(snapshot)this.restore(snapshot);
  }
  get time(){return this.ticks*STEP/1000;}
  get cubes(){return this.physics.cubes;}
  select(id){return this.prediction.select(id,this.time,this.cubes,this.finished);}
  start(){if(this.prediction.selected===null)return false;this.started=true;this.paused=false;return true;}
  step(){
    if(!this.started||this.paused||this.finished)return;
    this.ticks++;const time=this.time;
    this.mechanisms.update(time,STEP/1000);
    for(const cube of this.cubes)if(cube.alive)this.mechanisms.apply(cube,time);
    this.mechanisms.breakables.beforeStep();
    this.physics.step();
    this.mechanisms.breakables.afterStep(time);
    for(const cube of this.cubes)if(cube.alive){this.physics.checkCrush(cube,time);if(!cube.alive)this.audio?.play('death');this.physics.checkSafety(cube,time);}
    this.prediction.update(time,this.cubes);
    // Resolve the complete step as a batch; callback ordering never elects a survivor.
    const f=this.map.finish,arrivals=this.cubes.filter(c=>c.alive&&c.body.bounds.min.x>=f.x&&c.body.bounds.max.x<=f.x+f.w&&c.body.bounds.min.y>=f.y&&c.body.bounds.max.y<=f.y+f.h);
    const alive=this.cubes.filter(c=>c.alive);
    if(arrivals.length)this.finish(this.rng.pick(arrivals),'finish');
    else if(alive.length===1)this.finish(alive[0],'survivor');
    else if(alive.length===0){const last=Math.max(...this.cubes.map(c=>c.deathTime));this.finish(this.rng.pick(this.cubes.filter(c=>c.deathTime===last)),'last');}
  }
  finish(cube,reason){if(this.finished)return;this.finished=true;this.winner=cube.id;this.finishReason=reason;this.correct=!this.prediction.lost&&cube.id===this.prediction.selected;this.reward=this.correct?10*this.count**2:0;this.audio?.play(this.correct?'win':'end');}
  snapshot(){return{id:this.id,map:this.map,count:this.count,ticks:this.ticks,rng:this.rng.state,started:this.started,finished:this.finished,winner:this.winner,finishReason:this.finishReason,correct:this.correct,reward:this.reward,prediction:{...this.prediction},mechanisms:this.mechanisms.snapshot(),cubes:this.cubes.map(c=>({id:c.id,color:c.color,alive:c.alive,size:c.size,deathTime:c.deathTime,reason:c.reason,position:{...c.body.position},velocity:{...c.body.velocity},boostUntil:c.boostUntil,boostAmount:c.boostAmount,slowUntil:c.slowUntil,slowMultiplier:c.slowMultiplier,portalUntil:c.portalUntil,usedResize:[...c.usedResize],inside:[...c.inside],conveyor:c.conveyor,safe:c.safe}))};}
  restore(s){
    this.ticks=s.ticks;this.started=s.started;this.finished=s.finished;this.winner=s.winner;this.finishReason=s.finishReason;this.correct=s.correct;this.reward=s.reward;this.paused=true;Object.assign(this.prediction,s.prediction);
    this.mechanisms.restore(s.mechanisms);this.mechanisms.update(this.time,0);
    for(const data of s.cubes){const c=this.cubes.find(c=>c.id===data.id);if(data.size!==1){Body.scale(c.body,data.size,data.size);Body.setMass(c.body,1);Body.setInertia(c.body,Infinity);}Object.assign(c,data);Body.setPosition(c.body,data.position);Body.setVelocity(c.body,data.velocity);if(!c.alive)this.physics.kill({...c,alive:true},data.deathTime,data.reason);}
    // The constructor must not consume the continuation PRNG state during restore.
    this.rng.state=s.rng;
  }
  destroy(){this.physics.destroy();}
}
