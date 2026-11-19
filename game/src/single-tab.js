export async function claimTab(onLost){
  if(navigator.locks){return new Promise(resolve=>{navigator.locks.request('cube-chaos-active',{ifAvailable:true},async lock=>{resolve(!!lock);if(lock)await new Promise(()=>{});});});}
  const id=crypto.randomUUID(),key='cube-chaos-active';
  const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  const current=read();if(current&&Date.now()-current.time<8000)return false;
  const write=()=>{try{localStorage.setItem(key,JSON.stringify({id,time:Date.now()}));}catch{}};write();
  window.addEventListener('storage',e=>{if(e.key===key&&read()?.id!==id)onLost();});
  setInterval(write,2500);window.addEventListener('pagehide',()=>{if(read()?.id===id)localStorage.removeItem(key);});return true;
}
