import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import { blasterMesh,gunFit } from '../dist/blaster.js';
import { heldMuzzleWorld } from '../dist/operator.js';
import { ArenaRenderer } from '../dist/render.js';

function mounted(weapon,rigged=true){
  const group=new T.Group(),torso=new T.Group(),mount=new T.Group(),held=blasterMesh(weapon);
  group.add(torso);torso.add(mount);mount.add(held);
  group.position.set(2,1,-3);group.rotation.y=-.83;
  torso.position.set(0,.03,0);torso.rotation.z=.045;
  mount.position.set(.127,1.166,-.277);mount.scale.setScalar(rigged?.86:.80);mount.rotation.x=.61;
  return {group,torso,mount,held};
}
function rendererFixture(weapon='sniper',rigged=true){
  const mountedGun=mounted(weapon,rigged),{group,mount,held}=mountedGun;
  const renderer=Object.create(ArenaRenderer.prototype);
  const avatar={group,wasAlive:true,active:weapon,loadout:mount,rig:rigged?{active:weapon,loadouts:{[weapon]:held}}:null};
  renderer.models=new Map([['remote',avatar]]);
  renderer.remoteFlashPoint=new T.Vector3();renderer.remoteFlashRotation=new T.Quaternion();
  renderer.remoteFlashIndex=0;renderer.remoteFlashFocus='self';
  renderer.remoteFlashes=Array.from({length:12},()=>({mesh:new T.Group(),ttl:0,actor:null,weapon:null}));
  return {...mountedGun,renderer,avatar};
}
const close=(a,b)=>assert.ok(a.distanceTo(b)<1e-7,`${a.toArray()} != ${b.toArray()}`);

test('every remote weapon uses the displayed barrel socket through its full parent transform',()=>{
  for(const weapon of Object.keys(gunFit))for(const rigged of [true,false]){
    const {held,group,renderer}=rendererFixture(weapon,rigged),fit=gunFit[weapon],out=new T.Vector3(),rotation=new T.Quaternion();
    assert.equal(renderer.remoteMuzzle('remote',weapon,out,rotation),true);
    const socket=new T.Vector3(fit.muzzleX||0,fit.muzzleY,fit.muzzle);
    close(out,socket.clone().applyMatrix4(held.matrixWorld));
    const forward=new T.Vector3(0,0,-1).applyQuaternion(rotation);
    close(forward,new T.Vector3(0,0,-1).transformDirection(held.matrixWorld));
    // A just-interpolated actor must work before a scene render updates matrices.
    const previous=out.clone();group.position.x+=.24;
    assert.equal(renderer.remoteMuzzle('remote',weapon,out),true);
    close(out,previous.add(new T.Vector3(.24,0,0)));
  }
});
test('the offset SMG barrel is not replaced with its centre line',()=>{
  const {held,renderer}=rendererFixture('smg'),fit=gunFit.smg,out=new T.Vector3();
  renderer.remoteMuzzle('remote','smg',out);
  const centered=new T.Vector3(0,fit.muzzleY,fit.muzzle).applyMatrix4(held.matrixWorld);
  assert.ok(out.distanceTo(centered)>.03);
});
test('missing, dead, hidden and switched actors do not invent an eye or world-zero muzzle',()=>{
  const {renderer,avatar,held}=rendererFixture(),out=new T.Vector3(7,8,9);
  assert.equal(renderer.remoteMuzzle('missing','sniper',out),false);
  assert.equal(renderer.remoteMuzzle('remote','rifle',out),false);
  avatar.wasAlive=false;assert.equal(renderer.remoteMuzzle('remote','sniper',out),false);avatar.wasAlive=true;
  avatar.group.visible=false;assert.equal(renderer.remoteMuzzle('remote','sniper',out),false);avatar.group.visible=true;
  held.visible=false;assert.equal(heldMuzzleWorld(held,'sniper',out),false);
  close(out,new T.Vector3(7,8,9));
});
test('remote flash origins are shot snapshots, pooled, cancellable and separate from the focused gun',()=>{
  const {renderer,group,avatar}=rendererFixture(),validated=new T.Vector3(3,2,-5);
  assert.equal(renderer.flashRemote('remote','sniper',1,validated),true);
  const first=renderer.remoteFlashes[0];close(first.mesh.position,validated);
  group.position.x+=2;validated.x=20;close(first.mesh.position,new T.Vector3(3,2,-5));
  assert.equal(renderer.flashRemote('remote','sniper',2,{x:NaN,y:0,z:0}),false);
  for(let i=0;i<80;i++)renderer.flashRemote('remote','sniper',i);
  assert.equal(renderer.remoteFlashes.length,12);
  renderer.stepRemoteFlashes(.2,'self');assert.ok(renderer.remoteFlashes.every(f=>!f.mesh.visible));
  renderer.flashRemote('remote','sniper',3);renderer.stepRemoteFlashes(0,'remote');
  assert.ok(renderer.remoteFlashes.every(f=>!f.mesh.visible));assert.equal(renderer.flashRemote('remote','sniper',4),false);
  renderer.stepRemoteFlashes(0,'self');renderer.flashRemote('remote','sniper',5);
  avatar.wasAlive=false;renderer.stepRemoteFlashes(0,'self');assert.ok(renderer.remoteFlashes.every(f=>!f.mesh.visible));
  renderer.clearRemoteFlashes();assert.ok(renderer.remoteFlashes.every(f=>f.ttl===0&&f.actor===null));
});
