// Camera-space choreography for the held models in both match renderers.
// Side-on holds give the eye time to read the surfaces between wrist movements.
const guns = {
  rifle:    {duration:3.4, depth:.62, center:.16, tilt:.06},
  smg:      {duration:3.0, depth:.49, center:.12, tilt:.11},
  burst:    {duration:3.4, depth:.66, center:.17, tilt:.11},
  shotgun:  {duration:3.5, depth:.69, center:.18, tilt:.16},
  sniper:   {duration:3.8, depth:.84, center:.28, tilt:.13},
  marksman: {duration:3.7, depth:.78, center:.23, tilt:.10},
  lmg:      {duration:3.65,depth:.75, center:.20, tilt:.08},
  pistol:   {duration:2.95,depth:.36, center:.085,tilt:.16}
};

export function inspectDuration(id) {
  return id==='balisong' ? 3.25 : id==='karambit'||id==='knife' ? 3 : guns[id]?.duration||0;
}

// Each key is time, x, y, z, pitch, yaw and roll in the camera frame.
const karambit = [
  [0,.17,-.16,-.47,-.18,-.25,.38], [.11,.015,.035,-.77,.02,-.13,.16],
  [.22,.005,.036,-.91,.07,.08,.23], [.35,.010,.041,-.85,.09,.16,.35],
  [.46,.040,-.077,-.48,.06,.36,1.14],
  [.61,.10,-.049,-.46,-.06,1.76,.72], [.76,.10,-.054,-.47,-.04,2.34,.52],
  [.86,.11,-.065,-.48,.12,2.22,.45], [1,.18,-.17,-.47,-.18,-.25,.38]
];
const balisong = [
  [0,.19,-.18,-.50,-.16,-.18,.38], [.11,.05,-.045,-.57,-.12,-.20,.52],
  [.23,.07,-.005,-.58,.12,.34,-.30], [.36,.07,-.040,-.58,-.03,-.42,.42],
  [.49,.03,-.015,-.58,.13,.20,-.30], [.64,.02,-.035,-.57,.05,.49,.66],
  [.78,.05,-.03,-.53,-.12,1.20,.86], [.88,.08,-.055,-.51,-.08,.87,.67],
  [1,.19,-.18,-.50,-.16,-.18,.38]
];
const gunKeys = [
  [0,.78,-.17,.85,.02,.02,-.03], [.16,1,-.110,1,.16,1.13,-.35],
  [.36,.97,-.096,.98,.20,1.25,-.34], [.47,.72,-.070,1.02,.25,.82,-.62],
  [.60,-.52,-.095,1.02,.28,-.75,-.42], [.73,-.81,-.094,1,.17,-1.18,-.18],
  [.84,-.80,-.092,.99,.16,-1.22,-.17], [1,.66,-.17,.90,.02,.02,-.03]
];
const smooth=t=>t*t*(3-2*t);

export function inspectionPose(id,age) {
  const duration=inspectDuration(id);
  if(!(age>0&&age<duration))return null;
  const t=age/duration,gun=guns[id];
  const keys=gun ? gunKeys : id==='balisong' ? balisong : karambit;
  let end=1;
  while(keys[end][0]<t)end++;
  const a=keys[end-1],b=keys[end],f=smooth((t-a[0])/(b[0]-a[0]));
  const mix=i=>a[i]+(b[i]-a[i])*f;
  const weight=smooth(Math.min(1,t/.15,(1-t)/.15));
  const release=id==='pistol'?.03:.36;
  const freeHand=gun?smooth(Math.max(0,Math.min(1,(t-release)/.13,(1-t)/.09))):0;
  return {weight,freeHand,x:mix(1)*(gun?gun.center:1),y:mix(2)+(gun ? .075 : 0),z:mix(3)*(gun?-gun.depth:1),
    rx:mix(4)+(gun?gun.tilt:0),ry:mix(5),rz:mix(6)};
}

export function ringFlourish(age) {
  if(!(age>0&&age<1.35))return null;
  const ease=number=>smooth(Math.max(0,Math.min(1,number)));
  return {
    grip:ease((age-.08)/.24)*ease((1.35-age)/.28),
    turn:-Math.PI*2*ease((age-.34)/.68)
  };
}

export function applyInspection(rig,pose) {
  if(!pose)return;
  const {weight:w}=pose,p=rig.position,r=rig.rotation;
  p.set(p.x+(pose.x-p.x)*w,p.y+(pose.y-p.y)*w,p.z+(pose.z-p.z)*w);
  r.set(r.x+(pose.rx-r.x)*w,r.y+(pose.ry-r.y)*w,r.z+(pose.rz-r.z)*w);
}
