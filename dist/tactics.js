/*
 * Target selection and combat goals adapted from Mugen87/dive (MIT).
 * Upstream: 7176136cf6c29eddfd620df2bf0d09a532680763
 * src/core/TargetSystem.js, src/entities/Enemy.js, src/goals/AttackGoal.js,
 * src/goals/DodgeGoal.js and src/goals/HuntGoal.js. See assets/dive-LICENSE.txt.
 * Dockline uses its own collision queries, navigation, weapons and net inputs.
 */
import { WEAPONS } from './balance.js';

const limit = (value, min, max) => Math.max(min, Math.min(max, value));
const angle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function newBrain(p) {
  // Stable variation across rounds, without synchronising teammates' shots or footwork.
  const hash = Array.from(p.id).reduce((seed, c) => Math.imul(seed, 31) + c.charCodeAt(0) | 0, 7) >>> 0;
  return { records: new Map(), target: null, nextSense: 0, waypoint: null, nextPath: 0,
    side: hash % 2 ? 1 : -1, nextDodge: 0, dodgeX: 0, dodgeZ: 0, dodging: false,
    stage: 0, phase: (hash % 791) / 126, tempo: (hash % 17) / 17, lastShotSeq: 0, destinationKey: '' };
}

function hear(g, p, b, opponents, env) {
  for (const event of g.events) {
    if (event.seq <= b.lastShotSeq || event.type !== 'shot' || !opponents.has(event.actor)) continue;
    const dx = event.x - p.x, dz = event.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 17 || !Number.isFinite(distance)) continue;
    let record = b.records.get(event.actor);
    if (!record) { record = { id: event.actor, visible: false }; b.records.set(event.actor, record); }
    // A loud shot gives a rough position, never an exact aim or permission to fire.
    if (!record.visible) {
      record.x = event.x + Math.sin(event.seq * .81 + b.phase) * (1.1 + distance * .06);
      record.z = event.z + Math.cos(event.seq * .77 + b.phase) * (1.1 + distance * .06);
      record.y = Number.isFinite(event.y) ? event.y - env.eyeHeight(opponents.get(event.actor)) : undefined;
      record.lastSensed = g.elapsed;
    }
  }
  b.lastShotSeq = g.seq;
}

function perceive(g, p, b, env) {
  const opponents = new Map(g.players.filter(t => t.team !== p.team && t.alive).map(t => [t.id, t]));
  hear(g, p, b, opponents, env);
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  for (const t of opponents.values()) {
    let record = b.records.get(t.id);
    const dx = t.x - p.x, dz = t.z - p.z, distance = Math.hypot(dx, dz);
    // Very near movement is sensed peripherally; a silent target behind cover remains unseen.
    const insideVision = distance < 2.8 || (dx * sy - dz * cy) / Math.max(.01, distance) > .16;
    const visibleY = insideVision ? env.visibleHeight(p, t) : null;
    if (visibleY != null) {
      if (!record) { record = { id: t.id, visible: false }; b.records.set(t.id, record); }
      if (!record.visible) record.visibleSince = g.elapsed;
      record.visible = true; record.lastSensed = g.elapsed;
      record.x = t.x; record.y = t.y; record.z = t.z; record.aimY = visibleY;
    } else if (record) { record.visible = false; }
  }
  for (const [id, record] of b.records) {
    if (!opponents.has(id) || g.elapsed - record.lastSensed > 4.5) b.records.delete(id);
  }

  // DIVE TargetSystem: pick the closest visible record; when none is in sight,
  // hunt the most recently sensed location instead.
  let visible = null, nearest = Infinity, hidden = null;
  for (const record of b.records.values()) {
    if (record.visible) {
      const distance = (record.x - p.x) ** 2 + (record.z - p.z) ** 2;
      if (distance < nearest) { visible = record; nearest = distance; }
    } else if (!hidden || record.lastSensed > hidden.lastSensed) hidden = record;
  }
  const chosen = visible || hidden;
  if (b.target?.id !== chosen?.id) { b.nextPath = 0; b.dodging = false; }
  b.target = chosen;
}

function patrol(p, stage, map) {
  const sign = p.team === 0 ? 1 : -1;
  const flank = [.13, -.33, .31][p.seat % 3];
  return stage % 2 ?
    { x: -sign * flank * map.width * .45, z: -sign * map.depth * .33 } :
    { x: sign * flank * map.width, z: sign * map.depth * .11 };
}

// DIVE DodgeGoal: commit to an open lateral destination and reverse side if
// there is insufficient space. Testing the full strafe keeps feet off ledges.
function dodge(g, p, b, env, target) {
  const dx = target.x - p.x, dz = target.z - p.z, distance = Math.max(.1, Math.hypot(dx, dz));
  if (!b.dodging || g.elapsed >= b.nextDodge || Math.hypot(p.x - b.dodgeX, p.z - b.dodgeZ) < .22) {
    const rightX = -dz / distance, rightZ = dx / distance;
    const length = 1.4 + b.tempo;
    let found = false;
    for (const side of [b.side, -b.side]) {
      const x = p.x + rightX * length * side, z = p.z + rightZ * length * side;
      if (env.canStep(p, (x + p.x) / 2, (z + p.z) / 2) && env.canStep(p, x, z)) {
        b.dodgeX = x; b.dodgeZ = z; b.side = -side; found = true; break;
      }
    }
    b.dodging = found; b.nextDodge = g.elapsed + .7 + b.tempo * .28;
  }
  if (!b.dodging) return null;
  const x = b.dodgeX - p.x, z = b.dodgeZ - p.z, len = Math.max(.1, Math.hypot(x, z));
  return { x: .62 * x / len, z: .62 * z / len };
}

