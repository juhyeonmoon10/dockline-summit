// The arena and ray distances use metres. Spread is a cone angle in radians.
export const MAX_HP = 150;
const degree = Math.PI / 180;
const stud = .28;

export const WEAPONS = {
  rifle: {
    id:'rifle', label:'돌격소총', mag:20, reserve:100, damage:12, head:15,
    interval:.10, equip:.65, reload:1.56, spread:degree, aimSpread:.24*degree, moveScale:.90,
    falloff:{start:50*stud, end:200*stud, damage:3, head:4}
  },
  shotgun: {
    id:'shotgun', label:'펌프 산탄총', mag:7, reserve:35, pellets:10, damage:8, head:12,
    interval:.70, equip:.75, reload:.77, shellReload:true, spread:6.5*degree, aimSpread:4.9*degree, moveScale:1,
    falloff:{start:10*stud, end:50*stud, damage:2.5, head:3.7}
  },
  sniper: {
    id:'sniper', label:'저격소총', mag:4, reserve:12, damage:50, head:150,
    interval:1.50, equip:1.15, reload:1.80, emptyReload:2.13, spread:15*degree, aimSpread:0, moveScale:.80
  },
  pistol: {
    id:'pistol', label:'권총', mag:13, reserve:91, damage:12, head:15,
    interval:.13, equip:.20, reload:1.06, spread:.5*degree, aimSpread:.12*degree, moveScale:1,
    falloff:{start:50*stud, end:125*stud, damage:3, head:4}
  }
};

export function impactDamage(weapon, distance, headshot) {
  const kind = headshot ? 'head' : 'damage';
  const peak = weapon[kind], drop = weapon.falloff;
  if (!drop || distance <= drop.start) return peak;
  if (distance >= drop.end) return drop[kind];
  const progress = (distance - drop.start) / (drop.end - drop.start);
  return peak + (drop[kind] - peak) * progress;
}
