export function hash(text) { let h=2166136261; for(const c of String(text)) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
export class Random {
  constructor(seed){this.state=typeof seed==='number'?seed>>>0:hash(seed);}
  next(){let t=this.state+=0x6d2b79f5;this.state>>>=0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  int(a,b){return a+Math.floor(this.next()*(b-a+1));}
  pick(items){return items[this.int(0,items.length-1)];}
}
export function newSeed(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0].toString(36).toUpperCase();}
