import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Raycaster,Vector3} from '../dist/assets/three.module.min.js';
import {PRIMARY_WEAPONS} from '../dist/balance.js';
import {gunModel,poseHeldSleeves} from '../dist/render.js';
import {opticFit,reflexEngaged} from '../dist/optic-fit.js';
import {makeReflexDot,projectReflexDot,seatReflex} from '../dist/red-dot.js';
import {gunPresentation} from '../dist/weapon-view.js';

const firearms=[...PRIMARY_WEAPONS.filter(key=>key!=='sniper'&&key!=='shotgun'),'pistol'];
function view(id){
  const rig=new Group(),gun=gunModel(id);
  rig.add(gun);rig.scale.setScalar(.91);
  const glass=gun.userData.window;
  function shoulder(aim,kick=0){
    const hip=1-aim,fit=gun.userData.fit;
    rig.position.set(hip*.188,-.174*hip-(fit.sight*.91+.009)*aim,(id==='pistol'?-.35:-.422)+.029*aim+kick*.080);
    rig.rotation.set(.012*hip+.16*kick,.025*hip+.036*kick,-.032*hip+.044*kick);
    seatReflex(rig,id,aim);poseHeldSleeves(gun,id);rig.updateMatrixWorld(true);
  }
  return {rig,gun,glass,shoulder};
}

test('receiver-mounted sights leave the optical axis open and rest on the body',()=>{
  const ray=new Raycaster(),down=new Vector3(0,-1,0),forward=new Vector3(0,0,-1);
  for(const id of firearms){
    const {gun,glass,shoulder}=view(id),fit=opticFit(id);
    const housing=gun.userData.body.getObjectByName('reflex-housing');
    assert.equal(glass.parent,housing.parent);
    const receiver=gun.userData.body.children.filter(mesh=>mesh!==glass.parent);
    // Model-local gun before shoulder transform, using the centre of the clamping shoe.
    ray.set(new Vector3(fit.x,.8,fit.z+.01*fit.scale),down);
    const top=ray.intersectObjects(receiver)[0].point.y;
    assert.ok(Math.abs(top-(fit.y-.050*fit.scale))<.015,id+' mount contact');
    shoulder(1);
    ray.set(new Vector3(),forward);
    const intersections=ray.intersectObject(gun).filter(hit=>hit.object.visible);
    assert.ok(intersections.length>0&&intersections.every(hit=>hit.object===glass),id+' open line of sight');
    assert.ok(Math.abs(intersections[0].distance+fit.eyeZ)<1e-5);
  }
  for(const id of ['sniper','shotgun','revolver','knife']){
    assert.equal(opticFit(id),null);assert.equal(reflexEngaged(id,1),false);
    assert.equal(gunModel(id).getObjectByName('reflex-sight'),undefined);
  }
});

test('the emitted dot remains on the aim ray across aspect ratios and recoil, and clips at the glass edge',()=>{
  const dot=makeReflexDot(),point=new Vector3();
  for(const id of firearms){
    const {rig,glass,shoulder}=view(id);
    for(const [w,h] of [[1920,1080],[1024,768],[800,480]]){
      const camera=new PerspectiveCamera(63,w/h,.012,4);
      let entry=.80;while(!reflexEngaged(id,entry))entry+=.001;
      shoulder(entry);
      assert.ok(projectReflexDot(dot,glass,true,camera,h),id+' HUD yields before the dot reaches the glass');
      for(const kick of [0,.38,.75]){
        shoulder(1,kick);
        assert.ok(projectReflexDot(dot,glass,reflexEngaged(id,1),camera,h),id+' lost dot on recoil');
        dot.getWorldPosition(point).project(camera);
        assert.ok(Math.hypot(point.x*w/2,point.y*h/2)<.1,id+' dot drift');
      }
      rig.position.x+=.15;
      assert.equal(projectReflexDot(dot,glass,true,camera,h),false);
      shoulder(0);
      assert.equal(projectReflexDot(dot,glass,reflexEngaged(id,0),camera,h),false);
    }
  }
});

test('the animated fore-end stays clear of the target at peak ADS recoil on either side',()=>{
  const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1));
  for(const id of firearms){
    const {rig,gun,glass}=view(id),fit=gun.userData.fit,profile=gunPresentation(id);
    for(const side of [-1,1])for(const recoil of [.3,.75,1,1.25]){
      const kick=recoil*.64;
      rig.position.set(0,-fit.sight*.91-.009,(id==='pistol'?-.321:-.393)+kick*profile.push);
      rig.rotation.set(kick*profile.pitch,kick*profile.yaw*side,kick*profile.roll*side);
      seatReflex(rig,id,1);poseHeldSleeves(gun,id);rig.updateMatrixWorld(true);
      const contacts=ray.intersectObject(gun).filter(it=>it.object.visible);
      assert.ok(contacts.length>0&&contacts.every(it=>it.object===glass),id+' obscured target at '+recoil);
    }
  }
});
