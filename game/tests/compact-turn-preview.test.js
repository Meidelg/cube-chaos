import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartPreview,validateMap} from '../src/map.js';
import {validatePartDraft} from '../src/part-library.js';
import {Game} from '../src/game.js';

test('The uploaded compact 3×3 turn still connects to the start neck and five-cell finish in its preview',()=>{
  const draft={id:'compact-turn-3',name:'Поворот 3х3',enabled:true,grid:['аааааа','ббббба','ббббба','ббббба','ааббба','ааббба'],entry:{x:0,y:1,side:'W',width:3},exit:{x:2,y:5,side:'S',width:3},wallStart:{x:0,y:2,direction:'E'},objects:[{id:'turn-wall',type:'wall-start',x:2,y:1,w:1,h:1,direction:'S'}]};
  assert.equal(validatePartDraft(draft).valid,true);
  const map=createPartPreview(draft);assert.equal(validateMap(map),true);
  assert.equal(map.rooms.filter(p=>p.kind==='custom').length,1);assert.ok(map.rooms.length>=3&&map.rooms.length<=4);
  assert.deepEqual(map.rooms.find(p=>p.kind==='custom').grid,draft.grid);
  assert.deepEqual(map,createPartPreview(draft));
  assert.doesNotThrow(()=>new Game().checkPartConnections([draft]));
});
