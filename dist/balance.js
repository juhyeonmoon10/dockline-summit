// The arena and ray distances use metres. Spread is a cone angle in radians.
export const MAX_HP = 150;
const degree = Math.PI / 180;
const stud = .28;

export const PRIMARY_WEAPONS = Object.freeze(['rifle', 'shotgun', 'sniper', 'smg', 'burst', 'marksman', 'lmg']);
export const isPrimaryWeapon = id => PRIMARY_WEAPONS.includes(id);

export const SECONDARY_WEAPONS = Object.freeze(['pistol', 'revolver']);
export const isSecondaryWeapon = id => SECONDARY_WEAPONS.includes(id);
export const secondaryWeapon = id => isSecondaryWeapon(id) ? id : 'pistol';

// Deal a different set each match, without duplicating equipment across six bot seats.
export function botLoadouts() {
  const first = Math.floor(Math.random() * PRIMARY_WEAPONS.length);
  return (team, seat) => PRIMARY_WEAPONS[(first + team * 3 + seat) % PRIMARY_WEAPONS.length];
}

export const WEAPONS = {
  rifle: {
    callsign:'브레이커', role:'중거리 연사', accent:'#e7bd71', botRange:13,
    id:'rifle', label:'돌격소총', mag:20, reserve:100, damage:12, head:15,
    interval:.10, equip:.65, reload:1.56, spread:degree, aimSpread:.24*degree, moveScale:.90,
    falloff:{start:50*stud, end:200*stud, damage:3, head:4}
  },
  shotgun: {
    callsign:'벌크헤드', role:'근접 산탄', accent:'#e89d78', botRange:5.4,
    id:'shotgun', label:'펌프 산탄총', mag:7, reserve:35, pellets:10, damage:8, head:12,
    interval:.70, equip:.75, reload:.77, shellReload:true, spread:6.5*degree, aimSpread:4.9*degree, moveScale:1,
    falloff:{start:10*stud, end:50*stud, damage:2.5, head:3.7}
  },
  sniper: {
    callsign:'룩아웃', role:'고배율 단발', accent:'#a4b8bc', botRange:20, aimFov:34,
    id:'sniper', label:'저격소총', mag:4, reserve:12, damage:50, head:150,
    interval:1.50, equip:1.15, reload:1.80, emptyReload:2.13, spread:15*degree, aimSpread:0, moveScale:.80
  },
  smg: {
    id:'smg', label:'기관단총', callsign:'스키퍼', role:'기동 속사', accent:'#58d8bd', botRange:7,
    mag:30, reserve:120, damage:9, head:14, interval:.068, equip:.30, reload:1.23,
    spread:1.8*degree, aimSpread:.63*degree, moveScale:1.07, aimFov:63,
    falloff:{start:6, end:24, damage:3, head:5}
  },
  burst: {
    id:'burst', label:'3점사 소총', callsign:'트라이던트', role:'3발 묶음 사격', accent:'#ff8265', botRange:15,
    mag:24, reserve:96, damage:15, head:22, burstCount:3, burstInterval:.075, interval:.35,
    equip:.58, reload:1.71, spread:1.2*degree, aimSpread:.26*degree, moveScale:.91, aimFov:55,
    falloff:{start:14, end:45, damage:6, head:10}
  },
  marksman: {
    id:'marksman', label:'지정사수소총', callsign:'글라스핀', role:'중배율 반자동', accent:'#8dbaff', botRange:22,
    mag:10, reserve:40, damage:31, head:62, semiAuto:true, interval:.31,
    equip:.73, reload:1.82, spread:2.3*degree, aimSpread:.07*degree, moveScale:.86, aimFov:43,
    falloff:{start:28, end:60, damage:19, head:38}
  },
  lmg: {
    id:'lmg', label:'경기관총', callsign:'캐프스턴', role:'대용량 지속 사격', accent:'#f5bd54', botRange:14,
    mag:60, reserve:120, damage:13, head:17, interval:.11, equip:.92, reload:3.12,
    spread:1.85*degree, aimSpread:.60*degree, moveScale:.76, aimFov:57,
    falloff:{start:16, end:49, damage:5, head:7}
  },
  pistol: {
    id:'pistol', label:'권총', mag:13, reserve:91, damage:12, head:15,
    semiAuto:true, interval:.13, equip:.20, reload:1.06, spread:.5*degree, aimSpread:.12*degree, moveScale:1,
    falloff:{start:50*stud, end:125*stud, damage:3, head:4}
  },
  revolver: {
    id:'revolver', label:'리볼버', callsign:'타이드록', role:'6연발 단발', accent:'#d6aa74',
    mag:6, reserve:36, damage:38, head:72, semiAuto:true, interval:.43, equip:.31, reload:1.85,
    spread:1.1*degree, aimSpread:.16*degree, moveScale:.98, aimFov:58,
    falloff:{start:16, end:39, damage:22, head:42}
  },
  knife: {
    id:'knife', label:'전투용 칼', melee:true, mag:null, reserve:null, damage:50, head:50,
    range:1.8, arc:20*degree, windup:.10, interval:.55, equip:.20, reload:0,
    spread:0, aimSpread:0, moveScale:1.05
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
