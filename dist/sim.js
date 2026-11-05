// Shared rules for the standalone practice arena and the authoritative room host.
import { MAP } from './arena-map.js';
import { BODY_RADIUS, walkHeight, support, ceilingAt, intersect, worldHit } from './arena-world.js';
import { nextWaypoint } from './arena-routes.js';
import { tacticalBotInput } from './tactics.js';
export { MAP };

export const WEAPONS = {
  rifle: { id: 'rifle', label: '돌격소총', mag: 24, damage: 25, head: 40, interval: .145, reload: 1.5, spread: .008 },
  shotgun: { id: 'shotgun', label: '펌프 산탄총', mag: 5, damage: 16, head: 20, interval: .82, reload: 1.75, spread: .078, pellets: 8 },
  sniper: { id: 'sniper', label: '저격소총', mag: 5, damage: 67, head: 110, interval: 1.05, reload: 1.9, spread: .005 },
  pistol: { id: 'pistol', label: '권총', mag: 12, damage: 21, head: 35, interval: .235, reload: 1.0, spread: .013 }
};

const playerMemory = new WeakMap();

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const number = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const primary = id => ['rifle', 'shotgun', 'sniper'].includes(id) ? id : 'rifle';
export const eyeHeight = player => player.slide > 0 ? 1.0 : 1.55;
export const spawnYaw = player => MAP.spawns[player.team][player.seat % 3].yaw;

function memory(p) {
  if (!playerMemory.has(p)) {
    playerMemory.set(p, { mag: { [p.weapon]: WEAPONS[p.weapon].mag, pistol: 12 }, cooldown: 0,
      slideCooldown: 0, lastSlide: false, lastJump: false, vx: 0, vz: 0, vy: 0, grounded: true });
  }
  return playerMemory.get(p);
}

function resetPlayer(p) {
  const start = MAP.spawns[p.team][p.seat % 3];
  p.x=start.x; p.z=start.z; p.y=0; p.yaw=start.yaw; p.pitch=0; p.grounded=true;

  p.hp = 100; p.alive = true; p.active = p.weapon;
  p.ammo = WEAPONS[p.weapon].mag; p.ads = false; p.slide = 0; p.reload = 0; p.speed = 0;
  playerMemory.delete(p);
}

function spawnPlayer(fields) {
  const p = { ...fields, kills:0, deaths:0, damage:0 };
  resetPlayer(p);
  return p;
}

function initialState(size, phase, time, players, targets) {
  return { size, phase, time, elapsed:0, round:1, score:[0,0],
    winner:null, roundWinner:null, reason:'', players, targets,
    events:[], seq:0, capture:{team:null,progress:0} };
}

export function createRange({ id='local', name='나', weapon='rifle' } = {}) {
  const player = spawnPlayer({id, name, team:0, seat:0, bot:false, weapon:primary(weapon)});
  const targets = MAP.rangeTargets.map((position, index) => ({
    ...position, kind:'dummy', id:'dummy-'+(index+1), name:'더미 '+(index+1),
    yaw:Math.atan2(player.x-position.x, position.z-player.z),
    hp:100, maxHp:100, alive:true, respawnAt:0
  }));
  const near = targets[0], dx = near.x-player.x, dz = near.z-player.z;
  player.yaw = Math.atan2(dx,-dz);
  player.pitch = Math.atan2(near.y + 1.14 - eyeHeight(player),Math.hypot(dx,dz));
  const game = initialState(1,'range',0,[player],targets);
  game.range = {shots:0,hits:0,kills:0};
  return game;
}

export function createGame({ size = 2, players = [], warmup = 15 } = {}) {
  size = size === 3 ? 3 : 2;
  const roster = [];
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
        bot: source ? Boolean(source.bot) : true, weapon: primary(source?.weapon ?? ['rifle', 'shotgun', 'sniper'][seat]) }));
    }
  }
  warmup = clamp(number(warmup, 15), 0, 60);
  const targets = warmup ? MAP.plates.map((plate,team)=>({...plate,team,id:"target-"+team,practice:true,r:.50})) : [];
  if(warmup) for(const p of roster){
    const plate=targets[p.team], dx=plate.x-p.x, dz=plate.z-p.z;
    p.yaw=Math.atan2(dx,-dz);p.pitch=Math.atan2(plate.y-eyeHeight(p),Math.hypot(dx,dz));
  }
  return initialState(size, warmup > 0 ? 'warmup' : 'round', warmup || 40, roster, targets);
}

