import test from 'node:test';
import assert from 'node:assert/strict';
import { reloadPose, RELOAD_CONTACT, shotResponse, shotCycle, SHOT_MECHANIC, SNIPER_SCOPE_RETURN,
  SNIPER_RELOAD_CONTACT, emptySniperBolt, scopeAfterShot } from '../dist/weapon-view.js';
import { WEAPONS } from '../dist/balance.js';
import { createRange, stepGame } from '../dist/sim.js';

const pose=(weapon,t)=>{
  const duration=WEAPONS[weapon].reload;
  return reloadPose({reload:duration*(1-t),reloadDuration:duration},weapon);
};

test('reload contact is visible on the same timeline as the magazine and shell sounds',()=>{
  const take=pose('rifle',RELOAD_CONTACT.release);
  const seat=pose('rifle',RELOAD_CONTACT.seat);
  assert.equal(take.reach,1);
  assert.ok(take.travel<.00001);
  assert.equal(pose('rifle',.43).travel,1);
  assert.ok(seat.travel<.00001 && seat.bump>.99 && seat.reach>.99);
  assert.ok(pose('shotgun',RELOAD_CONTACT.shell).bump>.99);
  const rest={tilt:0,reach:0,travel:0,bump:0};
  assert.deepEqual(pose('rifle',1),rest);
  assert.deepEqual(reloadPose({reload:0,reloadDuration:0},'shotgun'),rest);
});

test('firing responds immediately, settles once and leaves no persistent offset',()=>{
  assert.equal(shotResponse(0),1);
  assert.ok(shotResponse(.04)<.6 && shotResponse(.04)>0);
  assert.ok(shotResponse(.12)<0);
  assert.equal(shotResponse(.5),0);
  assert.ok(Math.abs(shotResponse(8/60)-shotResponse(4/30))<1e-9);
});

test('the shotgun pump and sniper bolt reach both audible stops on different beats',()=>{
  for(const weapon of ['shotgun','sniper']){
    const {open,close}=SHOT_MECHANIC[weapon];
    assert.equal(shotCycle(weapon,open).stroke,1);
    assert.equal(shotCycle(weapon,close).stroke,0);
    assert.deepEqual(shotCycle(weapon,Infinity),{stroke:0,lift:0,grasp:0});
  }
  assert.equal(shotCycle('shotgun',.30).lift,0);
  assert.equal(shotCycle('sniper',.30).lift,1);
  assert.ok(shotResponse(.045,'shotgun')>shotResponse(.045,'smg'));
});

test('a held sniper scope returns after the bolt closes and before the next possible shot',()=>{
  assert.ok(SHOT_MECHANIC.sniper.close<SNIPER_SCOPE_RETURN && SNIPER_SCOPE_RETURN<WEAPONS.sniper.interval);
  assert.equal(scopeAfterShot('sniper',true,.42),false);
  assert.equal(scopeAfterShot('sniper',true,SNIPER_SCOPE_RETURN),true);
  assert.equal(scopeAfterShot('sniper',false,Infinity),false);
  assert.equal(scopeAfterShot('shotgun',true,0),true);
  for(const [duration,expected] of [[WEAPONS.sniper.reload,0],[WEAPONS.sniper.emptyReload,1]]){
    assert.equal(emptySniperBolt({reload:.18*duration,reloadDuration:duration}),expected);
    assert.ok(emptySniperBolt({reload:(1-SNIPER_RELOAD_CONTACT.empty)*duration,reloadDuration:duration})<.00001);
  }
});

test('the shotgun remains raised across repeated shells and rests on interruption or the last shell',()=>{
  const g=createRange({weapon:'shotgun'}),p=g.players[0];
  p.ammo=4;
  stepGame(g,{[p.id]:{reload:true}},1/60);
  assert.equal(p.shellLoop,false);
  while(p.ammo===4 && p.reload>.02)stepGame(g,{},1/120);
  assert.equal(reloadPose(p,p.active).tilt,1);
  while(p.ammo===4)stepGame(g,{},1/120);
  assert.equal(p.shellLoop,true);
  assert.equal(reloadPose(p,p.active).tilt,1);
  const last={...p,ammo:6,reload:.01};
  assert.ok(reloadPose(last,'shotgun').tilt<.05);
  stepGame(g,{[p.id]:{fire:true}},1/60);
  assert.equal(reloadPose(p,p.active).tilt,0);
  stepGame(g,{[p.id]:{reload:true}},1/60);
  assert.equal(p.shellLoop,false);
});