function follow(g, p, b, env, goal, key) {
  if (key !== b.destinationKey || g.elapsed >= b.nextPath || !b.waypoint ||
      Math.hypot(b.waypoint.x - p.x, b.waypoint.z - p.z) < .45) {
    b.waypoint = env.nextWaypoint(p, goal.x, goal.z, goal.y);
    b.nextPath = g.elapsed + .27; b.destinationKey = key;
  }
  const waypoint = b.waypoint || goal;
  const x = waypoint.x - p.x, z = waypoint.z - p.z, len = Math.hypot(x, z);
  return { x: len > .06 ? x / len : 0, z: len > .06 ? z / len : 0, jump: !!waypoint.jump };
}

export function tacticalBotInput(g, p, dt, memory, env) {
  const b = memory.tactics ||= newBrain(p);
  if (g.elapsed >= b.nextSense) {
    perceive(g, p, b, env);
    b.nextSense = g.elapsed + .10 + b.tempo * .035;
  }
  const target = b.target;
  const seen = target?.visible;
  const range = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;
  const combatRange = p.active === 'shotgun' ? 5.4 : p.active === 'sniper' ? 20 : 13;
  let movement = null;
  const overtime = g.phase === 'overtime';
  // DIVE AttackGoal: clear lane -> strafe while engaging; blocked -> close in.
  if (seen && !overtime && range <= combatRange && !p.reload) movement = dodge(g, p, b, env, target);
  else b.dodging = false;

  if (!movement) {
    let goal, key;
    if (overtime) {
      goal = { x: env.map.zone.x + (p.seat - .8) * .45, y: env.map.zone.y, z: env.map.zone.z + (p.team ? -.4 : .4) };
      key = 'capture';
    } else if (target) {
      goal = target; key = target.id;
      // DIVE HuntGoal forgets a lost target after reaching its last sensed position.
      if (!seen && range < 1.1 && Math.abs((target.y ?? p.y) - p.y) < .7) { b.records.delete(target.id); b.target = null; b.nextSense = 0; }
    } else {
      const route = env.patrolPoint || patrol;
      goal = route(p, b.stage, env.map); key = 'route' + b.stage;
      if (Math.hypot(goal.x - p.x, goal.z - p.z) < 1.6 && Math.abs((goal.y ?? p.y) - p.y) < .7) { b.stage++; b.nextPath = 0; }
    }
    const arrived = Math.hypot(goal.x - p.x, goal.z - p.z) < .43 && Math.abs((goal.y ?? p.y) - p.y) < .6;
    movement = arrived ? { x: 0, z: 0 } : follow(g, p, b, env, goal, key);
  }

  let yaw = p.yaw, pitch = p.pitch, fire = false;
  // While hunting, look where we are going. This avoids tracking targets through walls.
  const aimX = seen ? target.x - p.x : movement.x;
  const aimZ = seen ? target.z - p.z : movement.z;
  if (Math.abs(aimX) + Math.abs(aimZ) > .01) {
    const angularError = seen ? Math.sin(g.elapsed * 3.6 + b.phase) * (.025 + .32 / Math.max(4, range)) : 0;
    const turn = angle(p.yaw, Math.atan2(aimX, -aimZ) + angularError);
    yaw += limit(turn, -4.9 * dt, 4.9 * dt);
    const elevation = seen ? Math.atan2(target.aimY - (p.y + env.eyeHeight(p)), range) + .014 * Math.sin(g.elapsed * 2.9 + b.phase) : 0;
    pitch += limit(elevation - p.pitch, -3.4 * dt, 3.4 * dt);
    if (seen) {
      const reaction = .36 + b.tempo * .30;
      const burst = p.active !== 'rifle' || (g.elapsed + b.phase) % (1.13 + b.tempo * .23) < .48 + b.tempo * .18;
      fire = g.elapsed - target.visibleSince >= reaction && Math.abs(turn) < .09 && Math.abs(pitch - elevation) < .07 && burst;
    }
  }
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const gun=WEAPONS[p.active];
  const dry=p.ammo===0 && p.reserve===0;
  return {
    yaw, pitch, fire:fire&&!dry, ads: seen && p.active === 'sniper' && range > 8,
    slot: p.active==='pistol'||dry?2:1,
    forward: movement.x * sy - movement.z * cy, strafe: movement.x * cy + movement.z * sy,
    jump: !!movement.jump, reload: p.reserve>0 && !p.reload && (!p.ammo || (!seen && p.ammo <= gun.mag * .35))
  };
}
