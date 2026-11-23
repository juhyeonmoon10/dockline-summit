import { KNIFE_TIMING } from './knife-types.js';

// Distances are camera-space metres. Each firearm stays nose-left as its stock
// rolls on the shoulder. The long holds give the receiver and sights time to read.
const guns={
  rifle:    {duration:3.9, depth:.68, x:.164, lift:.26, face:1.20, reveal:.79, cant:1.10},
  smg:      {duration:3.1, depth:.562,x:.115, lift:.34, face:1.10, reveal:.47, cant:1.24},
  burst:    {duration:3.65,depth:.68, x:.159, lift:.31, face:1.14, reveal:.68, cant:.97},
  shotgun:  {duration:3.85,depth:.69, x:.194, lift:.14, face:1.18, reveal:.83, cant:1.24},
  sniper:   {duration:4.35,depth:.87, x:.275, lift:.24, face:1.03, reveal:.79, cant:.71},
  marksman: {duration:4.05,depth:.81, x:.219, lift:.28, face:1.09, reveal:.71, cant:.88},
  lmg:      {duration:4.3, depth:.79, x:.185, lift:.12, face:1.07, reveal:.89, cant:.72},
  pistol:   {duration:3.15,depth:.405,x:.086, lift:.39, face:1.20, reveal:.43, cant:1.69}
};
export function inspectDuration(id){
  return id==='balisong'?KNIFE_TIMING.balisong.inspect:id==='karambit'||id==='knife'?KNIFE_TIMING.karambit.inspect:guns[id]?.duration||0;
}
const smooth=x=>x*x*(3-2*x);
const ease=x=>smooth(Math.min(1,Math.max(0,x)));
const blend=(a,b,t)=>a+(b-a)*t;

// Camera-space wrist keys: seconds, x/y/z, and pitch/yaw/roll. The
// blade, hinge, and the individual fingers are driven separately.
const hook=[
  [0,.014,-.080,-.453,-.06,.24,-.12],[.060,.018,-.094,-.458,-.20,-.14,-.43],
  [.171,.022,-.024,-.524,.09,.17,.13],[.251,.008,-.016,-.576,.16,.28,.31],
  [.440,-.010,-.021,-.596,.12,.19,.15],[.550,.016,-.028,-.556,.18,.40,.52],
  [KNIFE_TIMING.karambit.inspectCatch,.018,-.038,-.506,.22,.55,.64],[.720,.022,-.045,-.497,.14,.48,.50],
  [.853,.020,-.047,-.496,.14,.53,.55],[.989,.043,-.100,-.448,-.17,.32,-.21],
  [1.058,.009,-.071,-.458,-.02,.20,-.07],[KNIFE_TIMING.karambit.inspect,.014,-.080,-.453,-.06,.24,-.12]
];
const butterfly=[
  [0,.123,-.095,-.435,-.06,-.23,.72],[.073,.136,-.085,-.458,-.23,-.35,.87],
  [.14,.077,-.040,-.517,.20,.10,.25],[.237,.047,-.017,-.542,.28,.20,-.44],
  [.319,.079,-.064,-.538,-.16,-.12,.51],[.407,.056,-.032,-.505,.10,.16,.12],
  [KNIFE_TIMING.balisong.inspectFold,.064,-.035,-.483,.21,.10,-.07],[.572,.061,-.040,-.484,.15,.07,-.02],
  [.70,.046,-.023,-.536,.23,.18,-.54],[.802,.075,-.041,-.532,-.13,-.17,.66],
  [KNIFE_TIMING.balisong.inspectOpen,.039,-.030,-.496,.21,.28,.36],[1.023,.051,-.039,-.477,.13,.22,.28],
  [1.132,.053,-.043,-.475,.15,.30,.37],[1.235,.129,-.086,-.460,-.16,-.28,.84],
  [KNIFE_TIMING.balisong.inspect,.123,-.095,-.435,-.06,-.23,.72]
];
function wristPose(frames,t){
  let i=1;while(frames[i][0]<t)i++;
  const a=frames[i-1],b=frames[i],u=ease((t-a[0])/(b[0]-a[0]));
  return {x:blend(a[1],b[1],u),y:blend(a[2],b[2],u),z:blend(a[3],b[3],u),
    rx:blend(a[4],b[4],u),ry:blend(a[5],b[5],u),rz:blend(a[6],b[6],u)};
}
export function inspectionPose(id,age) {
  const duration=inspectDuration(id);if(!(age>0&&age<duration))return null;
  const t=age/duration,gun=guns[id];
  if(!gun)return {...wristPose(id==='balisong'?butterfly:hook,age),weight:ease(Math.min(age/.040,(duration-age)/.065)),freeHand:0};
  const weight=ease(Math.min(t/.112,(1-t)/.125));
  const roll=ease((t-.502)/.124),fall=ease((t-.875)/.071);
  const settle=Math.sin(Math.PI*ease((t-.112)/.074));
  const settleRoll=Math.sin(Math.PI*ease((t-.625)/.065));
  const breathe=Math.sin(t*Math.PI*2.4)*.006;
  return {
    weight,freeHand:id==='pistol'?ease(Math.min(t/.12,(1-t)/.10)):0,
    x:gun.x+.030*roll+.036*fall+.008*settle,
    y:-.047+.017*roll-.067*fall+.012*settle+breathe,
    z:-gun.depth+.050*roll+.04*fall,
    rx:blend(gun.lift,-.035,roll)+.046*settle-.10*fall,
    ry:blend(gun.face,gun.reveal,roll)+.032*settle-.18*fall,
    rz:blend(-.38,gun.cant,roll)+.12*settleRoll-.22*fall
  };
}
export function ringFlourish(age) {
  if(!(age>0&&age<KNIFE_TIMING.karambit.inspect))return null;
  const grip=ease((age-.072)/.122)*ease((KNIFE_TIMING.karambit.inspectCatch-age)/.104);
  const turn=.31*ease((age-.032)/.117)-(2*Math.PI+.31)*ease((age-.174)/.402)
    -.155*Math.sin(Math.PI*ease((age-.576)/.084));
  return {grip,turn};
}

export function applyInspection(rig,pose) {
  if(!pose)return;
  const {weight:w}=pose,p=rig.position,r=rig.rotation;
  p.set(p.x+(pose.x-p.x)*w,p.y+(pose.y-p.y)*w,p.z+(pose.z-p.z)*w);
  r.set(r.x+(pose.rx-r.x)*w,r.y+(pose.ry-r.y)*w,r.z+(pose.rz-r.z)*w);
}
