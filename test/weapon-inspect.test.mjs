import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Vector3} from '../dist/assets/three.module.min.js';
import {PRIMARY_WEAPONS} from '../dist/balance.js';
import {gunModel,poseHeldKnife,poseHeldSleeves} from '../dist/render.js';
import {inspectDuration,inspectionPose,applyInspection,ringFlourish} from '../dist/view-inspect.js';

const camera=new PerspectiveCamera(63,4/3,.012,4);
const point=new Vector3();
test('every firearm reveals both sides with the complete weapon inside a 4:3 match view',()=>{
  for(const key of [...PRIMARY_WEAPONS,'pistol']){
    const rig=new Group(),model=gunModel(key);rig.scale.setScalar(.91);rig.add(model);
    const duration=inspectDuration(key);
    assert.equal(inspectionPose(key,0),null);assert.equal(inspectionPose(key,duration),null);
    assert.equal(inspectionPose(key,Infinity),null);
    const side=(fraction)=>{
      const pose=inspectionPose(key,duration*fraction);
      rig.position.set(0,0,0);rig.rotation.set(0,0,0);applyInspection(rig,pose);
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
      return new Vector3(1,0,0).applyQuaternion(rig.quaternion).z;
    };
    const front=side(.26),back=side(.76);
    assert.ok(front<-.70&&back>.70,key+' shows opposite cheeks');
    poseHeldSleeves(model,key);
    assert.equal(model.userData.supportMount.position.length(),0);
  }
});

test('the karambit ring tracks its contact through the spin and cancellation restores the grip',()=>{
  const holder=new Group(),gun=gunModel('knife','karambit'),body=gun.userData.body;
  holder.add(gun);
  for(const age of [.37,.50,.68,.85,1.01]){
    poseHeldKnife(holder,gun,'karambit',2,age,.55,1);
    const {grip}=ringFlourish(age);
    point.set(.018,-.210,0).applyQuaternion(body.quaternion).add(body.position);
    assert.ok(point.distanceTo(new Vector3(.018-.012*grip,-.210+.171*grip,-.006*grip))<1e-8);
  }
  poseHeldKnife(holder,gun,'karambit',2,Infinity,.55,1);
  assert.equal(body.rotation.z,0);assert.equal(body.position.length(),0);
});
