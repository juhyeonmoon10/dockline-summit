// Shared rules for the standalone practice arena and the authoritative room host.
import { MAP, getArena } from './arena-map.js';
import { BODY_RADIUS, walkHeight, support, ceilingAt, intersect, worldHit } from './arena-world.js';
import { nextWaypoint } from './arena-routes.js';
import { tacticalBotInput } from './tactics.js';
import { MAX_HP, WEAPONS, impactDamage, isPrimaryWeapon, secondaryWeapon, botLoadouts } from './balance.js';
import { gunFit } from './gun-fit.js';
import { normalizeKnifeSkin } from './knife-types.js';
export { MAP, MAX_HP, WEAPONS };
export const TEAM_SIZES = Object.freeze([1,2,3]);

const playerMemory = new WeakMap();

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const number = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const primary = id => isPrimaryWeapon(id) ? id : 'rifle';
export const eyeHeight = player => player.slide > 0 ? 1.0 : 1.55;
export const spawnYaw = (player, mapId) => getArena(mapId).spawns[player.team][player.seat % 3].yaw;

function memory(p) {
  if (!playerMemory.has(p)) {
    playerMemory.set(p, { holstered: {}, cooldown: 0, melee:null, nextSwingSide:1, burstLeft:0, semiLatched:false,
      triggerDown:false, bufferedUntil:0, unlimitedAmmo:p.reserve===null&&!WEAPONS[p.active]?.melee,
      slideCooldown: 0, lastSlide: false, lastJump: false, vx: 0, vz: 0, vy: 0, grounded: true });
  }
  return playerMemory.get(p);
}

function resetPlayer(p, map) {
  const start = map.spawns[p.team][p.seat % 3];
  p.x=start.x; p.z=start.z; p.y=start.y??0; p.yaw=start.yaw; p.pitch=0; p.grounded=true;

  p.hp = p.maxHp = MAX_HP; p.alive = true; p.active = p.weapon;
  p.ammo = WEAPONS[p.weapon].mag; p.reserve = WEAPONS[p.weapon].reserve;
  p.ads = false; p.slide = 0; p.reload = 0; p.reloadDuration = 0; p.speed = 0;
  playerMemory.delete(p);
}

function spawnPlayer(fields, map) {
  const p = { ...fields, sidearm:secondaryWeapon(fields.sidearm), knifeSkin:normalizeKnifeSkin(fields.knifeSkin), kills:0, deaths:0, damage:0 };
  resetPlayer(p, map);
  return p;
}

function initialState(map, size, phase, time, players, targets) {
  return { mapId:map.id, size, phase, time, elapsed:0, round:1, score:[0,0],
    winner:null, roundWinner:null, reason:'', players, targets,
    events:[], seq:0, capture:{team:null,progress:0} };
}

export function createRange({ id='local', name='나', weapon='rifle', sidearm, knifeSkin, mapId } = {}) {
  const map = getArena(mapId);
  const player = spawnPlayer({id, name, team:0, seat:0, bot:false, weapon:primary(weapon), sidearm, knifeSkin}, map);
  player.reserve = null; // The range never runs out of practice rounds.
  const targets = map.rangeTargets.map((position, index) => ({
    ...position, kind:'dummy', id:'dummy-'+(index+1), name:'더미 '+(index+1),
    yaw:Math.atan2(player.x-position.x, position.z-player.z),
    hp:MAX_HP, maxHp:MAX_HP, alive:true, respawnAt:0
  }));
  const near = targets[0], dx = near.x-player.x, dz = near.z-player.z;
  player.yaw = Math.atan2(dx,-dz);
  player.pitch = Math.atan2(near.y + 1.14 - player.y - eyeHeight(player),Math.hypot(dx,dz));
  const game = initialState(map,1,'range',0,[player],targets);
  game.range = {shots:0,hits:0,kills:0};
  return game;
}

