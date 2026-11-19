import test from 'node:test';
import assert from 'node:assert/strict';
import {PartEditor,objectAtCell} from '../src/part-editor.js';
import {createPartDraft,getPortCells} from '../src/part-library.js';
import {OBJECT_TYPES,validatePartObjects,compilePartObjects} from '../src/part-objects.js';

function editorFor(type){const editor=new PartEditor();editor.draft=createPartDraft(20,20);editor.draft.grid=editor.draft.grid.map(row=>'б'.repeat(row.length));editor.tool=`object:${type}`;return editor;}
function tap(editor,x,y){editor.objectStrokePlaced=false;editor.paint({x,y});}

for(const {type} of OBJECT_TYPES.filter(item=>!['laser','portal'].includes(item.type)))test(`editor places real ${type} data once per gesture`,()=>{
  const editor=editorFor(type);tap(editor,5,5);editor.paintLine({x:5,y:5},{x:9,y:5});
  assert.equal(editor.draft.objects.length,1);assert.equal(editor.draft.objects[0].type,type);
  assert.deepEqual(validatePartObjects(editor.draft).errors,[]);
  assert.equal(compilePartObjects(editor.draft)[0].type,type);
  editor.undo();assert.equal(editor.draft.objects?.length||0,0,'one undo removes the entire placement gesture');
});

test('laser is committed only after a second distinct collinear cell; incomplete placement cannot save',async()=>{
  let saves=0;const editor=editorFor('laser');editor.onSave=()=>{saves++;};editor.validation={valid:true};
  tap(editor,3,5);assert.equal(editor.draft.objects?.length||0,0);assert.ok(editor.pendingObject);assert.equal(editor.isDirty,true);
  await editor.save();assert.equal(saves,0);
  tap(editor,7,8);assert.equal(editor.draft.objects?.length||0,0);assert.match(editor.pendingError,/горизонтали/);
  tap(editor,7,5);assert.equal(editor.pendingObject,null);assert.equal(editor.draft.objects.length,1);
  assert.deepEqual(editor.draft.objects[0].end,{x:7,y:5});assert.deepEqual(validatePartObjects(editor.draft).errors,[]);
  const laser=compilePartObjects(editor.draft)[0];assert.deepEqual(laser.emitters,[{x:3.5,y:5.5},{x:7.5,y:5.5}]);
  assert.equal(objectAtCell(editor.draft.objects,{x:5,y:5}).id,laser.id,'the beam selects the same two-cell laser');
  editor.undo();assert.equal(editor.draft.objects?.length||0,0);
});

test('portal pair placement and deletion are atomic and undo restores both mutual references',()=>{
  const editor=editorFor('portal');tap(editor,3,4);assert.equal(editor.draft.objects?.length||0,0);
  tap(editor,3,4);assert.ok(editor.pendingObject);assert.equal(editor.draft.objects?.length||0,0);
  tap(editor,9,8);const [a,b]=editor.draft.objects;assert.equal(a.pair,b.id);assert.equal(b.pair,a.id);assert.deepEqual(validatePartObjects(editor.draft).errors,[]);
  editor.selectedObjectId=b.id;editor.deleteSelectedObject();assert.equal(editor.draft.objects.length,0);
  editor.undo();assert.equal(editor.draft.objects.length,2);assert.equal(editor.draft.objects[0].pair,editor.draft.objects[1].id);
});

test('object properties preserve wall thickness and color-slot mapping across rotation',()=>{
  const editor=editorFor('breakable-color-wall');tap(editor,5,5);editor.setObjectProperty('wallLength',4);editor.setObjectProperty('hits',7);editor.setObjectProperty('colorSlot',12);
  const object=editor.selectedObject();assert.equal(object.w,4);assert.equal(object.h,1);assert.equal(object.colorSlot,11);assert.equal(object.hits,7);
  editor.changeObjectDirection('S');assert.equal(object.w,1);assert.equal(object.h,4);assert.equal(object.direction,'S');assert.deepEqual(validatePartObjects(editor.draft).errors,[]);
  editor.undo();assert.equal(editor.selectedObject().direction,'E');assert.equal(editor.selectedObject().w,4);
});

test('entry and exit have a direct four-way rotation operation that keeps every marker cell on its side',()=>{
  for(const key of ['entry','exit']){const editor=editorFor('bumper');editor.tool=key;const initial=editor.draft[key].side,seen=new Set();
    for(let i=0;i<4;i++){editor.rotateMarker();const port=editor.draft[key];seen.add(port.side);for(const cell of getPortCells(port)){assert.ok(cell.x>=0&&cell.x<20&&cell.y>=0&&cell.y<20);assert.equal(port.side==='N'?cell.y:port.side==='S'?cell.y:cell.x,port.side==='S'||port.side==='E'?19:0);}}
    assert.equal(seen.size,4);assert.equal(editor.draft[key].side,initial);
  }
});

test('multiple contact wall starters remain distinct from the timed first wall and rotate through object directions',()=>{
  const editor=editorFor('wall-start'),firstWall=structuredClone(editor.draft.wallStart);
  tap(editor,3,4);tap(editor,9,8);assert.equal(editor.draft.objects.length,2);assert.equal(editor.pendingObject,null);
  assert.notEqual(editor.draft.objects[0].id,editor.draft.objects[1].id);
  editor.changeObjectDirection('N');const specs=compilePartObjects(editor.draft);
  assert.equal(specs[1].type,'wall-start');assert.equal(specs[1].dx,0);assert.equal(specs[1].dy,-1);
  assert.deepEqual(editor.draft.wallStart,firstWall,'editing contact starters leaves the timer-driven primary marker intact');
});
