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
  return id==='balisong'?3.65:id==='karambit'||id==='knife'?3.10:guns[id]?.duration||0;
}
const smooth=x=>x*x*(3-2*x);
const ease=x=>smooth(Math.min(1,Math.max(0,x)));
const blend=(a,b,t)=>a+(b-a)*t;

// Camera-space wrist keys: normalized time, x/y/z, and pitch/yaw/roll. The
// blade, hinge, and the individual fingers are driven separately.
const hook=[
  [0,.014,-.080,-.453,-.06,.24,-.12], [.052,.053,-.113,-.451,-.22,-.09,-.40],
  [.122,.054,-.028,-.555,.06,.24,.23], [.207,.043,-.019,-.585,.11,.30,.35],
  [.274,.025,-.022,-.525,.17,.36,.54], [.34,.016,-.029,-.472,.19,.54,.72],
  [.66,.023,-.058,-.50,.09,.56,.55], [.725,.029,-.064,-.484,.08,.83,.57],
  [.85,.033,-.069,-.481,.075,.89,.61], [.92,.067,-.111,-.467,-.13,.45,.19],
  [.966,.043,-.098,-.451,-.09,.18,-.17], [1,.014,-.080,-.453,-.06,.24,-.12]
];
const butterfly=[
  [0,.123,-.095,-.435,-.06,-.23,.72], [.055,.137,-.111,-.441,-.23,-.37,.86],
  [.13,.065,-.039,-.487,.20,.08,.36], [.197,.051,-.018,-.521,.32,.31,-.25],
  [.28,.075,-.063,-.510,-.14,.24,.73], [.36,.057,-.039,-.515,.11,-.18,-.15],
  [.42,.071,-.035,-.480,.19,.05,.03], [.485,.078,-.038,-.477,.22,.12,.06],
  [.56,.045,-.023,-.533,.21,.17,-.58], [.64,.076,-.035,-.520,-.12,-.15,.68],
  [.733,.054,-.024,-.488,.20,.17,.22], [.77,.051,-.033,-.468,.18,.25,.39],
  [.895,.052,-.040,-.465,.17,.34,.47], [.952,.139,-.112,-.401,-.19,-.21,.88],
  [1,.123,-.095,-.435,-.06,-.23,.72]
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
  if(!gun)return {...wristPose(id==='balisong'?butterfly:hook,t),weight:ease(Math.min(t/.055,(1-t)/.065)),freeHand:0};
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
  if(!(age>0&&age<1.07))return null;
  const grip=ease((age-.075)/.146)*ease((1.07-age)/.176);
  // Brief anticipation, a fast index-led turn, and a small catch overshoot.
  const turn=.24*ease((age-.035)/.14)-(2*Math.PI+.24)*ease((age-.18)/.51)
    -.095*Math.sin(Math.PI*ease((age-.685)/.148));
  return {grip,turn};
}

export function applyInspection(rig,pose) {
  if(!pose)return;
  const {weight:w}=pose,p=rig.position,r=rig.rotation;
  p.set(p.x+(pose.x-p.x)*w,p.y+(pose.y-p.y)*w,p.z+(pose.z-p.z)*w);
  r.set(r.x+(pose.rx-r.x)*w,r.y+(pose.ry-r.y)*w,r.z+(pose.rz-r.z)*w);
}