function emit(g, type, actor, fields = {}) {
  g.events.push({ seq: ++g.seq, type, actor, ...fields });
  if (g.events.length > 40) g.events.splice(0, g.events.length - 40);
}

function changeWeapon(p, id) {
  if (primary(id) !== id || id === p.weapon) return;
  p.weapon = id; p.active = id; p.ammo = WEAPONS[id].mag; p.reload = 0;
  memory(p).mag[id] = p.ammo;
}

function changeSlot(p, slot) {
  const next = slot === 2 ? 'pistol' : p.weapon;
  if (p.active === next) return;
  const m = memory(p);
  m.mag[p.active] = p.ammo; p.active = next; p.ammo = m.mag[next] ?? WEAPONS[next].mag;
  p.reload = 0; m.cooldown = Math.max(m.cooldown, .16);
}

function beginReload(g, p) {
  if (p.reload > 0 || p.ammo === WEAPONS[p.active].mag) return;
  p.reload = WEAPONS[p.active].reload;
  emit(g, 'reload', p.id, { weapon: p.active });
}



function movePlayer(p, input, dt) {
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
  const rate = p.ads ? 3.65 : 6.2, slideSpeed = 7.7 + 4.1*(p.slide/.52);
  const vx=p.slide>0?m.slideX*slideSpeed:dx*rate, vz=p.slide>0?m.slideZ*slideSpeed:dz*rate;
  const response=1-Math.exp(-dt*(m.grounded?24:3.1));
  m.vx+=(vx-m.vx)*response; m.vz+=(vz-m.vz)*response;
  p.slide=Math.max(0,p.slide-dt);
  const height=p.slide>0?1.23:1.79, step=m.grounded?.26:.022;
  const nextX=p.x+m.vx*dt, nextZ=p.z+m.vz*dt;
  const hx=walkHeight(nextX,p.z,p.y,step,BODY_RADIUS,height);
  if(hx!=null){p.x=nextX;p.y=hx;}else m.vx=0;
  const hz=walkHeight(p.x,nextZ,p.y,step,BODY_RADIUS,height);
  if(hz!=null){p.z=nextZ;p.y=hz;}else m.vz=0;
  const floor=support(p.x,p.z,p.y+.018);
  const ceiling=ceilingAt(p.x,p.z,p.y+height);
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

function trace(g, p, yaw, pitch) {
  const x = p.x, y = p.y + eyeHeight(p), z = p.z;
  const cp = Math.cos(pitch), dx = Math.sin(yaw) * cp, dz = -Math.cos(yaw) * cp, dy = Math.sin(pitch);
  let distance = worldHit(x,y,z,dx,dy,dz), target = null, headshot = false;
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

function shoot(g, p) {
  if (!p.ammo) { beginReload(g,p); return; }
  const w = WEAPONS[p.active], m = memory(p);
  p.ammo--; m.mag[p.active] = p.ammo; m.cooldown = w.interval;
  const total = new Map();
  let central;
  for (let i=0; i < (w.pellets || 1); i++) {
    const spread = w.spread * (p.ads && !w.pellets ? .24 : 1) * (p.slide > 0 ? 1.45 : 1);
    const angle = Math.random() * Math.PI * 2, radius = Math.sqrt(Math.random()) * spread;
    const hit = trace(g, p, p.yaw + Math.cos(angle)*radius, p.pitch + Math.sin(angle)*radius);
    if (!central || (hit.target && !central.target)) central = hit;
    if (!hit.target) continue;
    const old = total.get(hit.target) || { damage: 0, headshot: false };
    const falloff = w.pellets ? clamp(1 - Math.max(0,hit.distance - 7)*.045,.45,1) : 1;
    old.damage += Math.round((hit.headshot ? w.head : w.damage)*falloff); old.headshot ||= hit.headshot;
    total.set(hit.target, old);
  }
  const {x,y,z,ex,ey,ez} = central;
  emit(g,'shot',p.id,{ weapon:p.active,x,y,z,ex,ey,ez });
  if (g.phase==='range') {
    g.range.shots++;
    if (total.size) g.range.hits++;
  }
  for (const [t, h] of total) {
    if(t.practice) { emit(g,'hit',p.id,{target:t.id,damage:0,headshot:false,weapon:p.active}); continue; }
    const damage = Math.min(t.hp,h.damage);
    emit(g,'hit',p.id,{target:t.id, damage, headshot:h.headshot, weapon:p.active});
    if (g.phase === 'warmup') continue;
    t.hp -= damage; p.damage += damage;
    if (t.hp > 0) continue;
    t.alive = false; p.kills++;
    if (t.kind==='dummy') {
      t.respawnAt = g.elapsed + 1.5;
      g.range.kills++;
    } else {
      t.ads = false; t.slide = 0; t.speed = 0; t.reload = 0; t.deaths++;
    }
    emit(g,'kill',p.id,{target:t.id,headshot:h.headshot,weapon:p.active});
  }
}



function visibleHeight(p,t) {
  const ox = p.x, oy = p.y+eyeHeight(p), oz = p.z;
  for (const ty of [t.y+eyeHeight(t)-.30, t.y+eyeHeight(t)+.06]) {
    const dx=t.x-ox, dy=ty-oy, dz=t.z-oz, len=Math.hypot(dx,dy,dz);
    if (len > .01 && worldHit(ox,oy,oz,dx/len,dy/len,dz/len,len) >= len-.015) return ty;
  }
  return null;
}

const botWorld={
  map:MAP,visibleHeight,eyeHeight,nextWaypoint,
  canStep(p,x,z){
    const step=walkHeight(x,z,p.y,.28);
    return step!=null && Math.abs(support(x,z,step+.01)-p.y)<.48;
  },
  patrolPoint(p,stage){
    const side=p.team?-1:1;
    if(stage%3===0) return [{x:0,y:MAP.zone.y,z:.35*side},{x:-10.85*side,y:1.64,z:.7*side},{x:11.1*side,y:0,z:6*side}][p.seat%3];
    if(stage%3===1) return {x:(p.seat-1)*5*side,y:0,z:-14*side};
    return {x:0,y:MAP.zone.y,z:side};
  }
};
function botInput(g,p,dt){return tacticalBotInput(g,p,dt,memory(p),botWorld);}

function startRound(g) {
  for (const p of g.players) resetPlayer(p);
  g.targets=[];
  g.phase='round'; g.time=40; g.roundWinner=null; g.reason=''; g.capture={team:null,progress:0};
  emit(g,'round',null,{round:g.round});
}

function finishRound(g,team,reason) {
  if (team!==null) g.score[team]++;
  g.roundWinner=team; g.reason=reason;
  emit(g,'roundEnd',null,{team,reason});
  if (g.round>=5 || g.score.some(s=>s>=3)) {
    g.phase='end'; g.time=0;
    g.winner=g.score[0]===g.score[1]?null:g.score[0]>g.score[1]?0:1;
  } else { g.phase='between'; g.time=3; }
}

function updateRound(g,dt) {
  const alive=[0,0], hp=[0,0], inside=[0,0];
  const zone=MAP.zone;
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

function tick(g, inputs, dt) {
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
    for (const p of g.players) if (inputs[p.id]?.weapon) changeWeapon(p,inputs[p.id].weapon);
  }
  if (g.phase==='between') {
    if (g.time<=0) { g.round++; startRound(g); }
    return;
  }
  if (g.phase==='warmup' && g.time<=0) { startRound(g); return; }
  const shooters=[];
  for (const p of g.players) {
    if (!p.alive) continue;
    const input=p.bot ? botInput(g,p,dt) : (inputs[p.id] || {});
    const m=memory(p);
    p.yaw=number(input.yaw,p.yaw)%(Math.PI*2); p.pitch=clamp(number(input.pitch,p.pitch),-1.45,1.45);
    if (input.slot===1 || input.slot===2) changeSlot(p,input.slot);
    p.ads=!!input.ads && !p.slide && !p.reload;
    movePlayer(p,input,dt);
    m.cooldown=Math.max(0,m.cooldown-dt);
    if (p.reload>0) {
      p.reload=Math.max(0,p.reload-dt);
      if (p.reload===0) { p.ammo=WEAPONS[p.active].mag; m.mag[p.active]=p.ammo; }
    }
    if (input.reload) beginReload(g,p);
    if (input.fire && m.cooldown===0 && !p.reload) shooters.push(p);
  }
  // A paired trigger pull in one server tick allows a trade instead of favoring team order.
  for (const p of shooters) shoot(g,p);
  if (g.phase==='round' || g.phase==='overtime') updateRound(g,dt);
}

/** Advance the match in seconds, splitting long frames to keep collisions stable. */
export function stepGame(game, inputs = {}, dt = 1/30) {
  let left=clamp(number(dt),0,.25);
  while (left>1e-8) { const slice=Math.min(left,1/30); tick(game,inputs,slice); left-=slice; }
  return game;
}