export function createGame({ size = 2, players = [], warmup = 15, mapId } = {}) {
  const map = getArena(mapId);
  if (!TEAM_SIZES.includes(size)) size = 2;
  const roster = [];
  const botWeapon = botLoadouts();
  const used = new Set();
  const names = [['PIER', 'TUG', 'FERRY'], ['CRANE', 'SKIFF', 'BUOY']];
  for (let team = 0; team < 2; team++) {
    const members = players.filter(p => p.team === team).slice(0, size);
    for (let seat = 0; seat < size; seat++) {
      const source = members[seat];
      let id = String(source?.id ?? `bot-${team}-${seat}`);
      while (used.has(id)) id += '-';
      used.add(id);
      roster.push(spawnPlayer({ id, team, seat, name: String(source?.name ?? names[team][seat]).slice(0, 24),
        bot: source ? Boolean(source.bot) : true, weapon: primary(source?.weapon ?? botWeapon(team,seat)), sidearm:source?.sidearm, knifeSkin:source?.knifeSkin }, map));
    }
  }
  warmup = clamp(number(warmup, 15), 0, 60);
  const targets = warmup ? map.plates.map((plate,team)=>({...plate,team,id:"target-"+team,practice:true,r:.50})) : [];
  if(warmup) for(const p of roster){
    const plate=targets[p.team], dx=plate.x-p.x, dz=plate.z-p.z;
    p.yaw=Math.atan2(dx,-dz);p.pitch=Math.atan2(plate.y-p.y-eyeHeight(p),Math.hypot(dx,dz));
  }
  return initialState(map, size, warmup > 0 ? 'warmup' : 'round', warmup || 40, roster, targets);
}

function emit(g, type, actor, fields = {}) {
  g.events.push({ seq: ++g.seq, type, actor, ...fields });
  if (g.events.length > 40) g.events.splice(0, g.events.length - 40);
}

export function clearBufferedFire(player) {
  const m=playerMemory.get(player);
  if(m){m.bufferedUntil=0;m.triggerDown=false;}
}

function equipWeapon(p, next, now) {
  const m = memory(p);
  m.holstered[p.active] = {ammo:p.ammo, reserve:p.reserve, readyAt:now+Math.max(0,m.cooldown)};
  const gun = WEAPONS[next];
  const stock = m.holstered[next] || {ammo:gun.mag, reserve:m.unlimitedAmmo?null:gun.reserve, readyAt:0};
  p.active = next; p.ammo = stock.ammo; p.reserve = stock.reserve;
  m.cooldown = Math.max(gun.equip,stock.readyAt-now);
  m.melee = null;
  m.burstLeft = 0; m.semiLatched = false; m.bufferedUntil=0;
  p.reload = 0; p.reloadDuration = 0;
}

function changeWeapon(p, id, now) {
  if (primary(id) !== id || id === p.weapon) return;
  p.weapon = id;
  equipWeapon(p,id,now);
}

function changeSlot(p, slot, now) {
  const next = slot === 3 ? 'knife' : slot === 2 ? secondaryWeapon(p.sidearm) : p.weapon;
  if (p.active === next) return;
  equipWeapon(p,next,now);
}

function beginReload(g, p, continuingShells=false) {
  const w = WEAPONS[p.active];
  if (w.melee || p.reload > 0 || p.ammo >= w.mag || p.reserve === 0) return;
  const m=memory(p);m.burstLeft=0;m.bufferedUntil=0;
  p.reloadDuration = p.ammo===0 ? (w.emptyReload ?? w.reload) : w.reload;
  p.reload = p.reloadDuration;
  if(w.shellReload)p.shellLoop=continuingShells;
  emit(g, 'reload', p.id, { weapon: p.active });
}

function advanceReload(g, p, dt, firing) {
  if (!p.reload) return;
  const w = WEAPONS[p.active], remaining = p.reload - dt;
  if (remaining > 1e-8) {
    if (w.shellReload && firing && p.ammo>0) {
      p.reload = 0; p.reloadDuration = 0;
    } else p.reload = remaining;
    return;
  }
  const needed = w.shellReload ? 1 : w.mag-p.ammo;
  const count = Math.min(needed,p.reserve ?? needed);
  p.ammo += count;
  if (p.reserve!==null) p.reserve -= count;
  p.reload = 0; p.reloadDuration = 0;
  if (w.shellReload && !firing && p.ammo<w.mag && p.reserve!==0) {
    beginReload(g,p,true);
    p.reload += remaining; // Carry the unused part of this tick into the next shell.
  }
}

