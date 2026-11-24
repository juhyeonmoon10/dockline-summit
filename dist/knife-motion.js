import { KNIFE_TIMING } from './knife-types.js';

const rest=Object.freeze({x:0,y:0,z:0,rx:0,ry:0,rz:0,turn:0,grip:0});
export function knifeWristPose(skin,draw,slash,step=0,walk=0,swayX=0){
  const flip=skin==='balisong';
  return {
    x:(flip?.123:.14)+draw.x*(flip?1:1.19)+slash.x*.88+Math.sin(step)*.006*walk-swayX,
    y:(flip?-.095:-.10)+draw.y+slash.y*.84-Math.abs(Math.cos(step))*.005*walk,
    z:(flip?-.435:-.453)+draw.z+slash.z*.80,
    rx:(flip?-.06:.30)+draw.rx+slash.rx*.85,ry:(flip?-.23:-.40)+draw.ry+slash.ry*.89,
    rz:(flip?.72:.60)+draw.rz+slash.rz*.93
  };
}
// The grip runs from the index ring across the curled fingers. Only the
// released fingers allow the blade to tip out of this plane during a spin.
export function karambitGripRotation(turn=0,release=0){
  return {rx:.855-.42*release,ry:.127,rz:-1.209+turn};
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

// Lift the ring into view, roll once, then cushion the catch with the wrist.
const hookDraw=createKnifeGesture([
  [0,.016,-.145,-.12,-.49,.10,-.65,-6.12,.76],
  [.060,-.013,-.061,-.139,-.33,.23,-.25,-5.25,.98],
  [.124,-.086,.043,-.16,.13,.49,.29,-3.00,1],
  [.194,-.121,.081,-.15,.23,.46,.59,-.64,.78],
  [KNIFE_TIMING.karambit.drawCatch,-.087,.071,-.084,.17,.30,.36,.085,.025],
  [.295,-.054,.047,-.048,.10,.17,.15,.026,0],
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
  [start,[.022,-.117,.0514,-.10,-.10,.24,-.64],[.044,-.1336,.1133,-.13,-.17,.42,-.92],
    [.100,-.2424,-.0968,-.104,-.244,.318,-.234],
    [.171,-.4391,-.1413,-.092,-.24,.31,-.19],[.215,-.3642,-.1352,-.075,-.13,.16,-.04],
    [.307,-.2278,-.0976,-.061,.11,.08,.17],[.385,-.1241,-.0802,-.038,.09,.055,.14],
    [.475,0,0,0,0,0,0]],
  [start,[.044,-.3116,-.2955,-.075,-.68,-.13,.04],[.075,-.6519,-.2047,-.12,-.92,.37,-.82],
    [.100,-.4775,.0034,-.11,-1.12,.87,-1.25],
    [.158,-.2059,.1491,-.075,-.91,.87,-1.50],[.202,-.1625,.183,-.085,-.83,.87,-1.56],
    [.286,-.1942,.1827,-.095,-1,.50,-2.10],[.377,-.2785,.0054,-.08,-.75,.24,-1.45],
    [.475,0,0,0,0,0,0]]
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
export const karambitVisualDuration=.8;
// First person follows the blade through contact, keeps the wrist on the
// exit side for the next input, then relaxes if no second cut arrives.
const karambitCuts=[
  [start,[.033,.0882,-.0185,-.040,-.31,.11,.07],
    [.068,.1258,-.0379,-.093,-.29,-.05,.30],
    [.100,.0726,-.1055,-.128,-.16,-.39,.69],
    [.176,-.259,-.1306,-.133,-.26,-.57,1.57],
    [.246,-.280,-.1245,-.112,-.32,-.54,1.75],
    [.363,-.1827,-.0757,-.090,-.39,-.40,1.68],
    [.484,-.1313,-.0938,-.079,-.39,-.34,1.48],
    [.567,-.125,-.0953,-.082,-.38,-.34,1.44],
    [.665,.0128,-.1939,-.084,-.34,-.22,1.05],
    [.731,.1029,-.1408,-.050,-.16,-.06,.51],
    [karambitVisualDuration,0,0,0,0,0,0]],
  [start,[.034,-.0945,-.2031,-.085,-.54,.16,.76],
    [.053,-.2135,-.2418,-.123,-.64,.12,.78],
    [.100,-.389,-.0722,-.132,-.58,.55,-.79],
    [.173,-.1758,.1691,-.122,-.48,.68,-1.57],
    [.238,-.1621,.2183,-.101,-.46,.61,-1.65],
    [.375,-.1862,.1616,-.080,-.35,.47,-1.29],
    [.500,-.1661,.0717,-.052,-.29,.31,-.87],
    [.571,-.1581,.0636,-.049,-.28,.28,-.82],
    [.685,-.1078,.0077,-.034,-.21,.18,-.52],
    [karambitVisualDuration,0,0,0,0,0,0]]
].map(createKnifeGesture);

export function previousKarambitAge(previous,skin,side,eventAt){
  if(skin!=='karambit'||previous?.skin!==skin||previous.side!==-side)return Infinity;
  const gap=eventAt-previous.eventAt;
  return gap>0&&gap<karambitVisualDuration?gap:Infinity;
}

export function karambitAttackPose(age,side,previousAge=Infinity){
  const index=side<0?1:0,pose=sampleKnifeGesture(karambitCuts[index],age);
  // Keep position and velocity from the outgoing wrist at the interrupt.
  // The transition ends before contact, including on a late or isolated input.
  const blendTime=Math.min(.086,karambitVisualDuration-previousAge);
  if(!(age>=0&&age<blendTime))return pose;
  const previous=sampleKnifeGesture(karambitCuts[1-index],previousAge+age);
  const weight=1-ease(age/blendTime);
  for(const axis of ['x','y','z','rx','ry','rz'])pose[axis]+=(previous[axis]-pose[axis])*weight;
  return pose;
}
