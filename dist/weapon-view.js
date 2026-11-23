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

// Camera-space poses for the game's viewmodels. Translation, wrist rotation
// and the time to bring up the sights are independent of the muzzle flash.
const presentation = {
  rifle:    {push:.072, pitch:.123, yaw:.018, roll:.030, aimSpeed:16, reticle:3},
  smg:      {push:.041, pitch:.076, yaw:.032, roll:.048, aimSpeed:23, reticle:2},
  burst:    {push:.061, pitch:.102, yaw:.012, roll:.018, aimSpeed:18, reticle:2},
  marksman: {push:.085, pitch:.142, yaw:.014, roll:.032, aimSpeed:12, reticle:3},
  lmg:      {push:.078, pitch:.101, yaw:.039, roll:.056, aimSpeed:10, reticle:3},
  pistol:   {push:.049, pitch:.219, yaw:.025, roll:.065, aimSpeed:25, reticle:2},
  revolver: {push:.084, pitch:.180, yaw:.022, roll:.046, aimSpeed:19, reticle:3},
  shotgun:  {push:.133, pitch:.166, yaw:.041, roll:.072, aimSpeed:14, reticle:4},
  sniper:   {push:.146, pitch:.174, yaw:.018, roll:.038, aimSpeed:11, reticle:3}
};
export function gunPresentation(id) {return presentation[id] ?? presentation.rifle;}

export function approachAim(previous, aimed, dt, weapon='rifle') {
  const target = Number(aimed);
  const rate=gunPresentation(weapon).aimSpeed*(aimed?1:1.25);
  const remaining = (previous - target) * Math.exp(-rate * dt);
  return Math.abs(remaining) < .001 ? target : target + remaining;
}

// Contact times drive the hands and the foley in both renderers.
export const RELOAD_CONTACT = Object.freeze({release:.20, seat:.67, settle:.84, shell:.54});
export const SNIPER_RELOAD_CONTACT = Object.freeze({release:.19, seat:.63, settle:.86, empty:.93});
export const SHOT_MECHANIC = Object.freeze({
  shotgun:Object.freeze({open:.20, close:.40}),
  sniper:Object.freeze({open:.29, close:.72}),
});
export const SNIPER_SCOPE_RETURN = .90;

export function scopeAfterShot(weapon, held, age) {
  return Boolean(held && (weapon !== 'sniper' || age >= SNIPER_SCOPE_RETURN));
}

export function sniperScopeVisible(weapon,aim,held){
  return weapon==='sniper' && Boolean(held) && aim>=.72;
}

// Keep part of the magnification while showing the bolt animation. Releasing
// ADS still returns smoothly to hip FOV, including midway through a shot.
export function cameraAim(weapon,previous,shoulder,held,scopeReady,dt){
  if(weapon!=='sniper')return shoulder;
  const target=held && !scopeReady ? .60 : Number(held);
  return approachAim(previous??shoulder,target,dt,weapon);
}

function ease(start, end, time) {
  const u = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return u * u * (3 - 2 * u);
}

export function reloadPose(player, weapon) {
  const duration = player.reloadDuration || WEAPONS[weapon]?.reload;
  const t = player.reload > 0 && duration ? 1 - player.reload / duration : 0;
  const shell = WEAPONS[weapon]?.shellReload;
  const marks = weapon === 'sniper' ? SNIPER_RELOAD_CONTACT : RELOAD_CONTACT;
  // Hold the gun across the chest between rounds of a continuous shell reload.
  const stayUp = shell && player.reload>0 && player.ammo+1<WEAPONS.shotgun.mag && player.reserve!==1;
  const raised = shell && player.reload>0 && player.shellLoop ? 1 : ease(0, shell ? .15 : .20, t);
  const tilt = raised * (stayUp ? 1 : 1-ease(shell ? .76 : marks.settle-.13, 1, t));
  const emptySniper = weapon==='sniper' && duration>WEAPONS.sniper.reload+.01;
  // Plant the supporting hand before the other one leaves the rear grip.
  const giveBack = emptySniper ? ease(.64,.755,t) : ease(.72,.96,t);
  const reach = ease(.025, shell ? .31 : marks.release, t) * (1-giveBack);
  const travel = shell
    ? ease(.12, .32, t) * (1 - ease(.32, RELOAD_CONTACT.shell, t))
    : ease(marks.release, .41, t) * (1 - ease(.49, marks.seat, t));
  const contact = shell ? RELOAD_CONTACT.shell : marks.seat;
  const bump = ease(contact - .025, contact, t) * (1 - ease(contact, contact + .10, t));
  return {tilt, reach, travel, bump};
}

