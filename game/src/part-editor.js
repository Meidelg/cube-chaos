import {createPartDraft, getPortCells, validatePartDraft} from './part-library.js';
import {OBJECT_TYPES,createPartObject} from './part-objects.js';
import {escape, icon} from './ui.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const DIRECTIONS={N:{label:'Вверх',angle:-Math.PI/2},E:{label:'Вправо',angle:0},S:{label:'Вниз',angle:Math.PI/2},W:{label:'Влево',angle:Math.PI}};
const TOOLS=[['wall','Стена','<rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16"/>'],['air','Воздух','<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 3"/>'],['entry','Начало','<path d="M14 4h6v16h-6M3 12h12m-5-5 5 5-5 5"/>'],['exit','Конец','<path d="M10 4H4v16h6m0-8h11m-5-5 5 5-5 5"/>'],['wallStart','Первая стена','<path d="M5 4v16m4-16v16m3-8h8m-4-4 4 4-4 4"/>'],['pan','Двигать','<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>']];
const svg=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const actionIcon=(action,label,content,extra='')=>`<button type="button" class="part-icon-button" data-editor-action="${action}" aria-label="${label}" title="${label}" ${extra}>${content}</button>`;
const OBJECT_LABELS=()=>Object.fromEntries(OBJECT_TYPES.map(item=>[item.type,item.label]));
const SHORT_LABELS={'breakable-color-block':'Цветной блок','breakable-block':'Блок','breakable-color-wall':'Цветная стена','breakable-wall':'Стена · удары',spinner:'Лопасть',resize:'Размер ×2'};
const TURN=['N','E','S','W'];
const OBJECT_ICONS={laser:'<path d="M3 8v8m18-8v8M5 12h14m-8-4 2 4-2 4"/>',spinner:'<circle cx="12" cy="12" r="2"/><path d="M3 12h6m6 0h6M12 3v6m0 6v6"/>',press:'<path d="M3 5h18M6 5v7h12V5M3 21h18m-9-7v5m-3-3 3 3 3-3"/>',bumper:'<circle cx="12" cy="12" r="8"/><path d="m8 12 4-4 4 4m-4-4v9"/>',conveyor:'<rect x="3" y="5" width="18" height="14"/><path d="m7 9 3 3-3 3m7-6 3 3-3 3"/>',boost:'<path d="m5 5 7 7-7 7m8-14 7 7-7 7"/>',slow:'<path d="M5 5v14m7-14v14m7-14v14"/>',resize:'<rect x="3" y="14" width="7" height="7"/><path d="M14 3h7v7m0-7-9 9"/>',portal:'<ellipse cx="12" cy="12" rx="6" ry="9"/><ellipse cx="12" cy="12" rx="2" ry="5"/>','wall-start':'<path d="M4 4v16m4-16v16m4-8h9m-4-4 4 4-4 4"/>'};
function replaceControls(container,html){const focused=container.contains(document.activeElement)?document.activeElement:null,action=focused?.dataset.editorAction;container.innerHTML=html;if(action){const next=[...container.querySelectorAll('[data-editor-action]')].find(button=>button.dataset.editorAction===action&&!button.disabled);next?.focus({preventScroll:true});}}
const objectIcon=type=>svg(OBJECT_ICONS[type]||`<rect x="3" y="${type.endsWith('wall')?'8':'3'}" width="18" height="${type.endsWith('wall')?'8':'18'}"/><path d="m10 5 3 7-3 3 3 4"/>`);

export function objectAtCell(objects,cell){
  return [...(objects||[])].reverse().find(object=>{
    if(object.type==='laser'&&object.end){const a=object,b=object.end;return a.x===b.x?cell.x===a.x&&cell.y>=Math.min(a.y,b.y)&&cell.y<=Math.max(a.y,b.y):cell.y===a.y&&cell.x>=Math.min(a.x,b.x)&&cell.x<=Math.max(a.x,b.x);}
    return cell.x>=object.x&&cell.y>=object.y&&cell.x<object.x+(object.w||1)&&cell.y<object.y+(object.h||1);
  });
}

// A port is painted as individual boundary cells and stored as one continuous strip.
export function paintPortCell(port,cell,width,height){
  const result={...port},horizontal=['N','S'].includes(port.side),length=horizontal?width:height;
  const axis=horizontal?'x':'y',position=clamp(cell[axis],0,length-1);
  const start=port[axis],end=start+port.width-1;
  if(position===start-1){result[axis]=position;result.width++;}
  else if(position===end+1)result.width++;
  else if(position===start&&port.width>1){result[axis]++;result.width--;}
  else if(position===end&&port.width>1)result.width--;
  else if(position<start||position>end){result[axis]=position;result.width=1;}
  if(horizontal)result.y=port.side==='N'?0:height-1;
  else result.x=port.side==='W'?0:width-1;
  return result;
}

