import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Raycaster,Vector3} from '../dist/assets/three.module.min.js';
import {gunModel,animateHands,poseHeldSleeves,shoulderIron} from '../dist/render.js';
import {fittedIronTip,gunFit} from '../dist/gun-fit.js';
import {loadGunAppearance} from '../dist/blaster.js';
import {shotCycle,reloadPose} from '../dist/weapon-view.js';
import {REVOLVER_RELOAD_CONTACT as marks} from '../dist/revolver-timing.js';

test('both iron sights put their actual front tip directly under the target',async()=>{
  for(const [id,loaded] of [['shotgun',true],['revolver',false],['revolver',true]]){
    const model=gunModel(id),rig=new Group(),ray=new Raycaster(new Vector3(),new Vector3(0,0,-1));
    const body=model.userData.body;
    if(loaded)await loadGunAppearance(body);
    const fit=gunFit[id];rig.add(model);rig.scale.setScalar(.91);
    rig.position.set(0,-fit.sight*.91-.009,id==='shotgun'?-.393:-.321);
    shoulderIron(rig,id,1,body);poseHeldSleeves(model,id);rig.updateMatrixWorld(true);
    assert.equal(model.getObjectByName('reflex-window'),undefined);
    assert.equal(ray.intersectObject(rig).filter(hit=>hit.object.visible).length,0,id+' blocks the target');
    for(const [w,h] of [[1920,1080],[1024,768]]){
      const camera=new PerspectiveCamera(63,w/h,.012,4);
      const p=model.localToWorld(new Vector3(...fittedIronTip(id,body))).project(camera);
      assert.ok(Math.abs(p.x*w/2)<.01&&p.y*h/2<0&&p.y*h/2>-.85,id+' iron tip offset');
    }
  }
});

test('the cylinder opens clear of the frame, the loader seats, and interruption resets the pose',()=>{
  const gun=gunModel('revolver'),{action,loader,support}=gun.userData,hub=new Vector3();
  const pose=(t,ammo=4,shotAge=Infinity)=>{
    const player={ammo,reload:t==null?0:1-t,reloadDuration:1};
    animateHands(gun,player,reloadPose(player,'revolver'),shotCycle('revolver',shotAge));
    gun.updateMatrixWorld(true);
  };
  assert.equal(gun.userData.magazine,undefined);
  const cylinder=gun.userData.body.userData.photoCylinder??{rear:-.020,scale:1};
  pose(marks.open+.001);action.drum.getWorldPosition(hub);assert.ok(hub.x<-.078*cylinder.scale);
  assert.ok(action.inserts.visible);pose(marks.eject+.001);assert.equal(action.inserts.visible,false);
  pose(marks.seat+.001);assert.ok(loader.visible&&action.inserts.visible);
  const alignment=action.drum.localToWorld(new Vector3(0,0,cylinder.rear));
  assert.ok(Math.hypot(loader.position.x-alignment.x,loader.position.y-alignment.y)<.001);
  pose(marks.close+.001);assert.equal(action.hinge.rotation.z,0);
  for(const t of [.18,.45,.65,.81]){
    pose(t);pose(null);assert.ok(!loader.visible&&action.inserts.visible);
    assert.equal(support.position.length(),0);assert.equal(action.hinge.rotation.z,0);
  }
  pose(null,5,0);const before=action.drum.rotation.z;
  pose(null,5,.025);assert.ok(action.hammer.rotation.x<-.35);
  pose(null,5,.2);assert.ok(Math.abs(action.drum.rotation.z-before-Math.PI/3)<1e-6);
  assert.equal(Math.abs(action.hammer.rotation.x),0);
});
