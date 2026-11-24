import { KNIFE_TIMING } from './knife-types.js';
import { createKnifeGesture,sampleKnifeGesture } from './knife-motion.js';

// Distances are camera-space metres. Each firearm stays nose-left as its stock
// rolls on the shoulder. The long holds give the receiver and sights time to read.
const guns={
  rifle:    {duration:3.9, depth:.68, x:.164, lift:.26, face:1.20, reveal:.79, cant:1.10},
  smg:      {duration:3.1, depth:.562,x:.054, lift:.34, face:1.10, reveal:.47, cant:1.24},
  burst:    {duration:3.65,depth:.70, x:.036, lift:.31, face:1.14, reveal:.68, cant:.97},
  shotgun:  {duration:3.85,depth:.69, x:.136, lift:.14, face:1.18, reveal:.83, cant:1.24},
  sniper:   {duration:4.35,depth:.87, x:.193, lift:.24, face:1.03, reveal:.79, cant:.71},
  marksman: {duration:4.05,depth:.81, x:.135, lift:.28, face:1.09, reveal:.71, cant:.88},
  lmg:      {duration:4.3, depth:.79, x:.163, lift:.12, face:1.07, reveal:.89, cant:.72},
  pistol:   {duration:3.15,depth:.419,x:.061, lift:.39, face:1.20, reveal:.43, cant:1.69},
  revolver: {duration:3.50,depth:.462,x:.107, lift:.26, face:1.21, reveal:.49, cant:1.47}
};
export function inspectDuration(id){
  return id==='balisong'?KNIFE_TIMING.balisong.inspect:id==='karambit'||id==='knife'?KNIFE_TIMING.karambit.inspect:guns[id]?.duration||0;
}
const smooth=x=>x*x*(3-2*x);
const ease=x=>smooth(Math.min(1,Math.max(0,x)));
const blend=(a,b,t)=>a+(b-a)*t;

// Camera-space wrist keys: seconds, x/y/z, and pitch/yaw/roll. The
// blade, hinge, and the individual fingers are driven separately.
// Lift from the right, carry both rotations across an open palm, then hold the broadside.
const hook=createKnifeGesture([
  [0,.140,-.100,-.453,.30,-.40,.60],[.115,.113,-.112,-.505,.15,-.46,.12],
  [.228,.078,-.064,-.62,-.22,-.24,-.35],[.360,.020,-.032,-.70,-.39,.16,-.65],
  [.515,-.058,.013,-.70,-.24,.24,-.81],[.655,-.070,-.024,-.71,-.28,.12,-.54],
  [.812,-.053,-.032,-.69,-.45,.12,-.34],[.942,-.009,.005,-.645,-.25,.03,-.02],
  [KNIFE_TIMING.karambit.inspectCatch,.035,.012,-.61,.20,-.28,.49],
  [1.13,.025,-.010,-.62,.11,-.18,.33],[1.43,.036,-.004,-.59,.16,-.34,.26],
  [1.54,.058,-.014,-.56,.18,-.39,.29],[KNIFE_TIMING.karambit.inspect,.140,-.100,-.453,.30,-.40,.60]
]);
const butterfly=createKnifeGesture([
  [0,.123,-.095,-.435,-.06,-.23,.72],[.088,.144,-.046,-.470,-.14,-.33,.85],
  [.233,.039,.046,-.583,.27,.22,-.64],[.334,-.104,.037,-.594,.13,.18,-.12],
  [KNIFE_TIMING.balisong.inspectFold,-.153,-.026,-.566,.13,.14,.15],[.558,-.144,-.034,-.561,.11,.12,.16],
  [.726,-.080,.019,-.605,.20,.22,-.58],[.833,.026,.062,-.600,.10,.14,.44],
  [KNIFE_TIMING.balisong.inspectOpen,.128,.021,-.544,.20,.26,.51],
  [1.102,.128,.008,-.533,.17,.24,.48],
  [KNIFE_TIMING.balisong.inspect,.123,-.095,-.435,-.06,-.23,.72]
]);
export function inspectionPose(id,age) {
  const duration=inspectDuration(id);if(!(age>0&&age<duration))return null;
  const t=age/duration,gun=guns[id];
  if(!gun)return {...sampleKnifeGesture(id==='balisong'?butterfly:hook,age),weight:ease(Math.min(age/.040,(duration-age)/.065)),freeHand:0};
  const weight=ease(Math.min(t/.112,(1-t)/.125));
  const roll=ease((t-.502)/.124),fall=ease((t-.875)/.071);
  const settle=Math.sin(Math.PI*ease((t-.112)/.074));
  const settleRoll=Math.sin(Math.PI*ease((t-.625)/.065));
  const breathe=Math.sin(t*Math.PI*2.4)*.006;
  return {
    weight,freeHand:id==='pistol'||id==='revolver'?ease(Math.min(t/.12,(1-t)/.10)):0,
    x:gun.x+.030*roll+.036*fall+.008*settle,
    y:-.047+.017*roll-.067*fall+.012*settle+breathe,
    z:-gun.depth+.050*roll+.04*fall,
    rx:blend(gun.lift,-.035,roll)+.046*settle-.10*fall,
    ry:blend(gun.face,gun.reveal,roll)+.032*settle-.18*fall,
    rz:blend(-.38,gun.cant,roll)+.12*settleRoll-.22*fall
  };
}
// Keep the angle unwrapped. The index stays in the ring through both passes and
// the fingers close once, at the same instant as the catch sound.
const ringRoll=createKnifeGesture([
  [0,0,0],[.112,.32,.12],[.200,.12,.78],[.325,-1.90,1],
  [.460,-4.89,1],[.545,-6.35,.87],[.630,-7.33,.95],
  [.820,-10.32,1],[.951,-12.30,.67],[KNIFE_TIMING.karambit.inspectCatch,-Math.PI*4-.095,0],
  [1.135,-Math.PI*4,0],[KNIFE_TIMING.karambit.inspect,-Math.PI*4,0]
].map(([time,turn,grip])=>[time,0,0,0,0,0,0,turn,grip]));
export function ringFlourish(age) {
  if(!(age>0&&age<KNIFE_TIMING.karambit.inspect))return null;
  const {turn,grip}=sampleKnifeGesture(ringRoll,age);
  return {turn,grip};
}

export function applyInspection(rig,pose) {
  if(!pose)return;
  const {weight:w}=pose,p=rig.position,r=rig.rotation;
  p.set(p.x+(pose.x-p.x)*w,p.y+(pose.y-p.y)*w,p.z+(pose.z-p.z)*w);
  r.set(r.x+(pose.rx-r.x)*w,r.y+(pose.ry-r.y)*w,r.z+(pose.rz-r.z)*w);
}