function movePlayer(p, input, dt, map) {
  const m = memory(p);
  const f = clamp(number(input.forward), -1, 1), s = clamp(number(input.strafe), -1, 1);
  const len = Math.max(1, Math.hypot(f, s));
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const dx = (sy * f + cy * s) / len, dz = (-cy * f + sy * s) / len;
  m.slideCooldown = Math.max(0, m.slideCooldown - dt);
  if (input.slide && !m.lastSlide && m.grounded && m.slideCooldown === 0 && (f || s)) {
    p.slide = .52; m.slideCooldown = 1.30;
    const length = Math.hypot(dx, dz); m.slideX = dx / length; m.slideZ = dz / length;
  }
  // Sliding into a jump carries the current speed. Air steering preserves a little momentum.
  if (input.jump && !m.lastJump && m.grounded) { m.vy=7.15; m.grounded=false; p.slide=0; }
  m.lastJump=!!input.jump; m.lastSlide=!!input.slide;
  const rate = (p.ads ? 3.65 : 6.2) * WEAPONS[p.active].moveScale;
  const slideSpeed = 7.7 + 4.1*(p.slide/.52);
  const vx=p.slide>0?m.slideX*slideSpeed:dx*rate, vz=p.slide>0?m.slideZ*slideSpeed:dz*rate;
  const response=1-Math.exp(-dt*(m.grounded?24:3.1));
  m.vx+=(vx-m.vx)*response; m.vz+=(vz-m.vz)*response;
  p.slide=Math.max(0,p.slide-dt);
  const height=p.slide>0?1.23:1.79, step=m.grounded?.26:.022;
  const nextX=p.x+m.vx*dt, nextZ=p.z+m.vz*dt;
  const hx=walkHeight(nextX,p.z,p.y,step,BODY_RADIUS,height,map);
  if(hx!=null){p.x=nextX;p.y=hx;}else m.vx=0;
  const hz=walkHeight(p.x,nextZ,p.y,step,BODY_RADIUS,height,map);
  if(hz!=null){p.z=nextZ;p.y=hz;}else m.vz=0;
  const floor=support(p.x,p.z,p.y+.018,BODY_RADIUS,map);
  const ceiling=ceilingAt(p.x,p.z,p.y+height,BODY_RADIUS,map);
  m.vy-=18.3*dt;
  const nextY=p.y+m.vy*dt;
  if(m.vy>0 && nextY+height>ceiling){p.y=ceiling-height;m.vy=0;m.grounded=false;}
  else if(m.vy<=0 && (nextY<=floor || m.grounded&&p.y-floor<.19)){
    p.y=floor;m.vy=0;m.grounded=true;
  }else{p.y=nextY;m.grounded=false;}
  p.grounded=m.grounded; p.speed=Math.hypot(m.vx,m.vz);
}

function bodyHit(t, x,y,z, dx,dy,dz) {
  if (t.kind==='dummy') {
    // The steel targets have a narrow side profile. Only the bust and head score.
    const c=Math.cos(t.yaw), s=Math.sin(t.yaw), ox=x-t.x, oz=z-t.z;
    const ray=[c*ox+s*oz,y-t.y,-s*ox+c*oz,c*dx+s*dz,dy,-s*dx+c*dz];
    const torso=intersect(...ray,-.24,.63,-.14,.24,1.03,.14);
    const shoulders=intersect(...ray,-.32,1.03,-.14,.32,1.395,.14);
    const head=intersect(...ray,-.2,1.45,-.14,.2,1.805,.14);
    return [Math.min(torso,shoulders),head];
  }
  const h = t.y + eyeHeight(t) - .16;
  const body = intersect(x,y,z,dx,dy,dz, t.x-.33,t.y,t.z-.29, t.x+.33,h,t.z+.29);
  const head = intersect(x,y,z,dx,dy,dz, t.x-.25,h,t.z-.25, t.x+.25,h+.43,t.z+.25);
  return [body,head];
}

function trace(g,p,start,dx,dy,dz,map,limit=100) {
  const {x,y,z}=start;
  let distance = worldHit(x,y,z,dx,dy,dz,limit,map), target = null, headshot = false;
  if (g.phase==='warmup' && Math.abs(dz)>=.0001) {
    for (const plate of g.targets) {
      const t=(plate.z-z)/dz;
      if(t>0 && t<distance && (x+dx*t-plate.x)**2+(y+dy*t-plate.y)**2<=plate.r**2){distance=t;target=plate;}
    }
  }
  const combatants = g.phase==='range' ? g.targets : g.players;
  for (const t of combatants) {
    if (!t.alive || t.team === p.team) continue;
    const [body,head] = bodyHit(t,x,y,z,dx,dy,dz);
    const impact = Math.min(body, head);
    if (impact < distance) { distance = impact; target = t; headshot = head <= body; }
  }
  return { x,y,z, ex:x+dx*distance, ey:y+dy*distance, ez:z+dz*distance, target, headshot, distance };
}

