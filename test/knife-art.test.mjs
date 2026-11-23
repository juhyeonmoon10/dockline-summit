import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {knifeMesh,animateKnife} from '../dist/knife.js';
import {knifeParts,knifeAngles,knifePartPose} from '../dist/knife-art.js';

test('the karambit has a through-ring and the balisong has open scale windows on both faces',()=>{
  for(const [id,points] of [
    ['karambit',[[.018,-.210,false],[.058,-.210,true]]],
    ['balisong',[[-.050,0,false],[-.063,0,true],[-.061,-.090,true]]],
  ]){
    const model=knifeMesh(id);model.updateMatrixWorld(true);
    for(const [x,y,solid] of points)for(const z of [-1,1]){
      const ray=new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(0,0,-z));
      assert.equal(ray.intersectObject(model,true).length>0,solid,id+' '+[x,y,z].join(','));
    }
  }
});

test('steel, cast metal, rubber and both curved inserts keep their own finishes after cloning',()=>{
  const karambit=knifeMesh('karambit'),balisong=knifeMesh('balisong');
  const steel=karambit.getObjectByName('blade').material,rubber=karambit.getObjectByName('grip').material;
  const fasteners=karambit.getObjectByName('fittings').material;
  const fixed=balisong.getObjectByName('grip'),moving=balisong.getObjectByName('handle');
  assert.ok(!Array.isArray(steel));
  assert.ok(steel.metalness>fasteners.metalness&&fasteners.metalness>rubber.metalness);
  assert.ok(rubber.roughness>steel.roughness);
  for(const handle of [fixed,moving]){
    assert.equal(handle.material[0],fasteners);
    assert.ok(handle.material[1].metalness<fasteners.metalness);
    assert.ok(handle.material[1].normalMap&&handle.material[1].roughnessMap);
    const [frame,inlay]=handle.geometry.groups;
    assert.ok(frame.count>0&&inlay.count>0);
    assert.equal(inlay.start+inlay.count,handle.geometry.index.count);
  }
  assert.ok(steel.normalMap&&steel.roughnessMap&&rubber.normalMap&&rubber.roughnessMap);
});

test('the independent balisong pivots stay on the moving tang and reset after inspection',()=>{
  const a=knifeMesh('balisong'),b=knifeMesh('balisong'),parts=knifeParts('balisong');
  const fixed=a.getObjectByName('grip'),blade=a.getObjectByName('blade'),handle=a.getObjectByName('handle');
  const initial=handle.position.clone(),pin=initial.clone().sub(blade.position);
  for(const [draw,inspect] of [[0,Infinity],[.24,Infinity],[Infinity,.8],[Infinity,1.51],[Infinity,2.24],[Infinity,3.25]]){
    animateKnife(a,'balisong',draw,inspect);a.updateMatrixWorld(true);
    assert.ok(blade.localToWorld(pin.clone()).distanceTo(handle.position)<1e-8);
    if(inspect===1.51){
      const frame=new T.Box3().setFromObject(fixed,true).union(new T.Box3().setFromObject(handle,true));
      const folded=new T.Box3().setFromObject(blade,true);
      assert.ok(folded.min.y>=frame.min.y,'closed blade stays inside the handle silhouette');
    }
    const angles=knifeAngles('balisong',draw,inspect);
    for(const p of parts){
      const node=a.getObjectByName(p.name),pose=knifePartPose(p,angles);
      assert.ok(node.position.distanceTo(new T.Vector3(pose.x,pose.y,pose.z))<1e-8);
      assert.equal(node.rotation.z,pose.rz);
    }
    assert.equal(fixed.rotation.z,0);
    assert.ok(Math.abs(b.getObjectByName('handle').rotation.z)<1e-8);
  }
  assert.equal(handle.rotation.z,0);assert.ok(handle.position.distanceTo(initial)<1e-8);
  assert.equal(a.getObjectByName('blade').geometry,b.getObjectByName('blade').geometry);
});
