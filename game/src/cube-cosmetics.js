import {U} from './config.js';
import {hash} from './random.js';

export const SKIN_IDS=Object.freeze(['skin-classic','outline','colored-outline','black-eyes','stripe','round','mad']);
export function normalizeSkinId(id){return id==='classic'||!SKIN_IDS.includes(id)?'skin-classic':id;}
export function darkerColor(color,factor=.78){
  const value=typeof color==='number'?color:Number.parseInt(String(color).replace('#',''),16);
  if(!Number.isFinite(value))return 0x303742;
  const channel=shift=>Math.round(((value>>shift)&255)*factor);
  return (channel(16)<<16)|(channel(8)<<8)|channel(0);
}

// A pure visual hash: it never reads or advances the race PRNG.
export function madEyeAppearance(raceId,cubeId){
  const seed=hash(`${raceId||''}:mad-eyes:${cubeId}`);
  const unit=shift=>((seed>>>shift)&63)/63;
  return [0,1].map(i=>({
    y:(unit(i*6)-.5)*.1,
    width:.23+unit(12+i*6)*.07,
    height:.29+unit(i*6)*.11,
    pupilX:(unit(18-i*6)-.5)*.1,
    pupilY:(unit(6+i*6)-.5)*.07,
    brow:(i?1:-1)*(.025+unit(20-i*4)*.045),
  }));
}

/** Draw only a cube's body and eyes. Number and selection belong to Renderer.
 * x/y and alpha also allow the exact same skin to be drawn as a ghost copy.
 * Every size is visual: the Matter body and cube state are never modified.
 */
export function drawCube(g,cube,skinId='skin-classic',options={}){
  const skin=normalizeSkinId(skinId),size=(cube.size||1)*U;
  const x=options.x||0,y=options.y||0,alpha=Math.max(0,Math.min(1,options.alpha??1));
  const fill=color=>({color,alpha}),stroke=(color,width)=>({color,width,alpha});
  const edge=skin==='outline'?0xffffff:skin==='colored-outline'?darkerColor(cube.color):0x283342;
  const edgeWidth=skin==='outline'||skin==='colored-outline'?Math.max(1.5,size*.065):1;
  if(skin==='round')g.circle(x,y,size/2).fill(fill(cube.color)).stroke(stroke(edge,edgeWidth));
  else g.rect(x-size/2,y-size/2,size,size).fill(fill(cube.color)).stroke(stroke(edge,edgeWidth));
  if(skin==='stripe')for(const row of [-.32,0,.32])g.rect(x-size/2+2,y+row*size-size*.045,size-4,size*.09).fill({color:0x000000,alpha:alpha*.23});
  const mad=skin==='mad'?madEyeAppearance(options.raceId,cube.id):null;
  for(let i=0;i<2;i++){
    const center=x+(i?1:-1)*size*.2;
    const appearance=mad?.[i],width=size*(appearance?.width??.26),height=size*(appearance?.height??.36);
    const top=y-size*.31+size*(appearance?.y??0);
    const eyeColor=skin==='black-eyes'?0x10141b:0xffffff,pupilColor=skin==='black-eyes'?0xffffff:0x202a36;
    g.rect(center-width/2,top,width,height).fill(fill(eyeColor));
    const pupilWidth=size*.11,pupilHeight=Math.min(size*.23,height*.75);
    const px=Math.max(center-width/2+size*.01,Math.min(center+width/2-pupilWidth-size*.01,center-pupilWidth/2+size*(appearance?.pupilX??0)));
    const py=Math.max(top+size*.01,Math.min(top+height-pupilHeight-size*.01,top+height*.2+size*(appearance?.pupilY??0)));
    g.rect(px,py,pupilWidth,pupilHeight).fill(fill(pupilColor));
    if(appearance)g.moveTo(center-width*.55,top-size*.055).lineTo(center+width*.55,top-size*.055+appearance.brow*size).stroke(stroke(0x202a36,Math.max(1,size*.045)));
  }
}
