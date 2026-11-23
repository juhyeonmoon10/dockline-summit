import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Vector3} from '../dist/assets/three.module.min.js';
import {PRIMARY_WEAPONS,SECONDARY_WEAPONS} from '../dist/balance.js';
import {gunModel,poseHeldKnife,poseHeldSleeves} from '../dist/render.js';
import {inspectDuration,inspectionPose,applyInspection,ringFlourish} from '../dist/view-inspect.js';

const camera=new PerspectiveCamera(63,4/3,.012,4);
const point=new Vector3();
test('every firearm shows the receiver and top with the full weapon framed during the shoulder roll',()=>{
  for(const key of [...PRIMARY_WEAPONS,...SECONDARY_WEAPONS]){
    const rig=new Group(),model=gunModel(key);rig.scale.setScalar(.91);rig.add(model);
    const duration=inspectDuration(key);
    assert.equal(inspectionPose(key,0),null);assert.equal(inspectionPose(key,duration),null);
    assert.equal(inspectionPose(key,Infinity),null);
    const side=(fraction)=>{
      const pose=inspectionPose(key,duration*fraction);
      rig.position.set(.188,-.174,-.422);rig.rotation.set(.012,.025,-.032);applyInspection(rig,pose);
      poseHeldSleeves(model,key,pose.weight,pose.freeHand);
      rig.updateMatrixWorld(true);
      let furthest=0;
      model.userData.body.traverseVisible(mesh=>{
        if(!mesh.isMesh)return;
        const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
          point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);
          furthest=Math.max(furthest,Math.abs(point.x),Math.abs(point.y));
        }
      });
      assert.ok(furthest<1,`${key} clipped at ${fraction}: ${furthest}`);
      const muzzle=new Vector3(0,0,-1).applyQuaternion(rig.quaternion);
      assert.ok(muzzle.x<-.35,key+' keeps the barrel on the left throughout the roll');
      return new Vector3(1,0,0).applyQuaternion(rig.quaternion);
    };
    const first=side(.26),second=side(.76);
    for(const fraction of [.14,.37,.51,.57,.62,.69,.84])side(fraction);
    assert.ok(first.dot(second)<.66,key+' reveals a different surface');
    poseHeldSleeves(model,key);
    assert.equal(model.userData.supportMount.position.length(),0);
  }
});

test('the karambit ring tracks its contact through the spin and cancellation restores the grip',()=>{
  const holder=new Group(),gun=gunModel('knife','karambit'),body=gun.userData.body;
  holder.add(gun);
  for(const age of [0,.11,.25,.37,.50,.68,.85,1.01,2.1,Infinity]){
    poseHeldKnife(holder,gun,'karambit',2,age,.55,1);
    const attachment=gun.userData.hand.userData.fingers[0].b.localToWorld(new Vector3(-.020,0,0));
    body.localToWorld(point.set(.018,-.210,0));
    assert.ok(point.distanceTo(attachment)<1e-8);
  }
  assert.ok(Math.abs(body.rotation.z+2.10)<1e-8);
  assert.ok(Math.abs(ringFlourish(.85).turn+Math.PI*2)<.001);
  const tip=body.localToWorld(new Vector3(-.283,.106,0)).project(camera);
  const ring=body.localToWorld(new Vector3(.018,-.21,0)).project(camera);
  assert.ok(tip.x>ring.x+.20&&tip.y>ring.y+.13,'reverse-grip claw exits to the right and curls upwards');
});

test('knife draws, inspection and alternating slashes show only the blade assembly and right arm',()=>{
  const rig=new Group(),rifle=gunModel('rifle');
  function visibleMeshes(root){
    const ids=[];
    root.traverseVisible(node=>{if(node.isMesh)ids.push(node.id);});
    return ids;
  }
  for(const skin of ['karambit','balisong']){
    const knife=gunModel('knife',skin),{body,hand}=knife.userData,sleeve=hand.userData.sleeve;
    assert.equal(hand.userData.left,false);
    rig.clear();rig.add(knife);
    for(const [draw,inspect,cut,side] of [[0,Infinity,Infinity,1],[.12,Infinity,Infinity,1],
      [Infinity,Infinity,Infinity,1],[Infinity,.37,Infinity,1],[Infinity,Infinity,.10,1],[Infinity,Infinity,.10,-1]]){
      poseHeldKnife(rig,knife,skin,draw,inspect,cut,side,1,.6);
      const pose=inspectionPose(skin,inspect);
      applyInspection(rig,pose);poseHeldSleeves(knife,'knife',pose?.weight,pose?.freeHand);
      const meshes=visibleMeshes(rig);
      for(const part of [body.getObjectByName('blade'),hand,sleeve]){
        assert.ok(visibleMeshes(part).some(id=>meshes.includes(id)),skin+' must show its blade and right arm');
      }
      const expected=[body,hand,sleeve].flatMap(visibleMeshes);
      assert.deepEqual(new Set(meshes),new Set(expected),skin+' must not show a second glove or a detached sleeve');
    }
    rig.clear();rig.add(rifle);poseHeldSleeves(rifle,'rifle');
    const visible=visibleMeshes(rig),support=rifle.userData.support;
    assert.ok(visibleMeshes(support).some(id=>visible.includes(id)));
    assert.ok(visible.includes(support.userData.sleeve.id));
  }
});
