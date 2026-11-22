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
