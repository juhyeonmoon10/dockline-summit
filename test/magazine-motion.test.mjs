import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {animateHands,gunModel} from '../dist/render.js';
import {reloadPose,RELOAD_CONTACT,shotCycle} from '../dist/weapon-view.js';
import {WEAPONS} from '../dist/balance.js';

const magazines=['rifle','smg','burst','marksman','lmg','pistol'];
const pad=new T.Vector3(-.008,-.070,.010);
function pose(model,id,progress){
  const duration=WEAPONS[id].reload;
  const player={active:id,reloadDuration:duration,reload:progress?duration*(1-progress):0};
  animateHands(model,player,reloadPose(player,id),shotCycle(id,Infinity));
  model.updateWorldMatrix(true,true);
}
function gap(group,point){
  const tri=new T.Triangle(),nearest=new T.Vector3();
  let distance=Infinity;
  group.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const {index,attributes:{position}}=mesh.geometry;
    for(let i=0,count=index?.count||position.count;i<count;i+=3){
      for(const [j,target] of [tri.a,tri.b,tri.c].entries()){
        target.fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
      }
      distance=Math.min(distance,tri.closestPointToPoint(point,nearest).distanceTo(point));
    }
  });
  return distance;
}
test('an actual leather pad meets each moving magazine surface from release to seating',()=>{
  for(const id of magazines){
    const gun=gunModel(id),{support,strong,magazine,handling}=gun.userData,hand=support.userData.hand;
    // Include the translated, rolled, scaled first-person mount.
    gun.position.set(.27,-.22,-.41);gun.rotation.set(-.24,.44,-.15);gun.scale.setScalar(.88);
    for(const t of [RELOAD_CONTACT.release,.27,.38,.47,.55,.61,RELOAD_CONTACT.seat]){
      pose(gun,id,t);
      const onGlove=hand.localToWorld(pad.clone()),onMagazine=magazine.localToWorld(new T.Vector3(...handling.grip));
      assert.ok(onGlove.distanceTo(onMagazine)<1e-6,id+' contact at '+t);
      assert.ok(gap(hand.children[0].children[0],onGlove)<.001,id+' palm surface');
      assert.ok(gap(magazine,onMagazine)<.001,id+' magazine surface');
      assert.ok(strong.position.length()<1e-8,id+' grip');
      if(t===RELOAD_CONTACT.release||t===RELOAD_CONTACT.seat)assert.ok(magazine.position.length()<1e-9,id+' seated contact');
    }
    pose(gun,id,0);
    assert.ok(magazine.position.length()<1e-8&&support.position.length()<1e-8,id+' interrupted reload');
    assert.ok(support.quaternion.angleTo(new T.Quaternion())<1e-7);
  }
});
test('a pistol drops vertically, the drum clears laterally, and the SMG reaches clearance earlier',()=>{
  const travel=(id,t)=>{
    const model=gunModel(id),{magazine,handling}=model.userData;
    pose(model,id,0);const rest=magazine.localToWorld(new T.Vector3(...handling.grip));
    pose(model,id,t);return magazine.localToWorld(new T.Vector3(...handling.grip)).sub(rest);
  };
  const pistol=travel('pistol',.47),drum=travel('lmg',.47);
  assert.ok(Math.abs(pistol.y)>4*Math.abs(pistol.x));
  assert.ok(Math.abs(drum.x)>Math.abs(drum.y)&&drum.z>pistol.z*3);
  const fraction=id=>travel(id,.345).length()/travel(id,.47).length();
  assert.ok(fraction('smg')>.97&&fraction('lmg')<.7);
});