// Grip and shoulder-pivot coordinates from each operator's Index1R and Shoulder
// bones. Use the retracted idle frame and cycle centres for moving stances.
// This keeps the network muzzle stable through breathing and footfalls.
const operatorSockets=[
  {
    idle: [.102,1.134,-.214,1.272,-.027], run: [.106,1.056,-.277,1.199,-.096],
    duck: [.102,.710,-.195,.922,-.099], jump: [.102,.988,-.250,1.126,-.064],
  },
  {
    idle: [.100,1.213,-.242,1.352,-.044], run: [.104,1.127,-.304,1.271,-.113],
    duck: [.100,.772,-.254,.990,-.150], jump: [.100,1.055,-.277,1.193,-.079],
  },
];
export function firingMuzzle(p){
  const sockets=operatorSockets[p.team===1?1:0];
  const stance=p.slide>0?sockets.duck:p.grounded===false?sockets.jump:p.speed>.35?sockets.run:sockets.idle;
  const [handX,handY,handZ,shoulderY,shoulderZ]=stance;
  const fit=gunFit[p.active],pitch=clamp(p.pitch,-.78,.78),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const sniper=p.active==='sniper';
  // The Lookout pitches both arms at the shoulder. Other carried models pitch
  // the gun at the finger mount. ADS only changes the first-person camera.
  const pivotY=sniper?shoulderY:handY+.050,pivotZ=sniper?shoulderZ:handZ;
  const localY=(sniper?handY+.050-shoulderY:0)+.86*fit.muzzleY;
  const localZ=(sniper?handZ-shoulderZ:0)+.86*fit.muzzle;
  const side=handX+.86*fit.muzzleX,z=pivotZ+localY*sp+localZ*cp;
  const sy=Math.sin(p.yaw),cy=Math.cos(p.yaw);
  return {x:p.x+side*cy-z*sy,y:p.y+pivotY+localY*cp-localZ*sp,z:p.z+side*sy+z*cy};
}

function traceVolley(g,p,w,map){
  const eye={x:p.x,y:p.y+eyeHeight(p),z:p.z};
  let start=firingMuzzle(p);
  const ax=start.x-eye.x,ay=start.y-eye.y,az=start.z-eye.z,reach=Math.hypot(ax,ay,az);
  // A barrel pressed through a wall or opponent must hit its near side.
  const obstruction=trace(g,p,eye,ax/reach,ay/reach,az/reach,map,reach);
  const blocked=obstruction.distance<reach-1e-6;
  if(blocked){
    const fraction=Math.max(0,obstruction.distance-.004)/reach;
    start={x:eye.x+ax*fraction,y:eye.y+ay*fraction,z:eye.z+az*fraction};
  }
  const hits=[],spread=p.ads ? w.aimSpread : w.spread;
  for(let i=0;i<(w.pellets||1);i++){
    const angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random())*spread;
    if(blocked){hits.push({...obstruction,...start});continue;}
    const yaw=p.yaw+Math.cos(angle)*radius,pitch=p.pitch+Math.sin(angle)*radius,cp=Math.cos(pitch);
    const sx=Math.sin(yaw)*cp,sy=Math.sin(pitch),sz=-Math.cos(yaw)*cp;
    const aim=trace(g,p,eye,sx,sy,sz,map);
    const dx=aim.ex-start.x,dy=aim.ey-start.y,dz=aim.ez-start.z,length=Math.hypot(dx,dy,dz);
    // A reticle can see a nearby surface alongside the barrel. Once the cap
    // has passed that plane, continue forward instead of firing backwards or
    // pulling the origin into the operator to force a hit.
    if(dx*sx+dy*sy+dz*sz<=.00001)hits.push(trace(g,p,start,sx,sy,sz,map));
    else hits.push(trace(g,p,start,dx/length,dy/length,dz/length,map,length+.00001));
  }
  return {hits,blocked};
}

