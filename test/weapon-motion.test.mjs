import test from 'node:test';
import assert from 'node:assert/strict';
import { reloadPose, RELOAD_CONTACT, shotResponse } from '../dist/weapon-view.js';
import { WEAPONS } from '../dist/balance.js';

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