/** Fullscreen grid editor. Persistence and file access stay in Game / SaveManager. */
export class PartEditor {
  constructor({ui,onSave,onDelete,onExport,onImport,onClose,onTest}={}){
    Object.assign(this,{ui,onSave,onDelete,onExport,onImport,onClose,onTest});
    this.parts=[];this.draft=null;this.active=false;this.busy=false;this.undoStack=[];
    this.tool='wall';this.page='field';this.libraryPage=0;this.errorIndex=0;this.objectPage=0;this.propertyPage=0;this.selectedObjectId=null;this.pendingObject=null;this.settingsTarget='part';
    this.pointers=new Map();this.camera={scale:24,x:0,y:0};this.keyboardCell={x:0,y:0};
  }
  open(parts=[],draft){
    this.destroy();
    this.parts=clone(parts);this.draft=clone(draft||this.draft||createPartDraft());
    const persisted=this.parts.find(part=>part.id===this.draft.id);
    this.baseline=persisted?JSON.stringify(persisted):draft?'':JSON.stringify(this.draft);
    this.undoStack=[];this.busy=false;this.closing=false;
    this.tool='wall';this.page='field';this.errorIndex=0;this.keyboardCell={x:0,y:0};this.pendingObject=null;this.selectedObjectId=null;this.objectPage=0;this.propertyPage=0;this.settingsTarget='part';this.toolsSignature=null;this.objectSettingsSignature=null;
    const html=this.markup();
    if(this.ui)this.ui.modal('Редактор частей',html);
    else{document.querySelector('#modalTitle').textContent='Редактор частей';document.querySelector('#modalBody').innerHTML=html;const dialog=document.querySelector('#modal');if(!dialog.open)dialog.showModal();}
    this.dialog=document.querySelector('#modal');this.root=document.querySelector('#partEditor');this.canvas=this.root.querySelector('canvas');
    this.dialog.dataset.kind='part-editor';document.body.dataset.menuSection='editor';
    this.back=document.querySelector('#modalBack');delete this.back.dataset.action;delete this.back.dataset.menu;this.back.setAttribute('aria-label','К настройкам');this.back.title='К настройкам';
    this.active=true;this.events=new AbortController();const signal=this.events.signal;
    this.root.addEventListener('click',event=>this.onClick(event),{signal});
    this.root.addEventListener('input',event=>this.onInput(event),{signal});
    this.root.addEventListener('change',event=>this.onChange(event),{signal});
    this.back.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();void this.close();},{capture:true,signal});
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();void this.close();},{signal});
    this.dialog.addEventListener('close',()=>this.destroy(),{signal});
    this.canvas.addEventListener('pointerdown',event=>this.pointerDown(event),{signal});
    this.canvas.addEventListener('pointermove',event=>this.pointerMove(event),{signal});
    this.canvas.addEventListener('pointerup',event=>this.pointerUp(event),{signal});
    this.canvas.addEventListener('pointercancel',event=>this.pointerUp(event,true),{signal});
    this.canvas.addEventListener('lostpointercapture',event=>{if(this.pointers.has(event.pointerId))this.pointerUp(event,true);},{signal});
    this.canvas.addEventListener('wheel',event=>{event.preventDefault();const p=this.point(event);this.zoom(Math.exp(-event.deltaY*.0015),p);},{passive:false,signal});
    this.canvas.addEventListener('keydown',event=>this.keyDown(event),{signal});
    this.root.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA/.test(event.target.tagName)){event.preventDefault();this.undo();}},{signal});
    this.observer=new ResizeObserver(()=>this.resizeCanvas());this.observer.observe(this.canvas);
    this.update();this.renderLibrary();this.resizeCanvas();this.fit();
    return this;
  }
  get isDirty(){return !!this.pendingObject||!!this.draft&&JSON.stringify(this.draft)!==this.baseline;}
  get isOpen(){return this.active;}
  async close(){
    if(this.closing||this.busy)return false;
    if(!this.confirmDiscard())return false;
    if(this.isDirty){const persisted=this.parts.find(part=>part.id===this.draft.id);this.draft=persisted?clone(persisted):null;this.baseline=JSON.stringify(this.draft);this.pendingObject=null;}
    this.closing=true;this.destroy();
    if(this.onClose)await this.onClose();else this.dialog?.close();
    this.closing=false;return true;
  }
  destroy(){
    this.events?.abort();this.observer?.disconnect();this.pointers.clear();this.active=false;
    if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;
    if(this.back){this.back.dataset.action='close-modal';delete this.back.dataset.menu;this.back.setAttribute('aria-label','Назад');this.back.title='Назад';}
  }
  setParts(parts){this.parts=clone(parts||[]);if(this.active)this.renderLibrary();}
  confirmDiscard(){return !this.isDirty||window.confirm('Изменения части не сохранены. Выйти без сохранения?');}
  markup(){
    return `<section id="partEditor" class="part-editor" data-page="field" aria-label="Редактор частей карты">
      <nav class="part-tabs" aria-label="Разделы редактора"><button type="button" data-editor-page="field" aria-pressed="true">Поле</button><button type="button" data-editor-page="objects" aria-pressed="false">Объекты</button><button type="button" data-editor-page="settings" aria-pressed="false">Параметры</button><button type="button" data-editor-page="library" aria-pressed="false">Библиотека</button></nav>
      <div class="part-layout">
        <aside class="part-sidebar"><section class="part-settings" aria-label="Параметры части">
          <label class="part-field part-name">Название<input data-editor-field="name" type="text" maxlength="64" value="${escape(this.draft.name)}" autocomplete="off"></label>
          <div class="part-size-fields"><label class="part-field">Ширина<input data-editor-field="width" type="number" inputmode="numeric" min="4" max="32" value="${this.draft.grid[0].length}"></label><label class="part-field">Высота<input data-editor-field="height" type="number" inputmode="numeric" min="4" max="32" value="${this.draft.grid.length}"></label><button type="button" class="secondary" data-editor-action="resize">Применить</button></div>
          <label class="part-enabled"><span>Для генератора</span><input data-editor-field="enabled" type="checkbox" ${this.draft.enabled!==false?'checked':''}></label>
          <div class="part-marker-options"><span id="partMarkerLabel">Направление маркера</span><div class="part-directions" role="group" aria-labelledby="partMarkerLabel">${Object.entries(DIRECTIONS).map(([side,d])=>`<button type="button" data-editor-direction="${side}" aria-label="${d.label}" title="${d.label}" aria-pressed="false">${svg(`<g transform="rotate(${d.angle*180/Math.PI} 12 12)"><path d="M4 12h15m-6-6 6 6-6 6"/></g>`)}</button>`).join('')}</div><p class="part-marker-hint" id="partMarkerHint">Выбери маркер на вкладке «Поле».</p></div>
          <div class="part-setting-actions"><button type="button" class="secondary" data-editor-action="new">Новая часть</button><button type="button" class="secondary part-danger" data-editor-action="clear">Очистить поле</button></div>
        </section><section class="part-object-settings" aria-label="Параметры объекта"></section><section class="part-library" aria-label="Сохранённые части"><div class="part-library-head"><strong>Мои части</strong><button type="button" class="secondary" data-editor-action="new">Новая</button></div><div class="part-library-list" id="partLibraryList"></div><div class="part-library-pages"><button type="button" class="part-icon-button" data-editor-action="library-prev" aria-label="Предыдущие части">${svg('<path d="M20 12H5m6-6-6 6 6 6"/>')}</button><span id="partLibraryPage"></span>${actionIcon('library-next','Следующие части',icon('arrow'))}</div><div class="part-file-actions"><button type="button" class="secondary" data-editor-action="export" aria-label="Экспорт частей JSON" title="Экспорт частей JSON">${icon('download')}<span>Экспорт</span></button><button type="button" class="secondary" data-editor-action="import" aria-label="Импорт частей JSON" title="Импорт частей JSON">${icon('refresh')}<span>Импорт</span></button></div></section></aside>
        <section class="part-board" aria-label="Поле части">
          <div class="part-tools" role="group" aria-label="Инструменты"></div>
          <div class="part-canvas-wrap"><canvas tabindex="0" aria-label="Сетка части. Стрелки выбирают клетку, пробел ставит выбранный блок; плюс и минус меняют масштаб."></canvas><div class="part-field-context"></div><div class="part-camera">${actionIcon('undo','Отменить изменение',svg('<path d="M9 5 3 11l6 6M3 11h10a7 7 0 0 1 7 7"/>'))}${actionIcon('zoom-out','Уменьшить масштаб',svg('<path d="M5 12h14"/>'))}${actionIcon('zoom-in','Увеличить масштаб',svg('<path d="M5 12h14M12 5v14"/>'))}${actionIcon('fit','Показать всю часть',icon('fit'))}</div><span class="part-coordinate" id="partCoordinate" aria-live="off">1 × 1 юнит</span></div>
          <div class="part-legend"><span class="part-entry-mark"><b>Н →</b> Начало</span><span class="part-exit-mark"><b>К →</b> Конец</span><span class="part-wall-mark"><b>║ →</b> Первая стена</span></div>
        </section>
      </div>
      <div class="part-validation" role="status" aria-live="polite"><span id="partValidation"></span><button type="button" class="part-icon-button" data-editor-action="next-error" aria-label="Следующее замечание" title="Следующее замечание">${icon('arrow')}</button></div>
      <footer class="part-footer"><span id="partSaveState"></span>${this.onTest?'<button type="button" class="secondary" data-editor-action="test">Проверить</button>':''}<button type="button" class="primary" data-editor-action="save">Сохранить</button></footer>
    </section>`;
  }
  async onClick(event){
    const target=event.target.closest('[data-editor-action],[data-editor-tool],[data-editor-page],[data-editor-direction],[data-editor-object-direction],[data-editor-load],[data-editor-delete]');
    if(!target||target.disabled||this.busy)return;
    if(target.dataset.editorTool){this.setTool(target.dataset.editorTool);return;}
    if(target.dataset.editorPage){this.page=target.dataset.editorPage;if(this.page==='field'&&this.isObjectTool)this.setTool('wall');if(this.page==='objects'&&!this.isObjectTool)this.setTool('select');if(this.page==='settings')this.settingsTarget=this.selectedObject()?'object':'part';this.update();this.resizeCanvas();return;}
    if(target.dataset.editorDirection){const marker=this.selectedMarker();if(marker){this.remember();marker[this.tool==='wallStart'?'direction':'side']=target.dataset.editorDirection;if(this.tool!=='wallStart')this.placePort(this.tool,marker.x,marker.y);this.changed();}return;}
    if(target.dataset.editorObjectDirection){this.changeObjectDirection(target.dataset.editorObjectDirection);return;}
    if(target.dataset.editorLoad){if(this.confirmDiscard()){const part=this.parts.find(p=>p.id===target.dataset.editorLoad);if(part)this.loadDraft(part);}return;}
    if(target.dataset.editorDelete){await this.deletePart(target.dataset.editorDelete);return;}
    switch(target.dataset.editorAction){
      case 'save':await this.save();break;
      case 'test':if(this.validation.valid){this.destroy();try{await this.onTest?.(clone(this.draft));}catch(error){this.open(this.parts,this.draft);this.notify(error.message||'Не удалось проверить часть.');}}break;
      case 'new':if(this.confirmDiscard()){this.loadDraft(createPartDraft());this.page='field';this.setTool('wall');}break;
      case 'clear':if(window.confirm('Заменить всё поле воздухом? Маркеры останутся на местах.')){this.remember();this.draft.grid=this.draft.grid.map(row=>'б'.repeat(row.length));this.changed();}break;
      case 'resize':this.resizeGrid();break;
      case 'undo':this.undo();break;
      case 'zoom-in':this.zoom(1.3);break;
      case 'zoom-out':this.zoom(1/1.3);break;
      case 'fit':this.fit();break;
      case 'library-prev':this.libraryPage--;this.renderLibrary();break;
      case 'library-next':this.libraryPage++;this.renderLibrary();break;
      case 'next-error':this.errorIndex++;this.updateValidation();break;
      case 'rotate-marker':this.rotateMarker();break;
      case 'objects-prev':this.objectPage--;this.update();break;
      case 'objects-next':this.objectPage++;this.update();break;
      case 'object-select':this.setTool('select');break;
      case 'object-erase':this.setTool('erase-object');break;
      case 'object-properties':if(this.selectedObject()){this.page='settings';this.settingsTarget='object';this.update();}break;
      case 'object-delete':this.deleteSelectedObject();break;
      case 'object-rotate':{const object=this.selectedObject();if(object)this.changeObjectDirection(TURN[(TURN.indexOf(object.direction||'E')+1)%4]);break;}
      case 'object-properties-prev':this.propertyPage--;this.update();break;
      case 'object-properties-next':this.propertyPage++;this.update();break;
      case 'part-properties':this.settingsTarget='part';this.update();break;
      case 'cancel-object':this.pendingObject=null;this.pendingError=null;this.update();break;
      case 'export':await this.runAsync(()=>this.onExport?.(clone(this.parts)));break;
      case 'import':if(this.confirmDiscard())await this.runAsync(async()=>{const parts=await this.onImport?.();if(Array.isArray(parts)){this.setParts(parts);const matching=this.parts.find(p=>p.id===this.draft.id);if(matching)this.loadDraft(matching);this.page='library';this.update();}});break;
    }
  }
  onInput(event){
    if(this.busy)return;const field=event.target.dataset.editorField;
    if(field==='name'){if(!this.nameEditing){this.remember();this.nameEditing=true;}this.draft.name=event.target.value;this.changed();}
  }
  onChange(event){
    if(this.busy)return;const field=event.target.dataset.editorField;
    if(field==='name'){this.nameEditing=false;return;}
    if(field==='enabled'){this.remember();this.draft.enabled=event.target.checked;this.changed();}
    if(event.target.dataset.objectField){if(!event.target.checkValidity()){event.target.reportValidity();return;}this.setObjectProperty(event.target.dataset.objectField,Number(event.target.value));}
  }
  get isObjectTool(){return this.tool.startsWith('object:')||this.tool==='select'||this.tool==='erase-object';}
  setTool(tool){if(tool!==this.tool){this.pendingObject=null;this.pendingError=null;}this.tool=tool;if(tool.startsWith('object:')||(!tool.startsWith('object:')&&tool!=='select'&&tool!=='erase-object'))this.selectedObjectId=null;this.update();}
  selectedObject(){return (this.draft?.objects||[]).find(object=>object.id===this.selectedObjectId);}
  selectedMarker(){return ['entry','exit','wallStart'].includes(this.tool)?this.draft[this.tool]:null;}
  rotateMarker(){const marker=this.selectedMarker();if(!marker)return;this.remember();const field=this.tool==='wallStart'?'direction':'side';marker[field]=TURN[(TURN.indexOf(marker[field])+1)%4];if(this.tool!=='wallStart')this.placePort(this.tool,marker.x,marker.y);this.changed();}
  renderTools(){
    const objects=this.page==='objects'||this.isObjectTool,count=Math.ceil(OBJECT_TYPES.length/4);this.objectPage=clamp(this.objectPage,0,count-1);
    const signature=`${objects}:${this.objectPage}`;if(this.toolsSignature===signature)return;this.toolsSignature=signature;
    replaceControls(this.root.querySelector('.part-tools'),objects?
      `${actionIcon('objects-prev','Предыдущие объекты',svg('<path d="M20 12H5m6-6-6 6 6 6"/>'),this.objectPage===0?'disabled':'')}${OBJECT_TYPES.slice(this.objectPage*4,this.objectPage*4+4).map(({type,label})=>`<button type="button" data-editor-tool="object:${type}" aria-label="${escape(label)}" aria-pressed="false" title="${escape(label)}">${objectIcon(type)}<span>${escape(SHORT_LABELS[type]||label)}</span></button>`).join('')}${'<span class="part-tool-empty" aria-hidden="true"></span>'.repeat(Math.max(0,4-OBJECT_TYPES.slice(this.objectPage*4,this.objectPage*4+4).length))}${actionIcon('objects-next','Следующие объекты',icon('arrow'),this.objectPage>=count-1?'disabled':'')}`:
      TOOLS.map(([tool,label,path])=>`<button type="button" data-editor-tool="${tool}" aria-label="${label}" aria-pressed="false" title="${label}">${svg(path)}<span>${label}</span></button>`).join(''));
  }
  renderFieldContext(){
    const marker=this.selectedMarker(),object=this.selectedObject(),objects=this.page==='objects'||this.isObjectTool;
    let html='';
    if(marker){const direction=marker.direction||marker.side;html=`${actionIcon('rotate-marker','Повернуть маркер на 90°',icon('refresh'))}<span>${this.tool==='entry'?'Начало':this.tool==='exit'?'Конец':'Первая стена'} · ${DIRECTIONS[direction].label}</span>`;}
    else if(objects){html=`${actionIcon('object-select','Выбрать объект',svg('<path d="m5 3 14 10-7 1-4 7-3-18Z"/>'),`aria-pressed="${this.tool==='select'}"`)}${actionIcon('object-erase','Удалить объект касанием',icon('close'),`aria-pressed="${this.tool==='erase-object'}"`)}${object?actionIcon('object-properties','Параметры выбранного объекта',icon('settings'))+actionIcon('object-rotate','Повернуть объект на 90°',icon('refresh')):''}<span>${object?.type==='wall-start'?'По касанию':`${this.objectPage+1} / ${Math.ceil(OBJECT_TYPES.length/4)}`}</span>`;}
    if(this.pendingObject)html=`${actionIcon('cancel-object','Отменить первую точку',icon('close'))}<span>Вторая клетка ${this.pendingObject.type==='laser'?'лазера':'телепорта'}</span>`;
    const context=this.root.querySelector('.part-field-context');replaceControls(context,html);context.hidden=!html;
  }
  objectProperties(object){
    const width=this.draft.grid[0].length,height=this.draft.grid.length;
    const fields=[{key:'x',label:'X клетки',value:object.x+1,min:1,max:width},{key:'y',label:'Y клетки',value:object.y+1,min:1,max:height}];
    if(object.type.endsWith('wall'))fields.push({key:'wallLength',label:'Длина стены',value:Math.max(object.w,object.h),min:1,max:32});
    if(object.type.endsWith('wall'))fields.push({key:'hits',label:'Ударов до разрушения',value:object.hits,min:1,max:999});
    if(object.type.includes('-color-'))fields.push({key:'colorSlot',label:'Цвет кубика №',value:(object.colorSlot||0)+1,min:1,max:12});
    if(object.type==='spinner')fields.push({key:'length',label:'Длина лопасти',value:object.length,min:.5,max:12,step:.5},{key:'speed',label:'Скорость вращения',value:object.speed,min:-4,max:4,step:.1});
    if(object.type==='press')fields.push({key:'travel',label:'Ход пресса',value:object.travel,min:0,max:24},{key:'period',label:'Период, с',value:object.period,min:.25,max:60,step:.25});
    if(['bumper','boost','slow'].includes(object.type))fields.push({key:'multiplier',label:'Множитель скорости',value:object.multiplier,min:object.type==='slow'?.05:1,max:object.type==='slow'?1:4,step:.05});
    if(object.type==='slow')fields.push({key:'duration',label:'Длительность, с',value:object.duration,min:.1,max:30,step:.1});
    if(object.type==='laser')fields.push({key:'endX',label:'X второго блока',value:object.end.x+1,min:1,max:width},{key:'endY',label:'Y второго блока',value:object.end.y+1,min:1,max:height},{key:'period',label:'Период, с',value:object.period,min:.25,max:60,step:.25},{key:'on',label:'Лазер включён, с',value:object.on,min:.05,max:object.period,step:.05});
    return fields;
  }
  renderObjectSettings(){
    const panel=this.root.querySelector('.part-object-settings'),object=this.selectedObject();
    if(!object){panel.innerHTML='';this.objectSettingsSignature=null;if(this.settingsTarget==='object'){this.settingsTarget='part';this.root.dataset.settingsTarget='part';}return;}
    const fields=this.objectProperties(object),count=Math.ceil(fields.length/4);this.propertyPage=clamp(this.propertyPage,0,count-1);
    const signature=JSON.stringify([object,this.propertyPage]);if(this.objectSettingsSignature===signature)return;this.objectSettingsSignature=signature;
    panel.innerHTML=`<div class="part-object-head"><strong>${escape(SHORT_LABELS[object.type]||OBJECT_LABELS()[object.type]||object.type)}<small>${this.propertyPage+1} / ${count}</small></strong>${actionIcon('object-properties-prev','Предыдущие параметры',svg('<path d="M20 12H5m6-6-6 6 6 6"/>'),this.propertyPage===0?'disabled':'')}${actionIcon('object-properties-next','Следующие параметры',icon('arrow'),this.propertyPage>=count-1?'disabled':'')}${actionIcon('part-properties','Параметры части',icon('grid'))}${actionIcon('object-delete','Удалить выбранный объект',icon('close'))}</div><div class="part-object-fields">${fields.slice(this.propertyPage*4,this.propertyPage*4+4).map(field=>`<label class="part-field"><span>${field.label}</span><input type="number" inputmode="${field.step?'decimal':'numeric'}" data-object-field="${field.key}" value="${field.value}" min="${field.min}" max="${field.max}" step="${field.step||1}"></label>`).join('')}</div><div class="part-object-directions" role="group" aria-label="Направление объекта">${Object.entries(DIRECTIONS).map(([direction,d])=>`<button type="button" class="part-icon-button" data-editor-object-direction="${direction}" aria-label="${d.label}" title="${d.label}" aria-pressed="${(object.direction||'E')===direction}">${svg(`<g transform="rotate(${d.angle*180/Math.PI} 12 12)"><path d="M4 12h15m-6-6 6 6-6 6"/></g>`)}</button>`).join('')}</div>`;
  }
  setObjectProperty(key,value){
    const object=this.selectedObject();if(!object||!Number.isFinite(value))return;this.remember();
    if(key==='wallLength'){const vertical=['N','S'].includes(object.direction);object.w=vertical?1:value;object.h=vertical?value:1;}
    else if(key==='endX')object.end.x=value-1;
    else if(key==='endY')object.end.y=value-1;
    else if(key==='colorSlot')object.colorSlot=value-1;
    else if(key==='x'||key==='y'){const next=value-1;if(object.end)object.end[key]+=next-object[key];object[key]=next;}
    else object[key]=value;
    this.changed();
  }
  changeObjectDirection(direction){
    const object=this.selectedObject();if(!object)return;this.remember();object.direction=direction;
    if(object.type.endsWith('wall')){const length=Math.max(object.w,object.h);object.w=['N','S'].includes(direction)?1:length;object.h=['N','S'].includes(direction)?length:1;}
    if(object.type==='laser'){const length=Math.abs(object.end.x-object.x)+Math.abs(object.end.y-object.y),d=DIRECTIONS[direction];object.end={x:object.x+Math.round(Math.cos(d.angle))*length,y:object.y+Math.round(Math.sin(d.angle))*length};}
    this.changed();
  }
  deleteSelectedObject(){
    const object=this.selectedObject();if(!object)return;this.remember();
    const ids=new Set([object.id]);if(object.type==='portal'&&object.pair)ids.add(object.pair);
    this.draft.objects=this.draft.objects.filter(item=>!ids.has(item.id));this.selectedObjectId=null;this.objectSettingsSignature=null;this.settingsTarget='part';this.changed();
  }
  placeObject(cell){
    const type=this.tool.slice(7);if(!OBJECT_TYPES.some(item=>item.type===type))return;
    if(this.objectStrokePlaced)return;this.objectStrokePlaced=true;
    if(type==='laser'||type==='portal'){
      if(!this.pendingObject){this.pendingObject={type,cell:{...cell}};this.pendingError=null;return;}
      const start=this.pendingObject.cell;
      if(start.x===cell.x&&start.y===cell.y){this.pendingError='Выбери другую клетку для второй точки.';return;}
      if(type==='laser'&&start.x!==cell.x&&start.y!==cell.y){this.pendingError='Блоки лазера должны стоять на одной горизонтали или вертикали.';return;}
      this.remember();this.draft.objects||=[];
      const first=createPartObject(type,start,type==='laser'?{end:{...cell}}:{});
      if(type==='portal'){const second=createPartObject(type,cell);first.pair=second.id;second.pair=first.id;this.draft.objects.push(first,second);}else this.draft.objects.push(first);
      this.selectedObjectId=first.id;this.pendingObject=null;this.pendingError=null;this.propertyPage=0;return;
    }
    this.remember();this.draft.objects||=[];const object=createPartObject(type,cell);this.draft.objects.push(object);this.selectedObjectId=object.id;this.propertyPage=0;
  }
  remember(){this.undoStack.push(clone(this.draft));if(this.undoStack.length>40)this.undoStack.shift();}
  undo(){if(this.busy)return;if(this.pendingObject){this.pendingObject=null;this.pendingError=null;this.changed();return;}if(!this.undoStack.length)return;this.draft=this.undoStack.pop();if(!this.selectedObject())this.selectedObjectId=null;this.syncFields();this.changed();}
  changed(){this.errorIndex=0;this.update();}
  update(){
    if(!this.active)return;this.root.dataset.page=this.page;this.root.dataset.tool=this.tool;this.root.dataset.settingsTarget=this.settingsTarget;
    this.renderTools();this.renderFieldContext();this.renderObjectSettings();
    this.root.querySelectorAll('[data-editor-page]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorPage===this.page)));
    this.root.querySelectorAll('[data-editor-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.editorTool===this.tool)));
    const marker=this.selectedMarker();
    this.root.querySelector('.part-marker-options').classList.toggle('has-marker',!!marker);
    this.root.querySelector('#partMarkerLabel').textContent=this.tool==='wallStart'?'Первая стена · по таймеру':'Направление выхода из части';
    this.root.querySelectorAll('[data-editor-direction]').forEach(button=>{button.disabled=!marker;button.setAttribute('aria-pressed',String(button.dataset.editorDirection===(marker?.direction||marker?.side)));});
    this.root.querySelector('#partMarkerHint').textContent=this.tool==='entry'||this.tool==='exit'?'Рисуй соседние клетки для расширения. Касание крайней клетки убирает её.':this.tool==='wallStart'?'Стрелка задаёт направление первой стены. Она стартует по таймеру.':'Выбери маркер на вкладке «Поле».';
    this.root.querySelector('[data-editor-action=undo]').disabled=(!this.undoStack.length&&!this.pendingObject)||this.busy;
    this.root.querySelector('#partSaveState').textContent=this.busy?'Подожди…':this.isDirty?'Не сохранено':this.parts.some(p=>p.id===this.draft.id)?'Сохранено':'Новая часть';
    this.root.querySelectorAll('[data-editor-action=export]').forEach(b=>b.disabled=!this.parts.length||this.busy);
    this.updateValidation();this.draw();
  }
  updateValidation(){
    if(!this.active)return;this.validation=validatePartDraft(this.draft);
    if(this.pendingObject)this.validation={...this.validation,valid:false,errors:[this.pendingError||`Выбери вторую клетку ${this.pendingObject.type==='laser'?'лазера на одной линии с первой':'парного телепорта'}.`,...this.validation.errors]};
    const errors=this.validation.errors.map(item=>typeof item==='string'?item:item.message||String(item));
    const warnings=(this.validation.warnings||[]).map(item=>typeof item==='string'?item:item.message||String(item));
    const messages=errors.length?errors:warnings;
    this.errorIndex=messages.length?this.errorIndex%messages.length:0;
    const status=this.root.querySelector('.part-validation');status.classList.toggle('invalid',!this.validation.valid);
    this.root.querySelector('#partValidation').textContent=messages.length?`${messages.length>1?`${this.errorIndex+1}/${messages.length} · `:''}${messages[this.errorIndex]}`:'Часть готова для генератора';
    this.root.querySelector('[data-editor-action=next-error]').hidden=messages.length<2;
    this.root.querySelector('[data-editor-action=save]').disabled=!this.validation.valid||this.busy;
    const test=this.root.querySelector('[data-editor-action=test]');if(test)test.disabled=!this.validation.valid||this.busy;
  }
  syncFields(){
    if(!this.active)return;
    this.root.querySelector('[data-editor-field=name]').value=this.draft.name;
    this.root.querySelector('[data-editor-field=width]').value=this.draft.grid[0].length;
    this.root.querySelector('[data-editor-field=height]').value=this.draft.grid.length;
    this.root.querySelector('[data-editor-field=enabled]').checked=this.draft.enabled!==false;
  }
  loadDraft(draft){
    this.draft=clone(draft);this.baseline=JSON.stringify(this.draft);this.undoStack=[];this.nameEditing=false;this.errorIndex=0;
    this.pendingObject=null;this.selectedObjectId=null;this.settingsTarget='part';this.propertyPage=0;this.objectSettingsSignature=null;
    this.keyboardCell={x:0,y:0};this.syncFields();this.update();this.renderLibrary();this.fit();
  }
  resizeGrid(){
    const widthInput=this.root.querySelector('[data-editor-field=width]'),heightInput=this.root.querySelector('[data-editor-field=height]');
    if(!widthInput.checkValidity()||!heightInput.checkValidity()){(!widthInput.checkValidity()?widthInput:heightInput).reportValidity();return;}
    const width=Number(widthInput.value),height=Number(heightInput.value),old=this.draft.grid;
    if(width===old[0].length&&height===old.length)return;
    if((width<old[0].length||height<old.length)&&!window.confirm('При уменьшении края поля будут обрезаны. Продолжить?')){this.syncFields();return;}
    this.remember();this.draft.grid=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>old[y]?.[x]||'а').join(''));
    for(const key of ['entry','exit']){const marker=this.draft[key];marker.width=Math.min(marker.width,['E','W'].includes(marker.side)?height:width);this.placePort(key,marker.x,marker.y);}
    const wall=this.draft.wallStart;wall.x=clamp(wall.x,0,width-1);wall.y=clamp(wall.y,0,height-1);
    this.keyboardCell.x=clamp(this.keyboardCell.x,0,width-1);this.keyboardCell.y=clamp(this.keyboardCell.y,0,height-1);
    this.changed();this.fit();
  }
  renderLibrary(){
    if(!this.active)return;const count=Math.max(1,Math.ceil(this.parts.length/4));this.libraryPage=clamp(this.libraryPage,0,count-1);
    const list=this.root.querySelector('#partLibraryList');
    list.innerHTML=this.parts.length?this.parts.slice(this.libraryPage*4,this.libraryPage*4+4).map(part=>`<article class="part-library-item ${part.id===this.draft.id?'current':''}"><button type="button" class="part-library-load" data-editor-load="${escape(part.id)}" aria-label="Открыть ${escape(part.name)}"><strong>${escape(part.name)}</strong><small>${part.grid[0].length} × ${part.grid.length} · ${part.enabled!==false?'В генераторе':'Отключена'}</small></button><button type="button" class="part-icon-button part-danger" data-editor-delete="${escape(part.id)}" aria-label="Удалить ${escape(part.name)}" title="Удалить часть">${svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>')}</button></article>`).join(''):'<p class="empty-state">Сохранённых частей пока нет</p>';
    this.root.querySelector('#partLibraryPage').textContent=`${this.libraryPage+1} / ${count}`;
    this.root.querySelector('[data-editor-action=library-prev]').disabled=this.libraryPage===0;
    this.root.querySelector('[data-editor-action=library-next]').disabled=this.libraryPage===count-1;
    this.root.querySelector('[data-editor-action=export]').disabled=!this.parts.length;
  }
  async runAsync(callback){
    if(this.busy)return;this.busy=true;this.update();
    try{return await callback();}catch(error){this.notify(error.message||'Не удалось выполнить действие.');}
    finally{this.busy=false;this.update();}
  }
  async save(){
    if(this.pendingObject||!this.validation.valid||!this.onSave)return;
    await this.runAsync(async()=>{const draft=clone(this.draft);const parts=await this.onSave(draft);if(Array.isArray(parts))this.setParts(parts);this.baseline=JSON.stringify(this.draft);this.notify('Часть сохранена');this.renderLibrary();});
  }
  async deletePart(id){
    const part=this.parts.find(item=>item.id===id);if(!part||!this.onDelete)return;
    if(!window.confirm(`Удалить часть «${part.name}»?`))return;
    if(id===this.draft.id&&!this.confirmDiscard())return;
    await this.runAsync(async()=>{const parts=await this.onDelete(id);if(Array.isArray(parts))this.setParts(parts);else this.setParts(this.parts.filter(item=>item.id!==id));if(id===this.draft.id)this.loadDraft(createPartDraft());});
  }
  notify(message){if(this.ui)this.ui.toast(message);else window.alert(message);}
  point(event){const rect=this.canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
  cellAt(point){return{x:Math.floor((point.x-this.camera.x)/this.camera.scale),y:Math.floor((point.y-this.camera.y)/this.camera.scale)};}
  inGrid({x,y}){return x>=0&&y>=0&&y<this.draft.grid.length&&x<this.draft.grid[0].length;}
  setCell(x,y,value){if(!this.inGrid({x,y}))return;const row=this.draft.grid[y];if(row[x]!==value)this.draft.grid[y]=row.slice(0,x)+value+row.slice(x+1);}
  placePort(key,x,y){
    const marker=this.draft[key],width=this.draft.grid[0].length,height=this.draft.grid.length;
    if(['N','S'].includes(marker.side)){marker.width=clamp(marker.width,1,width);marker.x=clamp(x,0,width-marker.width);marker.y=marker.side==='N'?0:height-1;}
    else{marker.width=clamp(marker.width,1,height);marker.x=marker.side==='W'?0:width-1;marker.y=clamp(y,0,height-marker.width);}
    for(const cell of getPortCells(marker))this.setCell(cell.x,cell.y,'б');
  }
  paint(cell){
    if(!this.inGrid(cell))return;this.keyboardCell={...cell};
    if(this.tool.startsWith('object:'))this.placeObject(cell);
    else if(this.tool==='select'){this.selectedObjectId=objectAtCell(this.draft.objects,cell)?.id||null;this.propertyPage=0;}
    else if(this.tool==='erase-object'){if(this.objectStrokePlaced)return;this.objectStrokePlaced=true;this.selectedObjectId=objectAtCell(this.draft.objects,cell)?.id||null;this.deleteSelectedObject();}
    else if(this.tool==='wall'||this.tool==='air')this.setCell(cell.x,cell.y,this.tool==='wall'?'а':'б');
    else if(this.tool==='entry'||this.tool==='exit'){
      const marker=this.draft[this.tool],axis=['N','S'].includes(marker.side)?'x':'y',key=`${this.tool}:${marker.side}:${cell[axis]}`;
      if(this.portStrokeCells?.has(key))return;
      this.portStrokeCells?.add(key);
      this.draft[this.tool]=paintPortCell(marker,cell,this.draft.grid[0].length,this.draft.grid.length);
      this.placePort(this.tool,this.draft[this.tool].x,this.draft[this.tool].y);
    }
    else if(this.tool==='wallStart'){Object.assign(this.draft.wallStart,cell);this.setCell(cell.x,cell.y,'б');}
  }
  paintLine(from,to){
    const steps=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y),1);
    for(let i=0;i<=steps;i++)this.paint({x:Math.round(from.x+(to.x-from.x)*i/steps),y:Math.round(from.y+(to.y-from.y)*i/steps)});
  }
  pointerDown(event){
    if(this.busy||event.button>1)return;event.preventDefault();this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(event.pointerId);
    const point=this.point(event);this.pointers.set(event.pointerId,point);
    if(this.pointers.size>1){this.gesture=true;this.lastPinch=this.pinch();this.lastCell=null;return;}
    this.gesture=false;this.strokeSaved=false;this.objectStrokePlaced=false;this.lastCell=null;this.portStrokeCells=new Set();this.pointerOrigin={...point};this.lastPoint={...point};
    this.isPanning=this.tool==='pan'||event.button===1||event.shiftKey;
    // A touch starts drawing only after moving or lifting, so a pinch never paints a stray cell.
    if(event.pointerType!=='touch'&&!this.isPanning){if(!this.isObjectTool)this.remember();this.strokeSaved=true;this.lastCell=this.cellAt(point);this.paint(this.lastCell);this.changed();}
  }
  pinch(){const points=[...this.pointers.values()];return{distance:Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y),center:{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}};}
  pointerMove(event){
    const point=this.point(event),cell=this.cellAt(point);
    this.hoverCell=cell;if(this.pendingObject)this.draw();
    this.root.querySelector('#partCoordinate').textContent=this.inGrid(cell)?`${cell.x+1}, ${cell.y+1} · 1 × 1`:'1 × 1 юнит';
    if(!this.pointers.has(event.pointerId)||this.busy)return;
    this.pointers.set(event.pointerId,point);
    if(this.pointers.size>1){const current=this.pinch();if(this.lastPinch){this.camera.x+=current.center.x-this.lastPinch.center.x;this.camera.y+=current.center.y-this.lastPinch.center.y;this.zoom(current.distance/Math.max(1,this.lastPinch.distance),current.center);}this.lastPinch=current;return;}
    if(this.gesture)return;
    if(this.isPanning){this.camera.x+=point.x-this.lastPoint.x;this.camera.y+=point.y-this.lastPoint.y;this.constrainCamera();this.draw();}
    else{if(!this.strokeSaved){if(!this.isObjectTool)this.remember();this.strokeSaved=true;this.lastCell=this.cellAt(this.pointerOrigin);}this.paintLine(this.lastCell||cell,cell);this.lastCell=cell;this.changed();}
    this.lastPoint=point;
  }
  pointerUp(event,cancelled=false){
    if(!this.pointers.has(event.pointerId))return;
    if(!cancelled&&!this.busy&&!this.gesture&&!this.isPanning&&!this.strokeSaved){if(!this.isObjectTool)this.remember();this.paint(this.cellAt(this.point(event)));this.changed();}
    this.pointers.delete(event.pointerId);if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    if(!this.pointers.size){this.gesture=false;this.lastPinch=null;this.lastCell=null;this.strokeSaved=false;this.portStrokeCells=null;}
  }
  keyDown(event){
    if(this.busy)return;const deltas={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(deltas[event.key]){event.preventDefault();const [dx,dy]=deltas[event.key];if(this.tool==='pan'||event.shiftKey){this.camera.x-=dx*32;this.camera.y-=dy*32;this.constrainCamera();}else{this.keyboardCell.x=clamp(this.keyboardCell.x+dx,0,this.draft.grid[0].length-1);this.keyboardCell.y=clamp(this.keyboardCell.y+dy,0,this.draft.grid.length-1);this.revealCell();this.root.querySelector('#partCoordinate').textContent=`${this.keyboardCell.x+1}, ${this.keyboardCell.y+1} · 1 × 1`;}this.draw();}
    else if(event.key===' '||event.key==='Enter'){event.preventDefault();if(this.tool!=='pan'){this.objectStrokePlaced=false;if(!this.isObjectTool)this.remember();this.paint(this.keyboardCell);this.changed();}}
    else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();this.deleteSelectedObject();}
    else if(event.key==='Escape'&&this.pendingObject){event.preventDefault();event.stopPropagation();this.pendingObject=null;this.pendingError=null;this.changed();}
    else if(event.key==='+'||event.key==='='){event.preventDefault();this.zoom(1.3);}
    else if(event.key==='-'){event.preventDefault();this.zoom(1/1.3);}
    else if(event.key==='0'){event.preventDefault();this.fit();}
  }
  revealCell(){const s=this.camera.scale,pad=s;const x=this.camera.x+this.keyboardCell.x*s,y=this.camera.y+this.keyboardCell.y*s;if(x<pad)this.camera.x+=pad-x;else if(x>this.viewWidth-2*s)this.camera.x-=x-this.viewWidth+2*s;if(y<pad)this.camera.y+=pad-y;else if(y>this.viewHeight-2*s)this.camera.y-=y-this.viewHeight+2*s;this.constrainCamera();}
  resizeCanvas(){
    if(!this.active)return;const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const first=!this.viewWidth;this.viewWidth=rect.width;this.viewHeight=rect.height;const dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);this.dpr=dpr;
    if(first)this.fit();else{this.constrainCamera();this.draw();}
  }
  fit(){if(!this.active||!this.viewWidth||!this.viewHeight)return;const width=this.draft.grid[0].length,height=this.draft.grid.length;this.camera.scale=clamp(Math.min((this.viewWidth-32)/width,(this.viewHeight-32)/height),4,64);this.camera.x=(this.viewWidth-width*this.camera.scale)/2;this.camera.y=(this.viewHeight-height*this.camera.scale)/2;this.draw();}
  zoom(factor,center={x:this.viewWidth/2,y:this.viewHeight/2}){if(!this.viewWidth)return;const old=this.camera.scale,newScale=clamp(old*factor,4,100);this.camera.x=center.x-(center.x-this.camera.x)*newScale/old;this.camera.y=center.y-(center.y-this.camera.y)*newScale/old;this.camera.scale=newScale;this.constrainCamera();this.draw();}
  constrainCamera(){const {scale}=this.camera,width=this.draft.grid[0].length*scale,height=this.draft.grid.length*scale,margin=Math.min(44,this.viewWidth/4,this.viewHeight/4);this.camera.x=clamp(this.camera.x,Math.min(margin,this.viewWidth-width-margin),Math.max(margin,this.viewWidth-width-margin));this.camera.y=clamp(this.camera.y,Math.min(margin,this.viewHeight-height-margin),Math.max(margin,this.viewHeight-height-margin));}
  draw(){
    if(!this.active||!this.viewWidth)return;if(this.frame)return;
    this.frame=requestAnimationFrame(()=>{this.frame=0;this.paintCanvas();});
  }
  drawObject(ctx,object,s,palette){
    const x=object.x*s,y=object.y*s,w=(object.w||1)*s,h=(object.h||1)*s,cx=x+w/2,cy=y+h/2,type=object.type;
    const direction=DIRECTIONS[object.direction||'E'],colored=type.includes('-color-');
    const colors=this.ui?.actions?.profile?.()?.settings?.palette||['#e8584d','#387ec9','#e5b52f','#5c9a50','#996bc7','#e884b5','#2da6a0','#dc8036','#806055','#718494','#9aab39','#be6798'];
    const fill=colored?colors[object.colorSlot||0]:type.startsWith('breakable-')?palette.solid:['laser','press'].includes(type)?palette.danger:['conveyor','wall-start'].includes(type)?palette.wallStart:type==='boost'?palette.entry:type==='slow'?palette.wallStart:palette.exit;
    const arrow=(centerX,centerY,size,angle=direction.angle)=>{ctx.save();ctx.translate(centerX,centerY);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(-size*.3,0);ctx.lineTo(size*.3,0);ctx.moveTo(size*.1,-size*.2);ctx.lineTo(size*.3,0);ctx.lineTo(size*.1,size*.2);ctx.stroke();ctx.restore();};
    const text=(value,centerX=cx,centerY=cy,size=Math.min(16,s*.48),ink=palette.ink)=>{if(s<13)return;ctx.fillStyle=ink;ctx.font=`700 ${Math.max(9,size)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,centerX,centerY);};
    ctx.save();ctx.fillStyle=fill;ctx.strokeStyle=fill;ctx.lineWidth=Math.max(1.5,s*.065);
    if(type.startsWith('breakable-')){
      ctx.fillRect(x,y,w,h);ctx.strokeStyle=palette.ink;ctx.lineWidth=Math.max(1,s*.045);ctx.beginPath();ctx.moveTo(x+w*.38,y);ctx.lineTo(x+w*.55,y+h*.33);ctx.lineTo(x+w*.38,y+h*.58);ctx.lineTo(x+w*.57,y+h);ctx.stroke();
      if(type.endsWith('wall'))text(String(object.hits));else if(colored)text(String((object.colorSlot||0)+1));
    }else if(type==='laser'&&object.end){
      const ex=(object.end.x+.5)*s,ey=(object.end.y+.5)*s;ctx.fillRect(x,y,s,s);ctx.fillRect(object.end.x*s,object.end.y*s,s,s);ctx.beginPath();ctx.moveTo(x+s/2,y+s/2);ctx.lineTo(ex,ey);ctx.lineWidth=Math.max(2,s*.14);ctx.stroke();text('L',cx,cy);text('L',ex,ey);
    }else if(type==='spinner'){
      ctx.save();ctx.translate(cx,cy);ctx.rotate((object.phase||0)+direction.angle);ctx.fillRect(-object.length*s/2,-s*.16,object.length*s,s*.32);ctx.restore();ctx.beginPath();ctx.arc(cx,cy,s*.15,0,Math.PI*2);ctx.fillStyle=palette.solid;ctx.fill();
    }else if(type==='press'){
      const dx=Math.round(Math.cos(direction.angle))*(object.travel||0)*s,dy=Math.round(Math.sin(direction.angle))*(object.travel||0)*s;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx,cy+dy);ctx.stroke();ctx.setLineDash([]);ctx.fillRect(x,y,w,h);ctx.strokeStyle=palette.ink;arrow(cx,cy,s*.9);
    }else if(type==='bumper'){
      ctx.beginPath();ctx.arc(cx,cy,s*.48,0,Math.PI*2);ctx.fill();ctx.strokeStyle=palette.ink;arrow(cx,cy,s*.8);
    }else if(type==='wall-start'){
      ctx.globalAlpha=.18;ctx.fillRect(x,y,s,s);ctx.globalAlpha=1;ctx.save();ctx.translate(cx,cy);ctx.rotate(direction.angle);ctx.fillRect(-s*.36,-s*.4,s*.08,s*.8);ctx.fillRect(-s*.2,-s*.4,s*.08,s*.8);ctx.restore();arrow(cx+s*.12*Math.cos(direction.angle),cy+s*.12*Math.sin(direction.angle),s*.65);
    }else if(type==='portal'){
      ctx.beginPath();ctx.ellipse(cx,cy,s*.35,s*.46,direction.angle,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,cy,s*.16,s*.3,direction.angle,0,Math.PI*2);ctx.stroke();const pairKey=item=>[item.id,item.pair].sort().join('|'),pairs=[...new Set((this.draft.objects||[]).filter(item=>item.type==='portal').map(pairKey))];text(String(pairs.indexOf(pairKey(object))+1),cx,cy,Math.min(13,s*.4),fill);
    }else{
      ctx.globalAlpha=.22;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;
      if(type==='conveyor'||type==='boost'){arrow(cx,cy,s*.9);if(type==='boost')arrow(cx-Math.cos(direction.angle)*s*.23,cy-Math.sin(direction.angle)*s*.23,s*.65);}
      else if(type==='slow')text('½',cx,cy,Math.min(20,s*.65),fill);
      else if(type==='resize')text('×2',cx,cy,Math.min(17,s*.5),fill);
    }
    if(object.id===this.selectedObjectId){
      const left=type==='laser'?Math.min(object.x,object.end.x)*s:x,top=type==='laser'?Math.min(object.y,object.end.y)*s:y;
      const width=type==='laser'?(Math.abs(object.end.x-object.x)+1)*s:w,height=type==='laser'?(Math.abs(object.end.y-object.y)+1)*s:h;
      ctx.strokeStyle=palette.exit;ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(left-2,top-2,width+4,height+4);ctx.setLineDash([]);
    }
    ctx.restore();
  }
  paintCanvas(){
    if(!this.active)return;const ctx=this.canvas.getContext('2d'),styles=getComputedStyle(this.root),color=name=>styles.getPropertyValue(name).trim();
    const palette={bg:color('--surface-muted'),air:color('--surface'),wall:color('--part-wall'),line:color('--part-grid'),entry:color('--success'),exit:color('--accent'),wallStart:color('--warning'),ink:color('--on-accent'),danger:color('--danger'),solid:color('--inverse')};
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle=palette.bg;ctx.fillRect(0,0,this.viewWidth,this.viewHeight);
    ctx.save();ctx.translate(this.camera.x,this.camera.y);const s=this.camera.scale;
    for(let y=0;y<this.draft.grid.length;y++)for(let x=0;x<this.draft.grid[y].length;x++){
      if(x*s+this.camera.x>this.viewWidth||(x+1)*s+this.camera.x<0||y*s+this.camera.y>this.viewHeight||(y+1)*s+this.camera.y<0)continue;
      ctx.fillStyle=this.draft.grid[y][x]==='а'?palette.wall:palette.air;ctx.fillRect(x*s,y*s,s,s);
      if(this.draft.grid[y][x]!=='а'){ctx.strokeStyle=palette.line;ctx.lineWidth=.65;ctx.strokeRect(x*s,y*s,s,s);}
    }
    for(const object of this.draft.objects||[])this.drawObject(ctx,object,s,palette);
    if(this.pendingObject){const start=this.pendingObject.cell,hover=this.hoverCell;ctx.strokeStyle=palette.exit;ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(start.x*s+1,start.y*s+1,s-2,s-2);if(hover&&this.inGrid(hover)){ctx.strokeStyle=this.pendingObject.type==='laser'&&start.x!==hover.x&&start.y!==hover.y?palette.danger:palette.exit;ctx.beginPath();ctx.moveTo((start.x+.5)*s,(start.y+.5)*s);ctx.lineTo((hover.x+.5)*s,(hover.y+.5)*s);ctx.stroke();ctx.strokeRect(hover.x*s+1,hover.y*s+1,s-2,s-2);}ctx.setLineDash([]);}
    for(const key of ['entry','exit','wallStart']){
      const marker=this.draft[key];if(!marker)continue;const cells=key==='wallStart'?[marker]:getPortCells(marker);
      ctx.fillStyle=palette[key];ctx.globalAlpha=.19;for(const cell of cells)ctx.fillRect(cell.x*s,cell.y*s,s,s);ctx.globalAlpha=1;
      ctx.strokeStyle=palette[key];ctx.lineWidth=Math.max(1.5,s*.06);for(const cell of cells)ctx.strokeRect(cell.x*s+1,cell.y*s+1,s-2,s-2);
      const cx=(marker.x+.5)*s,cy=(marker.y+.5)*s;ctx.save();ctx.translate(cx,cy);
      // Entry faces into the part; an exit faces outward; the wall faces its direction of travel.
      const angle=DIRECTIONS[marker.direction||marker.side]?.angle||0;ctx.rotate(angle+(key==='entry'?Math.PI:0));ctx.strokeStyle=palette[key];ctx.lineWidth=Math.max(1.5,s*.075);ctx.beginPath();ctx.moveTo(-s*.28,0);ctx.lineTo(s*.28,0);ctx.moveTo(s*.06,-s*.2);ctx.lineTo(s*.28,0);ctx.lineTo(s*.06,s*.2);ctx.stroke();ctx.restore();
      if(s>=18){ctx.fillStyle=palette[key];ctx.font=`700 ${Math.max(9,Math.min(13,s*.32))}px system-ui`;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(key==='entry'?'Н':key==='exit'?'К':'║',marker.x*s+s*.06,marker.y*s+s*.03);}
    }
    if(document.activeElement===this.canvas){const {x,y}=this.keyboardCell;ctx.strokeStyle=color('--text');ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(x*s+2,y*s+2,s-4,s-4);ctx.setLineDash([]);}
    ctx.restore();
  }
}