function shoot(g, p, map) {
  if (!p.ammo) { beginReload(g,p); return; }
  const w = WEAPONS[p.active], m = memory(p);
  if(w.burstCount && !m.burstLeft) m.burstLeft=Math.min(w.burstCount,p.ammo);
  p.ammo--;
  if (m.burstLeft) m.burstLeft--;
  if (w.semiAuto) m.semiLatched=true;
  // Carry the fraction of a tick past the deadline so a held trigger keeps its rate.
  m.cooldown = (m.burstLeft ? w.burstInterval : w.interval) + Math.min(0,m.cooldown);
  const total = new Map(), pellets = p.active==='shotgun' ? [] : null;
  let central;
  const {hits,blocked}=traceVolley(g,p,w,map);
  for (const hit of hits) {
    if(pellets)pellets.push({ex:hit.ex,ey:hit.ey,ez:hit.ez,target:hit.target?.id||null});
    if (!central || (hit.target && !central.target)) central = hit;
    if (!hit.target) continue;
    const old = total.get(hit.target) || { damage: 0, headshot: false };
    // Range balance is measured from the player, independent of barrel length.
    const range=Math.hypot(hit.ex-p.x,hit.ey-p.y-eyeHeight(p),hit.ez-p.z);
    old.damage += impactDamage(w,range,hit.headshot); old.headshot ||= hit.headshot;
    total.set(hit.target, old);
  }
  const {x,y,z,ex,ey,ez} = central;
  emit(g,'shot',p.id,{weapon:p.active,x,y,z,ex,ey,ez,...(blocked?{blocked:true}:{}),...(pellets?{pellets,at:g.elapsed}:{})});
  if (g.phase==='range') {
    g.range.shots++;
    if (total.size) g.range.hits++;
  }
  for (const [t,h] of total) applyHit(g,p,t,h.damage,h.headshot);
}

function applyHit(g,p,t,amount,headshot=false) {
  if(t.practice) { emit(g,'hit',p.id,{target:t.id,damage:0,headshot:false,weapon:p.active}); return; }
  const damage = Math.min(t.hp,Math.round(amount*100)/100);
  emit(g,'hit',p.id,{target:t.id,damage,headshot,weapon:p.active});
  if (g.phase === 'warmup') return;
  t.hp = Math.round((t.hp-damage)*100)/100;
  p.damage = Math.round((p.damage+damage)*100)/100;
  if (t.hp > 0) return;
  t.alive = false; p.kills++;
  if (t.kind==='dummy') {
    t.respawnAt = g.elapsed + 1.5;g.range.kills++;
  } else {
    t.ads = false;t.slide = 0;t.speed = 0;t.reload = 0;t.reloadDuration = 0;t.deaths++;
    memory(t).melee=null;
  }
  emit(g,'kill',p.id,{target:t.id,headshot,weapon:p.active});
}

function beginMelee(g,p) {
  const w=WEAPONS[p.active],m=memory(p);
  m.cooldown=w.interval+Math.min(0,m.cooldown);
  m.melee={at:g.elapsed+w.windup};
  emit(g,'melee',p.id,{weapon:p.active,knifeSkin:p.knifeSkin,x:p.x,y:p.y+eyeHeight(p),z:p.z,at:g.elapsed,side:m.nextSwingSide});
  m.nextSwingSide=-m.nextSwingSide;
  if(g.phase==='range')g.range.shots++;
}

function meleeContact(g,p,map) {
  const w=WEAPONS.knife,x=p.x,y=p.y+eyeHeight(p),z=p.z,cp=Math.cos(p.pitch);
  const forward=[Math.sin(p.yaw)*cp,Math.sin(p.pitch),-Math.cos(p.yaw)*cp],cone=Math.cos(w.arc);
  let nearest=null;
  const targets=g.phase==='range'?g.targets:g.phase==='warmup'?[...g.players,...g.targets]:g.players;
  for(const target of targets) {
    if(target===p||(!target.practice&&!target.alive)||(!target.practice&&target.team===p.team))continue;
    const heights=target.practice?[0]:target.kind==='dummy'?[.83,1.21,1.63]:[.55,1.05,eyeHeight(target)+.05];
    for(const height of heights) {
      const vx=target.x-x,vy=target.y+height-y,vz=target.z-z,length=Math.hypot(vx,vy,vz);
      if(length<.001||length>w.range+.5)continue;
      const dx=vx/length,dy=vy/length,dz=vz/length;
      if(dx*forward[0]+dy*forward[1]+dz*forward[2]<cone)continue;
      const distance=target.practice?length:Math.min(...bodyHit(target,x,y,z,dx,dy,dz));
      if(distance>w.range||distance<0||distance>=(nearest?.distance??Infinity))continue;
      if(worldHit(x,y,z,dx,dy,dz,distance+.001,map)<distance-.001)continue;
      nearest={x,y,z,ex:x+dx*distance,ey:y+dy*distance,ez:z+dz*distance,distance,target};
    }
  }
  if(nearest)return nearest;
  const distance=worldHit(x,y,z,...forward,w.range,map);
  if(distance<w.range-.001)return {x,y,z,ex:x+forward[0]*distance,ey:y+forward[1]*distance,ez:z+forward[2]*distance,target:null};
  return null;
}

