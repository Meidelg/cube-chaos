import test from 'node:test';
import assert from 'node:assert/strict';
import {PartEditor,paintPortCell} from '../src/part-editor.js';
import {createPartDraft,getPortCells} from '../src/part-library.js';

for(const side of ['N','E','S','W'])test(`painted ${side} port grows by adjacent unit cells and shrinks only at an end`,()=>{
  const horizontal=['N','S'].includes(side),axis=horizontal?'x':'y';
  let port={x:side==='E'?11:horizontal?3:0,y:side==='S'?9:horizontal?0:3,side,width:1};
  const cell=value=>horizontal?{x:value,y:4}:{x:5,y:value};
  const initial={...port};port=paintPortCell(port,cell(4),12,10);
  assert.equal(port.width,2);assert.deepEqual(initial.width,1);
  port=paintPortCell(port,cell(2),12,10);assert.equal(port[axis],2);assert.equal(port.width,3);
  port=paintPortCell(port,cell(3),12,10);assert.equal(port.width,3,'an interior cell cannot split a continuous opening');
  port=paintPortCell(port,cell(2),12,10);assert.equal(port[axis],3);assert.equal(port.width,2);
  port=paintPortCell(port,cell(4),12,10);assert.equal(port.width,1);
  port=paintPortCell(port,cell(3),12,10);assert.equal(port.width,1,'last cell remains present');
  port=paintPortCell(port,cell(8),12,10);assert.equal(port[axis],8);assert.equal(port.width,1,'a distant placement starts a new one-cell opening');
  const cells=getPortCells(port);assert.equal(cells.length,1);
  assert.equal(horizontal?port.y:port.x,side==='S'?9:side==='E'?11:0);
});

test('one drag paints adjacent port cells once even when pointer events repeat or reverse',()=>{
  const editor=new PartEditor();editor.draft=createPartDraft();editor.tool='entry';editor.draft.entry={x:0,y:2,side:'W',width:1};editor.portStrokeCells=new Set();
  editor.paintLine({x:0,y:2},{x:0,y:5});
  assert.deepEqual(editor.draft.entry,{x:0,y:2,side:'W',width:4});
  editor.paintLine({x:0,y:5},{x:0,y:2});
  assert.deepEqual(editor.draft.entry,{x:0,y:2,side:'W',width:4},'repeated cells in the same stroke do not toggle the marker back');
  editor.portStrokeCells=new Set();editor.paint({x:0,y:5});
  assert.deepEqual(editor.draft.entry,{x:0,y:2,side:'W',width:3},'a later touch on the endpoint removes that cell');
});
