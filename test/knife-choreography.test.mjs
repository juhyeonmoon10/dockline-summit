import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Vector3} from '../dist/assets/three.module.min.js';
import {WEAPONS} from '../dist/balance.js';
import {KARAMBIT_RING,KNIFE_TIMING} from '../dist/knife-types.js';
import {knifePose,knifeAttackDuration,knifeDrawPose,knifeClipPhase} from '../dist/knife-motion.js';
import {gunModel,poseHeldKnife,poseHeldSleeves} from '../dist/render.js';
import {createCanvasPreview} from '../dist/armory-canvas.js';
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
    assert.ok(end<WEAPONS.knife.interval);
    const rig=new Group(),model=gunModel('knife',skin);
    rig.scale.setScalar(.91);rig.add(model);
    const blade=model.userData.body.getObjectByName('blade'),vertices=blade.geometry.attributes.position;
    const extent=i=>skin==='balisong'?vertices.getY(i):-vertices.getX(i);
    let tipIndex=0;
    for(let i=1;i<vertices.count;i++)if(extent(i)>extent(tipIndex))tipIndex=i;
    const tip=new Vector3().fromBufferAttribute(vertices,tipIndex),projected=new Vector3();
    for(const side of [-1,1]){
      for(const aspect of [4/3,16/9]){
        const lens=new PerspectiveCamera(63,aspect,.012,4);
        const at=age=>{
          poseHeldKnife(rig,model,skin,Infinity,Infinity,age,side);
          return blade.localToWorld(projected.copy(tip)).project(lens);
        };
        const hit=at(contact);
        assert.ok(Math.hypot(hit.x,hit.y)<.006,skin+' tip crosses the reticle on impact');
        const before=at(contact-.016).x,after=at(contact+.016).x;
        assert.ok((before-after)*side>.10,skin+' must travel through contact');
        const xs=[];
        for(let frame=0;frame<=60;frame++)xs.push(at(end*frame/60).x);
        assert.ok(Math.max(...xs)-Math.min(...xs)>1.03,skin+' spans over half the viewport width');
      }
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

test('the glove leaves the compact claw visible at ready, inspection catch and both hits',()=>{
  const rig=new Group(),model=gunModel('knife','karambit');
  rig.scale.setScalar(.91);rig.add(model);
  const blade=model.userData.body.getObjectByName('blade'),isolated=blade.clone();
  isolated.matrixAutoUpdate=false;
  let pixels;
  const ctx={
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData:img=>{pixels=new Uint32Array(img.data.buffer);}
  };
  const preview=createCanvasPreview({width:192,height:144,getContext:()=>ctx});
  for(const [inspect,cut,side] of [[Infinity,Infinity,1],[KNIFE_TIMING.karambit.inspectCatch,Infinity,1],
    [Infinity,contact,1],[Infinity,contact,-1]]){
    poseHeldKnife(rig,model,'karambit',Infinity,inspect,cut,side);
    applyInspection(rig,inspectionPose('karambit',inspect));poseHeldSleeves(model,'knife');
    preview.render(rig,1,63);
    const handAndKnife=pixels.slice();
    isolated.matrix.copy(blade.matrixWorld);preview.render(isolated,1,63);
    let silhouette=0,visible=0;
    for(let i=0;i<pixels.length;i++)if(pixels[i]){
      silhouette++;
      if(pixels[i]===handAndKnife[i])visible++;
    }
    assert.ok(visible>pixels.length*.006,'the blade presents a readable face to the camera');
    assert.ok(visible>silhouette*.78,'the glove must reveal the heel and curve of the claw');
  }
});