function resolveMelee(g,p,map) {
  const m=memory(p);if(!m.melee||!p.alive||p.active!=='knife')return;
  m.melee=null;
  const contact=meleeContact(g,p,map);if(!contact)return;
  const {x,y,z,ex,ey,ez,target}=contact;
  emit(g,'meleeImpact',p.id,{weapon:'knife',knifeSkin:p.knifeSkin,x,y,z,ex,ey,ez,target:target?.id||null,at:g.elapsed});
  if(target){
    if(g.phase==='range')g.range.hits++;
    applyHit(g,p,target,WEAPONS.knife.damage,false);
  }
}

function visibleHeight(p,t,map) {
  const ox = p.x, oy = p.y+eyeHeight(p), oz = p.z;
  for (const ty of [t.y+eyeHeight(t)-.30, t.y+eyeHeight(t)+.06]) {
    const dx=t.x-ox, dy=ty-oy, dz=t.z-oz, len=Math.hypot(dx,dy,dz);
    if (len > .01 && worldHit(ox,oy,oz,dx/len,dy/len,dz/len,len,map) >= len-.015) return ty;
  }
  return null;
}

function patrolPoint(p,stage,map) {
  const side=p.team?-1:1;
  const route=map.patrols[p.seat], point=route[stage%(route.length+1)];
  if (point) return {x:point.x*side,y:point.y??0,z:point.z*side};
  return {x:map.zone.x,y:map.zone.y,z:map.zone.z+side};
}

const botWorlds = new WeakMap();
function botWorldFor(map) {
  if (!botWorlds.has(map)) botWorlds.set(map, {
    map, eyeHeight,
    visibleHeight:(p,t)=>visibleHeight(p,t,map),
    nextWaypoint:(p,x,z,y)=>nextWaypoint(p,x,z,y,map),
    canStep(p,x,z) {
      const step=walkHeight(x,z,p.y,.28,BODY_RADIUS,1.8,map);
      return step!=null && Math.abs(support(x,z,step+.01,BODY_RADIUS,map)-p.y)<.48;
    },
    patrolPoint
  });
  return botWorlds.get(map);
}

function startRound(g,map) {
  for (const p of g.players) resetPlayer(p,map);
  g.targets=[];
  g.phase='round'; g.time=40; g.roundWinner=null; g.reason=''; g.capture={team:null,progress:0};
  emit(g,'round',null,{round:g.round});
}

function finishRound(g,team,reason) {
  for(const p of g.players)memory(p).melee=null;
  if (team!==null) g.score[team]++;
  g.roundWinner=team; g.reason=reason;
  emit(g,'roundEnd',null,{team,reason});
  if (g.round>=5 || g.score.some(s=>s>=3)) {
    g.phase='end'; g.time=0;
    g.winner=g.score[0]===g.score[1]?null:g.score[0]>g.score[1]?0:1;
  } else { g.phase='between'; g.time=3; }
}

