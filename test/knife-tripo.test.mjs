import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../dist/assets/three.module.min.js';
import {animateKnife,knifeMesh} from '../dist/knife.js';
import {loadCarriedArmory} from '../dist/armory-data.js';
import {KARAMBIT_RING} from '../dist/knife-types.js';

test('the imported karambit leaves clearance around the finger throughout its ring',async()=>{
  const knife=knifeMesh('karambit');
  assert.equal(await knife.userData.armoryReady,true);
  knife.updateMatrixWorld(true);
  const [cx,cy]=KARAMBIT_RING;
  for(const side of [-1,1])for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    const ray=new T.Raycaster(new T.Vector3(cx+.021*Math.cos(a),cy+.021*Math.sin(a),side),new T.Vector3(0,0,-side));
    assert.equal(ray.intersectObject(knife,true).length,0);
  }
  assert.ok(knife.getObjectByName('blade').geometry.attributes.uv.count>100);
  assert.ok(Object.values(await loadCarriedArmory('karambit')).every(part=>part.index.length>0));
});

test('the imported balisong keeps both pins attached when it opens and folds',async()=>{
  const knife=knifeMesh('balisong');
  assert.equal(await knife.userData.armoryReady,true);
  const blade=knife.getObjectByName('blade'),handle=knife.getObjectByName('handle'),fixed=knife.getObjectByName('grip');
  const secondPin=handle.position.clone().sub(blade.position),firstPin=fixed.position.clone();
  for(const age of [.24,.47,.78,1.32]){
    animateKnife(knife,'balisong',Infinity,age);
    knife.updateMatrixWorld(true);
    assert.ok(blade.localToWorld(secondPin.clone()).distanceTo(handle.position)<1e-6);
    assert.ok(fixed.position.distanceTo(firstPin)<1e-6);
  }
  for(const node of [blade,handle,fixed]){
    assert.ok(node.geometry.attributes.uv.count>100);
    assert.ok(node.userData.previewGeometry.index.count<node.geometry.index.count);
  }
  assert.ok(Object.values(await loadCarriedArmory('balisong')).every(part=>part.index.length>0));
});
