import { WEAPONS } from './balance.js';
import { gunPresentation, weaponFov } from './weapon-view.js';

const hitDuration = { body: .16, head: .23, kill: .32 };
const hitPriority = { body: 0, head: 1, kill: 2 };

// One reticle and confirmation layer for both renderers. All feedback comes from
// accepted simulation events, including events received from the room host.
export class CombatFeedback {
  constructor(hud) {
    this.sight = hud.querySelector('#sight');
    this.marker = hud.querySelector('#hitMark');
    this.number = hud.querySelector('#combatDamage');
    this.frag = hud.querySelector('#fragConfirm');
    this.vignette = hud.querySelector('#damage');
    this.weapon = hud.querySelector('#weaponHud');
    this.status = document.createElement('small');
    this.status.className = 'weapon-status';
    this.weapon.append(this.status);
    this.reset();
  }

  reset() {
    this.lastTarget = null;
    this.damageTotal = 0;
    this.numberUntil = this.fragUntil = this.markerUntil = this.hurtUntil = 0;
    this.lastShot = this.markedAt = -Infinity;
    this.shotWeapon = null;
    this.attackBearing = null;
    this.number.textContent = this.frag.textContent = this.status.textContent = '';
    this.number.classList.remove('head');
    this.marker.style.opacity = this.vignette.style.opacity = '0';
    this.markerKind = 'body';
    this.reticleWeapon = null;
    this.reticleAimed = false;
    this.reticleFov = 0;
    this.lastPulse = -1;
    this.lastTurn = null;
    this.sight.style.setProperty('--kick', '0px');
    delete this.vignette.dataset.direction;
  }

  shot(weapon, now) {
    this.shotWeapon = weapon;
    this.lastShot = now;
  }

  mark(kind, now) {
    // A shotgun volley may touch multiple targets within the same snapshot.
    if (now === this.markedAt && hitPriority[kind] < hitPriority[this.markerKind]) return;
    this.markerKind = this.marker.dataset.kind = kind;
    this.markedAt = now;
    this.markerUntil = now + hitDuration[kind];
  }

  hit(event, now) {
    this.mark(event.headshot ? 'head' : 'body', now);
    if (!(event.damage > 0)) return;
    const sameBurst = event.target === this.lastTarget && now < this.numberUntil;
    this.damageTotal = (sameBurst ? this.damageTotal : 0) + event.damage;
    this.lastTarget = event.target;
    this.numberUntil = now + .46;
    this.number.textContent = String(Math.round(this.damageTotal));
    this.number.classList.toggle('head', !!event.headshot);
  }

  kill(event, victimName, now) {
    this.mark('kill', now);
    this.frag.dataset.headshot = String(!!event.headshot);
    const label = document.createElement('b');
    label.textContent = event.headshot ? '헤드샷 처치' : '처치';
    this.frag.replaceChildren(label, document.createTextNode(victimName ? ' ' + victimName : ''));
    this.fragUntil = now + 1.4;
    // A later hit cannot extend the burst belonging to the fallen opponent.
    this.lastTarget = null;
  }

  hurt(player, attacker, now) {
    this.hurtUntil = now + .56;
    this.attackBearing = attacker && player && attacker.id !== player.id
      ? Math.atan2(attacker.x - player.x, player.z - attacker.z) : null;
    this.vignette.dataset.direction = String(this.attackBearing !== null);
    this.lastTurn = null;
  }

  updateSight(player, aimed, fieldOfView) {
    const fov = fieldOfView || weaponFov(player.active, Number(aimed), player.slide > 0);
    const lens = Math.round(fov * 4) / 4;
    if (player.active === this.reticleWeapon && aimed === this.reticleAimed && lens === this.reticleFov) return;
    this.reticleWeapon = this.sight.dataset.equipped = player.active;
    this.reticleAimed = aimed;
    this.reticleFov = lens;
    this.sight.classList.toggle('scope', player.active === 'sniper' && aimed);
    // Spread switches on the simulation tick. The lens still moves during ADS.
    const gun = WEAPONS[player.active], spread = aimed ? gun.aimSpread : gun.spread;
    const halfFov = lens * Math.PI / 360;
    this.sight.style.setProperty('--cone', (50 * Math.tan(spread) / Math.tan(halfFov)).toFixed(3) + 'vh');
  }

  updateWeapon(player, spectating) {
    const gun = WEAPONS[player.active];
    const canReload = player.reserve !== 0;
    const low = !gun.melee && player.alive && player.ammo <= Math.ceil(gun.mag * .2);
    const reloading = player.reload > 0 && player.alive;
    const label = reloading ? (gun.shellReload ? '탄 삽입 중' : '재장전 중')
      : !low || spectating ? ''
      : !canReload ? (player.ammo === 0 ? '탄약 없음' : '예비탄 없음') : 'R  재장전';
    if (this.status.textContent !== label) this.status.textContent = label;
    this.weapon.classList.toggle('low-ammo', low && !reloading);
    this.weapon.classList.toggle('reloading', reloading);
    if (reloading) {
      const duration = player.reloadDuration || gun.reload;
      const fraction = Math.max(0, Math.min(1, 1 - player.reload / duration));
      this.weapon.style.setProperty('--reload-progress', fraction.toFixed(3));
    }
  }

  frame(now, yaw) {
    if (this.lastShot > -Infinity) {
      const weight = Math.max(0, 1 - (now - this.lastShot) / .12);
      const pixels = this.reticleWeapon === this.shotWeapon ? Math.round(gunPresentation(this.shotWeapon).reticle * weight * weight) : 0;
      if (pixels !== this.lastPulse) {
        this.sight.style.setProperty('--kick', pixels + 'px');
        this.lastPulse = pixels;
      }
      if (!weight) this.lastShot = -Infinity;
    }
    if (this.markerUntil) {
      const remaining = Math.max(0, this.markerUntil - now);
      const strength = remaining / hitDuration[this.markerKind];
      this.marker.style.opacity = String(Math.min(1, strength * 2.6));
      this.marker.style.setProperty('--mark-scale', (.9 + .26 * strength * strength).toFixed(3));
      if (!remaining) this.markerUntil = 0;
    }
    if (this.hurtUntil) {
      const strength = Math.max(0, (this.hurtUntil - now) / .56);
      this.vignette.style.opacity = String(.86 * Math.min(1, strength * 1.35));
      if (this.attackBearing !== null && this.lastTurn !== yaw) {
        this.vignette.style.setProperty('--incoming', (this.attackBearing - yaw).toFixed(3) + 'rad');
        this.lastTurn = yaw;
      }
      if (!strength) this.hurtUntil = 0;
    }
    if (this.numberUntil && this.numberUntil <= now) {
      this.numberUntil = 0;
      this.number.textContent = '';
    }
    if (this.fragUntil && this.fragUntil <= now) {
      this.fragUntil = 0;
      this.frag.replaceChildren();
    }
  }
}