function updateRound(g,dt,map) {
  const alive=[0,0], hp=[0,0], inside=[0,0];
  const zone=map.zone;
  for (const p of g.players) if (p.alive) {
    alive[p.team]++; hp[p.team]+=p.hp;
    if (Math.abs(p.y-zone.y)<.95 && (p.x-zone.x)**2+(p.z-zone.z)**2<=zone.r**2) inside[p.team]++;
  }
  if (!alive[0] || !alive[1]) {
    finishRound(g,alive[0]===alive[1]?null:alive[0]>0?0:1,'상대 팀 전멸'); return;
  }
  if (g.phase==='round') {
    if (g.time<=0) { g.phase='overtime'; g.time=10; emit(g,'overtime',null); }
    return;
  }
  const owner=inside[0] && !inside[1]?0:inside[1] && !inside[0]?1:null;
  if (owner!==g.capture.team || owner===null) g.capture.progress=0;
  g.capture.team=owner;
  if (owner!==null) g.capture.progress=Math.min(1,g.capture.progress+dt/3);
  if (g.capture.progress>=1-1e-8) { finishRound(g,owner,'중앙 거점 점령'); return; }
  if (g.time>0) return;
  const advantage=alive[0]-alive[1] || hp[0]-hp[1];
  finishRound(g,advantage===0?null:advantage>0?0:1, alive[0]!==alive[1]?'생존 인원 우세':hp[0]!==hp[1]?'남은 체력 우세':'동점');
}

function tick(g, inputs, dt, map) {
  if (g.phase==='end') return;
  g.elapsed+=dt;
  if (g.phase==='range') {
    for (const dummy of g.targets) {
      if (!dummy.alive && g.elapsed>=dummy.respawnAt) {
        dummy.alive=true; dummy.hp=dummy.maxHp;
      }
    }
  } else {
    g.time=Math.max(0,g.time-dt);
  }
  if (g.phase==='range' || g.phase==='warmup' || g.phase==='between') {
    for (const p of g.players) if (inputs[p.id]?.weapon) changeWeapon(p,inputs[p.id].weapon,g.elapsed);
  }
  if (g.phase==='between') {
    if (g.time<=0) { g.round++; startRound(g,map); }
    return;
  }
  if (g.phase==='warmup' && g.time<=0) { startRound(g,map); return; }
  const shooters=[],meleeContacts=[];
  for (const p of g.players) {
    if (!p.alive) { memory(p).melee=null;continue; }
    const input=p.bot ? tacticalBotInput(g,p,dt,memory(p),botWorldFor(map)) : (inputs[p.id] || {});
    const m=memory(p);
    p.yaw=number(input.yaw,p.yaw)%(Math.PI*2); p.pitch=clamp(number(input.pitch,p.pitch),-1.45,1.45);
    if (input.slot===1 || input.slot===2 || input.slot===3) changeSlot(p,input.slot,g.elapsed);
    m.cooldown=m.cooldown>0?m.cooldown-dt:0;
    advanceReload(g,p,dt,input.fire);
    if (input.reload && (!input.fire || !p.ammo)) beginReload(g,p);
    p.ads=!!input.ads && !p.slide && !p.reload && !WEAPONS[p.active].melee;
    movePlayer(p,input,dt,map);
    if(m.melee&&m.melee.at<=g.elapsed+1e-8)meleeContacts.push(p);
    // Remember a fresh tap just before readiness, even if its release arrives
    // in the next network packet. Holding fire keeps the authored cadence.
    const fire=!!input.fire;
    if(fire&&!m.triggerDown&&!m.burstLeft&&(p.ammo>0||WEAPONS[p.active].melee)&&Math.max(m.cooldown,p.reload)<=.09)
      m.bufferedUntil=g.elapsed+.09;
    m.triggerDown=fire;
    if(!fire)m.semiLatched=false;
    const buffered=m.bufferedUntil>0&&g.elapsed<=m.bufferedUntil+1e-8;
    if((m.burstLeft||((fire||buffered)&&!m.semiLatched))&&m.cooldown<=1e-8&&!p.reload){
      m.bufferedUntil=0;shooters.push(p);
    }
  }
  // A paired trigger pull in one server tick allows a trade instead of favoring team order.
  for (const p of shooters)WEAPONS[p.active].melee?beginMelee(g,p):shoot(g,p,map);
  for (const p of meleeContacts)resolveMelee(g,p,map);
  if (g.phase==='round' || g.phase==='overtime') updateRound(g,dt,map);
}

/** Advance the match in seconds, splitting long frames to keep collisions stable. */
export function stepGame(game, inputs = {}, dt = 1/30) {
  const map=getArena(game.mapId);
  let left=clamp(number(dt),0,.25);
  while (left>1e-8) { const slice=Math.min(left,1/30); tick(game,inputs,slice,map); left-=slice; }
  return game;
}
