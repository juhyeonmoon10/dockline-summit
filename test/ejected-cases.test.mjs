import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Scene} from '../dist/assets/three.module.min.js';
import {EjectedCases} from '../dist/ejected-cases.js';
import {SHOT_MECHANIC} from '../dist/weapon-view.js';

test('cases leave from the displayed weapon and remain in world space after a camera turn',()=>{
  const scene=new Scene(),cases=new EjectedCases(scene),held=new Group(),cam=new PerspectiveCamera();
  held.position.set(.3,-.1,-.5);cam.position.set(8,2,4);cam.updateMatrixWorld();
  cases.queue({weapon:'rifle',seq:5},1);cases.frame('rifle',held,cam,1,1,.016);
  const m=scene.children.find(x=>x.visible);
  assert.ok(Math.abs(m.position.x-8.355)<1e-8);
  cam.position.x=-50;cam.rotation.y=Math.PI;cam.updateMatrixWorld();
  cases.frame('rifle',held,cam,1,1.03,.03);assert.ok(m.position.x>8.355);
  cases.clear();assert.ok(scene.children.every(x=>!x.visible));
});

test('pump and bolt ejection wait for the action, and switching discards a pending case',()=>{
  for(const weapon of ['shotgun','sniper']){
    const scene=new Scene(),cases=new EjectedCases(scene),held=new Group(),cam=new PerspectiveCamera();
    const opened=SHOT_MECHANIC[weapon].open;
    cases.queue({weapon,seq:1},0);cases.frame(weapon,held,cam,1,opened-.01,.02);
    assert.ok(scene.children.every(x=>!x.visible));
    cases.frame(weapon,held,cam,1,opened,.01);assert.equal(scene.children.filter(x=>x.visible).length,1);
    cases.clear();cases.queue({weapon,seq:2},1);cases.frame('knife',held,cam,1,1.01,.01);
    cases.frame(weapon,held,cam,1,1+opened,.016);assert.ok(scene.children.every(x=>!x.visible));
  }
});
