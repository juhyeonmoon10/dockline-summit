import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Vector3} from '../dist/assets/three.module.min.js';
import {PRIMARY_WEAPONS,SECONDARY_WEAPONS} from '../dist/balance.js';
import {gunModel,poseHeldKnife,poseHeldSleeves} from '../dist/render.js';
import {inspectDuration,inspectionPose,applyInspection,ringFlourish} from '../dist/view-inspect.js';
import {KARAMBIT_RING,KNIFE_TIMING} from '../dist/knife-types.js';

const camera=new PerspectiveCamera(63,4/3,.012,4);
const point=new Vector3();
test('draw and inspect move the grip across the view even after the blade has entered frame',()=>{
  const wide=new PerspectiveCamera(63,16/9,.012,4);
  for(const skin of ['karambit','balisong']){
    const rig=new Group(),model=gunModel('knife',skin),hand=model.userData.hand;
    rig.scale.setScalar(.91);rig.add(model);
    for(const action of ['draw','inspect']){
      let left=Infinity,right=-Infinity;
      for(let frame=action==='draw'?12:0;frame<=60;frame++){
        const age=KNIFE_TIMING[skin][action]*frame/60;
        const look=action==='inspect'?age:Infinity;
        poseHeldKnife(rig,model,skin,action==='draw'?age:Infinity,look,Infinity,1);
        applyInspection(rig,inspectionPose(skin,look));
        const x=hand.localToWorld(point.copy(hand.userData.wrist)).project(wide).x;
        left=Math.min(left,x);right=Math.max(right,x);
      }
      const width=(right-left)/2;
      assert.ok(width>(action==='draw'?1/6:.23),skin+' '+action+' wrist sweep '+width);
    }
  }
});

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
  poseHeldKnife(holder,gun,'karambit',Infinity,Infinity,Infinity,1);
  const closed=body.quaternion.clone();
  for(const age of [0,.11,.25,.37,.50,.68,.85,1.01,2.1,Infinity]){
    poseHeldKnife(holder,gun,'karambit',2,age,.55,1);
    const attachment=gun.userData.hand.userData.fingers[0].b.localToWorld(new Vector3(-.020,0,0));
    body.localToWorld(point.fromArray(KARAMBIT_RING));
    assert.ok(point.distanceTo(attachment)<1e-8);
  }
  assert.ok(body.quaternion.angleTo(closed)<1e-7);
  assert.ok(ringFlourish(.545).turn < -Math.PI*2 && ringFlourish(.545).grip>.8);
  assert.equal(ringFlourish(1.135).turn,-Math.PI*4);
  assert.equal(ringFlourish(1.135).grip,0);
  const blade=body.getObjectByName('blade'),vertices=blade.geometry.attributes.position;
  let tipIndex=0;
  for(let i=1;i<vertices.count;i++)if(vertices.getX(i)<vertices.getX(tipIndex))tipIndex=i;
  const tip=blade.localToWorld(new Vector3().fromBufferAttribute(vertices,tipIndex)).project(camera);
  const ring=body.localToWorld(new Vector3(...KARAMBIT_RING)).project(camera);
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
