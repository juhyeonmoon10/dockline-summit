// The reticle, WebGL camera and software camera all use vertical field of view.
import { WEAPONS } from './balance.js';

export function weaponFov(weapon, zoom, sliding = false) {
  const hip = sliding ? 78 : 72;
  const aimed = WEAPONS[weapon]?.aimFov ?? 59;
  return hip + (aimed - hip) * zoom;
}

export function canAim(player, held) {
  return Boolean(held && player?.alive && player.active !== 'knife' && !player.reload && !player.slide);
}

export function approachAim(previous, aimed, dt) {
  const target = Number(aimed);
  const remaining = (previous - target) * Math.exp(-14 * dt);
  return Math.abs(remaining) < .001 ? target : target + remaining;
}

// Contact times drive the hands and the foley in both renderers.
export const RELOAD_CONTACT = Object.freeze({release:.20, seat:.67, settle:.84, shell:.54});

function ease(start, end, time) {
  const u = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return u * u * (3 - 2 * u);
}

export function reloadPose(player, weapon) {
  const duration = player.reloadDuration || WEAPONS[weapon]?.reload;
  const t = player.reload > 0 && duration ? 1 - player.reload / duration : 0;
  const shell = WEAPONS[weapon]?.shellReload;
  const tilt = ease(0, .20, t) * (1 - ease(.71, 1, t));
  const reach = ease(.025, shell ? .31 : RELOAD_CONTACT.release, t) * (1 - ease(.72, .96, t));
  const travel = shell
    ? ease(.12, .32, t) * (1 - ease(.32, RELOAD_CONTACT.shell, t))
    : ease(RELOAD_CONTACT.release, .41, t) * (1 - ease(.49, RELOAD_CONTACT.seat, t));
  const contact = shell ? RELOAD_CONTACT.shell : RELOAD_CONTACT.seat;
  const bump = ease(contact - .025, contact, t) * (1 - ease(contact, contact + .10, t));
  return {tilt, reach, travel, bump};
}

// An immediate punch, a small follow-through, then rest. Independent of render FPS.
export function shotResponse(age) {
  if (age >= .28) return 0;
  return Math.exp(-age * 18) * (Math.cos(age * 21) + .28 * Math.sin(age * 21));
}