// Stroke peaks when the opening sound lands, then returns on the closing sound.
const restingAction = Object.freeze({stroke:0, lift:0, grasp:0});
export function shotCycle(weapon, age) {
  if(weapon==='revolver'){
    if(age>=.12)return restingAction;
    const stroke=ease(0,.025,age)*(1-ease(.025,.12,age));
    return {stroke,lift:0,grasp:0,indexLag:1-ease(0,.080,age)};
  }
  const marks = SHOT_MECHANIC[weapon];
  if (!marks || age >= marks.close+.13) return restingAction;
  const sniper = weapon === 'sniper';
  const stroke = ease(sniper ? .18 : .085, marks.open, age) * (1-ease(sniper ? .53 : .26, marks.close, age));
  const lift = sniper ? ease(.09,.19,age)*(1-ease(.67,marks.close,age)) : 0;
  const grasp = sniper ? ease(.025,.145,age)*(1-ease(marks.close,marks.close+.13,age)) : stroke;
  return {stroke,lift,grasp};
}

export function emptySniperBolt(player) {
  if (!player.reload || !(player.reloadDuration > WEAPONS.sniper.reload+.01)) return 0;
  const t = 1-player.reload/player.reloadDuration;
  return ease(.795,.818,t)*(1-ease(.86,SNIPER_RELOAD_CONTACT.empty,t));
}

export function emptySniperGrasp(player) {
  if (!player.reload || !(player.reloadDuration > WEAPONS.sniper.reload+.01)) return 0;
  const t = 1-player.reload/player.reloadDuration;
  return ease(.755,.795,t)*(1-ease(SNIPER_RELOAD_CONTACT.empty,.995,t));
}

// Envelope values are in seconds so recoil retains its shape on a slow display.
const impulse = {
  rifle:   {kick:.56, damping:18, frequency:21, follow:.28, end:.28, flash:.027},
  smg:     {kick:.53, damping:25, frequency:29, follow:.18, end:.20, flash:.023},
  burst:   {kick:.54, damping:22, frequency:26, follow:.22, end:.23, flash:.026},
  marksman:{kick:.56, damping:16, frequency:22, follow:.18, end:.33, flash:.031},
  lmg:     {kick:.50, damping:15, frequency:18, follow:.26, end:.35, flash:.031},
  pistol:  {kick:.50, damping:21, frequency:32, follow:.20, end:.25, flash:.024},
  revolver:{kick:.65, damping:18, frequency:29, follow:.19, end:.29, flash:.032},
  shotgun: {kick:.60, damping:13, frequency:22, follow:.32, end:.44, flash:.049},
  sniper:  {kick:.58, damping:11, frequency:17, follow:.24, end:.52, flash:.042},
};
export function shotResponse(age, weapon='rifle') {
  const {damping,frequency,follow,end} = impulse[weapon] ?? impulse.rifle;
  if (age >= end) return 0;
  return Math.exp(-age*damping)*(Math.cos(age*frequency)+follow*Math.sin(age*frequency));
}
export function shotFlashDuration(weapon) {
  return (impulse[weapon] ?? impulse.rifle).flash;
}

// Show the barrel releasing the round before the weapon kicks back.
export const LOCAL_IGNITION_LIFE=.016;
export function shotKickResponse(age,weapon){
  const rise=.022;
  const envelope=age<rise ? ease(0,rise,age) : shotResponse(age-rise,weapon);
  return (impulse[weapon]??impulse.rifle).kick*envelope;
}

export const shoulderedKick=(kick,aim)=>kick*(1-.48*aim);
