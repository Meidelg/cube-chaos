export class Prediction {
  constructor(){this.selected=null;this.lost=false;}
  canChange(time,cubes,finished=false){if(finished||time>5.1||this.lost)return false;return !(time>=5&&this.selected!==null&&!cubes.find(c=>c.id===this.selected)?.alive);}
  select(id,time,cubes,finished=false){if(!this.canChange(time,cubes,finished)||!cubes.find(c=>c.id===id)?.alive)return false;this.selected=id;return true;}
  update(time,cubes){if(time>=5&&this.selected!==null&&!cubes.find(c=>c.id===this.selected)?.alive)this.lost=true;}
}
