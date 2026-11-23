import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Vector3} from '../dist/assets/three.module.min.js';
import {WEAPONS} from '../dist/balance.js';
import {KARAMBIT_RING,KNIFE_TIMING} from '../dist/knife-types.js';
import {knifePose,knifeAttackDuration,knifeDrawPose,knifeClipPhase} from '../dist/knife-motion.js';
import {gunModel,poseHeldKnife} from '../dist/render.js';
import {applyInspection,inspectionPose,inspectDuration} from '../dist/view-inspect.js';

const skins=Object.keys(KNIFE_TIMING),contact=WEAPONS.knife.windup;
const camera=new PerspectiveCamera(63,4/3,.012,4);

test('the alternating attacks cross in opposite directions on the simulation contact beat',()=>{
  for(const skin of skins){
    const timing=KNIFE_TIMING[skin],end=knifeAttackDuration(skin);
    assert.equal(inspectDuration(skin),timing.inspect);
    assert.deepEqual(knifeDrawPose(skin,timing.draw),knifeDrawPose(skin,Infinity));
    assert.ok(knifeDrawPose(skin,timing.drawCatch).grip<.1);
    assert.ok(Math.abs(knifeClipPhase(contact,skin)-.56)<1e-9);
    const a=knifePose(contact,1,skin),b=knifePose(contact,-1,skin);
    assert.ok(a.x<-.18&&a.rz>.85&&b.rz<-1);
    assert.ok(a.z<-.12&&b.z<-.12);
    for(const side of [-1,1]){
      assert.deepEqual(knifePose(end,side,skin),knifePose(Infinity,side,skin));
      assert.equal(knifeClipPhase(end,skin),1);
    }
  }
});

test('the grip stays physically attached through draws, flourishes, interruption and alternating slashes',()=>{
  for(const skin of skins){
    const rig=new Group(),model=gunModel('knife',skin),{body,hand}=model.userData;
    rig.scale.setScalar(.91);rig.add(model);
    const butterfly=skin==='balisong',anchor=butterfly?hand:hand.userData.fingers[0].b;
    const onHand=butterfly?[.004,-.063,.002]:[-.020,0,0],onKnife=butterfly?[-.015,-.075,0]:KARAMBIT_RING;
    function pose(draw,inspect,cut,side){
      poseHeldKnife(rig,model,skin,draw,inspect,cut,side);
      if(cut===Infinity)applyInspection(rig,inspectionPose(skin,inspect));
      rig.updateMatrixWorld(true);
      const gap=anchor.localToWorld(new Vector3(...onHand)).distanceTo(body.localToWorld(new Vector3(...onKnife)));
      assert.ok(gap<1e-7,skin+' grip error '+gap);
      return body.matrixWorld.toArray();
    }
    for(let i=0;i<=30;i++){
      pose(i/30*KNIFE_TIMING[skin].draw,Infinity,Infinity,1);
      pose(Infinity,i/30*inspectDuration(skin),Infinity,1);
    }
    for(const side of [-1,1]){
      for(const age of [.024,contact,.146,.265]){
        const fresh=pose(Infinity,Infinity,age,side);
        assert.deepEqual(pose(.12,.32,age,side),fresh);
      }
    }
  }
});

test('actual blade meshes fit the narrow 4:3 weapon camera at every contact and showcase beat',()=>{
  for(const skin of skins){
    const rig=new Group(),model=gunModel('knife',skin),pt=new Vector3();
    rig.scale.setScalar(.91);rig.add(model);
    for(const action of [0,1,-1]){
      for(let i=0;i<=30;i++){
        const t=i/30,cut=action?knifeAttackDuration(skin)*t:Infinity;
        const look=action?Infinity:inspectDuration(skin)*t;
        poseHeldKnife(rig,model,skin,Infinity,look,cut,action||1);
        applyInspection(rig,inspectionPose(skin,look));rig.updateMatrixWorld(true);
        const part=model.userData.body.getObjectByName('blade'),positions=part.geometry.attributes.position;
        for(let vertex=0;vertex<positions.count;vertex+=5){
          pt.fromBufferAttribute(positions,vertex).applyMatrix4(part.matrixWorld).project(camera);
          assert.ok(Math.abs(pt.x)<1&&Math.abs(pt.y)<1,skin+' blade clipped at '+t);
        }
      }
    }
  }
});
