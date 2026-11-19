export const RARITIES={
  free:{label:'Бесплатная',price:0},
  common:{label:'Обычная',price:250},
  rare:{label:'Редкая',price:500},
  epic:{label:'Эпическая',price:1000},
  legendary:{label:'Легендарная',price:2500},
};
const item=(id,category,name,rarityKey,color,description)=>({id,category,name,description,rarityKey,rarity:RARITIES[rarityKey].label,price:RARITIES[rarityKey].price,color,style:rarityKey==='free'?'classic':id});
export const ITEMS=[
  item('classic','theme','Обычная','free','#e5e6e4','Белые поверхности и серые стены.'),
  item('night','theme','Ночь','common','#293039','Тёмная карта и свечение цвета кубиков.'),
  item('paper','theme','Бумажная','rare','#e8dfc8','Текстура бумаги и белые бумажные объекты.'),
  item('neon','theme','Неон','epic','#5540a6','Тёмная трасса со светящимся радужным контуром.'),
  item('skin-classic','skin','Обычная','free','#798dec','Цветной кубик с обычными глазами.'),
  item('outline','skin','Обводка','common','#8296ee','Белая обводка кубика.'),
  item('colored-outline','skin','Цветная обводка','common','#dd8d68','Обводка чуть темнее цвета участника.'),
  item('stripe','skin','Полосатые','common','#dcad58','Полосы на цветной поверхности.'),
  item('black-eyes','skin','Черные глаза','rare','#8b9cb9','Чёрные глаза с белыми зрачками.'),
  item('mad','skin','Безумные','epic','#b589d8','Выразительные глаза и необычная мимика.'),
  item('round','skin','Круглые','legendary','#65b89a','Круглое оформление участника.'),
  item('trail-classic','trail','Обычная','free','#adb7c9','Без дополнительного следа.'),
  item('tail','trail','Хвост','common','#a095e4','Цветной хвост за участником.'),
  item('line','trail','Полоса','rare','#65b8ce','Ровная цветная полоса.'),
  item('ghost','trail','Призраки','epic','#b9b6d5','Полупрозрачные силуэты кубика.'),
  item('fire','trail','Огонь','legendary','#e79045','Огненный след за участником.'),
  item('finish-classic','finish','Обычная','free','#b7bfba','Обычная разметка финиша.'),
  item('silver','finish','Серебряный','epic','#b8c0cb','Серебристое оформление финиша.'),
  item('gold','finish','Золотой финиш','legendary','#dbb654','Золотое оформление финиша.'),
  item('diamond','finish','Алмазный','legendary','#9dd8e8','Голубые алмазные грани.'),
  item('emerald','finish','Изумрудный','legendary','#58bd8b','Зелёные изумрудные грани.'),
  item('ruby','finish','Рубиновый','legendary','#d86c83','Красные рубиновые грани.'),
];
const DEFAULT_EQUIPPED={theme:'classic',skin:'skin-classic',trail:'trail-classic',finish:'finish-classic'};
const ALIASES={blueprint:'paper',candy:'neon',comet:'tail',spark:'ghost',mint:'emerald'};
const canonicalId=id=>typeof id==='string'&&Object.hasOwn(ALIASES,id)?ALIASES[id]:id;
const findItem=id=>ITEMS.find(entry=>entry.id===canonicalId(id));
const ownedIds=profile=>new Set((profile.owned||[]).filter(id=>typeof id==='string').map(canonicalId));

export function getCategoryItems(category){return ITEMS.filter(entry=>entry.category===category).sort((a,b)=>a.price-b.price);}
export function defaultEquipped(){return{...DEFAULT_EQUIPPED};}
export function resolveEquipped(profile){
  const equipped=defaultEquipped(),owned=ownedIds(profile||{});
  for(const category of Object.keys(equipped)){
    const raw=profile?.equipped?.[category],entry=findItem(raw==='classic'?DEFAULT_EQUIPPED[category]:raw);
    if(entry?.category===category&&(!entry.price||owned.has(entry.id)))equipped[category]=entry.id;
  }
  return equipped;
}
// Migration is explicit and detached. Reading an old checksummed payload never
// mutates it, and existing currency or purchase entitlements are never repriced.
export function migrateCatalog(profile){
  const next=structuredClone(profile);next.owned=[...ownedIds(next)];next.equipped=resolveEquipped(next);return next;
}
export function purchase(profile,id){
  const entry=findItem(id);if(!entry||!entry.price||ownedIds(profile).has(entry.id)||!Number.isSafeInteger(profile.coins)||profile.coins<entry.price)return false;
  profile.coins-=entry.price;profile.owned.push(entry.id);return true;
}
export function equip(profile,id){
  const entry=findItem(id);if(!entry||entry.price&&!ownedIds(profile).has(entry.id))return false;
  const equipped=resolveEquipped(profile);profile.equipped={...equipped,[entry.category]:equipped[entry.category]===entry.id?DEFAULT_EQUIPPED[entry.category]:entry.id};return true;
}
