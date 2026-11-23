import { KNIFE_TIMING } from './knife-types.js';

const rest=Object.freeze({x:0,y:0,z:0,rx:0,ry:0,rz:0,turn:0,grip:0});
export function knifeWristPose(skin,draw,slash,step=0,walk=0,swayX=0){
  const flip=skin==='balisong';
  return {
    x:(flip?.123:.014)+draw.x+slash.x*.88+Math.sin(step)*.006*walk-swayX,
    y:(flip?-.095:-.080)+draw.y+slash.y*.84-Math.abs(Math.cos(step))*.005*walk,
    z:(flip?-.435:-.453)+draw.z+slash.z*.80,
    rx:-.06+draw.rx+slash.rx*.85,ry:(flip?-.23:.24)+draw.ry+slash.ry*.89,
    rz:(flip?.72:-.12)+draw.rz+slash.rz*.93
  };
}
const clamp01=x=>Math.min(1,Math.max(0,x));
const ease=x=>{const t=clamp01(x);return t*t*(3-2*t);};
// Camera-space translation and rotation deltas; the last two optional columns
// are the index ring's unwrapped angle and the release of the other fingers.
export function sampleKnifeGesture({keys,tangents},age){
  if(!(age>=0&&age<keys.at(-1)[0]))return rest;
  let i=1;while(age>keys[i][0])i++;
  const a=keys[i-1],b=keys[i],span=b[0]-a[0],t=(age-a[0])/span,f=ease(t);
  const lerp=k=>{
    const value=(a[k]||0)+((b[k]||0)-(a[k]||0))*f;
    return value+span*t*(1-t)*((1-t)*tangents[i-1][k]-t*tangents[i][k]);
  };
  return {x:lerp(1),y:lerp(2),z:lerp(3),rx:lerp(4),ry:lerp(5),rz:lerp(6),turn:lerp(7),grip:lerp(8)};
}

// Preserve velocity through intermediate keys. A channel eases to a stop
// only at its actual extrema, including the catch at the end of a flourish.
export function createKnifeGesture(keys){
  const tangents=keys.map((key,i)=>Array.from({length:9},(_,k)=>{
    if(!k||i===0||i===keys.length-1)return 0;
    const prev=keys[i-1],next=keys[i+1],value=key[k]??0;
    const a=(value-(prev[k]??0))/(key[0]-prev[0]),b=((next[k]??0)-value)/(next[0]-key[0]);
    return a*b>0?2*a*b/(a+b):0;
  }));
  return {keys,tangents};
}

const hookDraw=createKnifeGesture([
  [0,.152,-.163,-.025,-.50,-.40,-.82,-4.05,.78],
  [.060,.110,-.045,-.051,-.29,-.20,-.46,-3.20,.94],
  [.132,-.074,.071,-.094,.18,.26,.39,-1.12,.81],
  [KNIFE_TIMING.karambit.drawCatch,-.117,.075,-.066,.19,.33,.52,.063,.04],
  [KNIFE_TIMING.karambit.draw,0,0,0,0,0,0]
]);
const butterflyDraw=createKnifeGesture([
  [0,.145,-.163,-.034,-.38,-.38,-.86,0,.42],
  [.065,.048,-.041,-.070,-.04,-.16,-.47,0,.63],
  [KNIFE_TIMING.balisong.drawBeat,-.166,.077,-.115,.28,.26,-.40,0,.74],
  [.206,-.139,.088,-.122,.24,.32,-.26,0,.65],
  [KNIFE_TIMING.balisong.drawCatch,-.008,.044,-.073,.11,-.13,.42,0,.04],
  [KNIFE_TIMING.balisong.draw,0,0,0,0,0,0]
]);
export const knifeDrawPose=(skin,age)=>sampleKnifeGesture(skin==='balisong'?butterflyDraw:hookDraw,age);

const start=[0,0,0,0,0,0,0];
// The 100 ms key puts the actual tip through the crosshair at the simulated hit.
// Each blade travels past it before returning low to the resting grip.
const hooks=[
  [start,[.040,.042,.118,.010,-.70,.15,-.99],[.100,.011,-.110,-.095,.65,-.85,1.40],
    [.190,-.222,-.006,-.085,.65,-.85,1.63],[.245,-.231,.006,-.058,.65,-.85,1.40],
    [.340,-.191,-.178,-.008,.20,-.85,1.14],[.480,0,0,0,0,0,0]],
  [start,[.053,-.309,-.093,-.022,-.25,-.85,.83],[.078,-.415,.069,-.070,-.50,-.35,-.05],
    [.100,-.249,.228,-.097,-.70,.15,-.91],[.125,-.076,.184,-.090,-.70,.15,-1.10],
    [.184,.118,.151,-.065,-.70,.15,-1.42],[.244,.096,.140,-.050,-.70,.15,-1.42],
    [.338,-.121,.179,-.005,-.70,.15,-1.17],[.480,0,0,0,0,0,0]]
].map(createKnifeGesture);
const butterflies=[
  [start,[.042,.008,.025,-.060,-.29,-.25,-1.60],[.100,.117,.051,-.092,.28,.17,.76],
    [.184,-.268,.036,-.072,.37,.33,1.22],[.250,-.232,.005,-.045,.28,.29,1.16],
    [.346,-.081,-.141,-.015,-.05,.12,.46],[.490,0,0,0,0,0,0]],
  [start,[.044,-.216,.023,-.052,.20,.14,.79],[.100,-.313,-.083,-.175,.09,-.18,-1.54],
    [.193,.060,.030,-.095,-.20,-.53,-1.53],[.261,.056,.023,-.047,-.19,-.46,-1.32],
    [.370,.046,-.071,-.048,-.04,-.13,-.47],[.490,0,0,0,0,0,0]]
].map(createKnifeGesture);
export const knifeAttackDuration=skin=>(skin==='balisong'?butterflies:hooks)[0].keys.at(-1)[0];
// The sampled operator clip reaches full extension at phase .56.
export function knifeClipPhase(age,skin){
  const contact=.10,end=knifeAttackDuration(skin);
  return clamp01(age<contact?.56*age/contact:.56+.44*(age-contact)/(end-contact));
}
export function knifePose(age,side=1,skin='karambit'){
  const pair=skin==='balisong'?butterflies:hooks;
  return sampleKnifeGesture(pair[side<0?1:0],age);
}
