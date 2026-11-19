export const GENERATION_OPTIONS=Object.freeze([
  {key:'laser',label:'Лазеры',types:['laser']},
  {key:'portal',label:'Телепорты',types:['portal']},
  {key:'spinner',label:'Вращающиеся лопасти',types:['spinner']},
  {key:'press',label:'Прессы',types:['press']},
  {key:'bumper',label:'Отбойники',types:['bumper']},
  {key:'conveyor',label:'Конвейеры',types:['conveyor']},
  {key:'boost',label:'Ускорители',types:['boost']},
  {key:'slow',label:'Замедлители',types:['slow']},
  {key:'resize',label:'Изменение размера',types:['resize']},
  {key:'breakables',label:'Разрушаемые препятствия',types:['breakable-color-block','breakable-block','breakable-color-wall','breakable-wall']},
].map(option=>Object.freeze({...option,types:Object.freeze(option.types)})));

export function defaultGenerationOptions(){return Object.fromEntries(GENERATION_OPTIONS.map(({key})=>[key,true]));}

export function normalizeGenerationOptions(input){
  const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return Object.fromEntries(GENERATION_OPTIONS.map(({key})=>[key,Object.hasOwn(source,key)&&typeof source[key]==='boolean'?source[key]:true]));
}

export function filterRandomMechanisms(mechanisms,options){
  const normalized=normalizeGenerationOptions(options),disabled=new Set(GENERATION_OPTIONS.filter(({key})=>!normalized[key]).flatMap(({types})=>types));
  return mechanisms.filter(mechanism=>mechanism.authored||!disabled.has(mechanism.type));
}
