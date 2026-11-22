import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import { gunModel, animateHands } from '../dist/render.js';
import { sniperContacts } from '../dist/blaster.js';
import { WEAPONS } from '../dist/balance.js';
import { reloadPose, shotCycle } from '../dist/weapon-view.js';

const front=new T.Vector3(...sniperContacts.support),rear=new T.Vector3(...sniperContacts.grip);
const samePoint=(a,b)=>a.distanceTo(b)<1e-6;
function pose(gun,age=Infinity,progress=0,empty=false){
  const duration=empty ? WEAPONS.sniper.emptyReload : WEAPONS.sniper.reload;
  const p={active:'sniper',reload:progress>0 ? (1-progress)*duration : 0,reloadDuration:duration};
  animateHands(gun,p,reloadPose(p,'sniper'),shotCycle('sniper',age));
}

// The authored anchors must be on both visible meshes. An anchor floating in
// empty space could satisfy all of the animation transform assertions below.
function surfaceDistance(group,anchor){
  group.updateWorldMatrix(true,true);
  const tri=new T.Triangle(),nearest=new T.Vector3();
  let closest=Infinity;
  group.traverse(obj=>{
    if(!obj.isMesh)return;
    const {index,attributes:{position}}=obj.geometry;
    const set=(vec,i)=>vec.fromBufferAttribute(position,index ? index.getX(i) : i).applyMatrix4(obj.matrixWorld);
    const count=index ? index.count : position.count;
    for(let i=0;i<count;i+=3){
      set(tri.a,i);set(tri.b,i+1);set(tri.c,i+2);
      const distance=tri.closestPointToPoint(anchor,nearest).distanceTo(anchor);
      if(distance<closest)closest=distance;
    }
  });
  return closest;
}

test('the Lookout fore-end and rear grip meet the actual glove surfaces at rest',()=>{
  const {body,support,strong}=gunModel('sniper').userData;
  for(const [hand,point] of [[support,front],[strong,rear]]){
    assert.ok(samePoint(hand.position,point));
    const bodyGap=surfaceDistance(body,point),handGap=surfaceDistance(hand,point);
    assert.ok(bodyGap<.004,'body surface gap '+bodyGap);
    assert.ok(handGap<.013,'glove surface gap '+handGap);
  }
});

test('the forward hand remains planted while the rear hand follows the moving bolt',()=>{
  const g=gunModel('sniper'),{support,strong,bolt}=g.userData;
  for(let i=0;i<=110;i++){
    const sec=i/120;
    pose(g,sec);
    assert.ok(samePoint(support.position,front));
    if(sec>.15 && sec<.72){
      const knob=new T.Vector3(...sniperContacts.bolt).applyMatrix4(bolt.matrix);
      assert.ok(samePoint(strong.position,knob));
    }
  }
  assert.ok(samePoint(strong.position,rear));
});

test('a hand supports the rifle throughout both reloads and the other hand carries the magazine',()=>{
  const g=gunModel('sniper'),{support,strong,magazine,magGrip}=g.userData;
  for(const empty of [true,false]){
    for(let i=0;i<=300;i++){
      const t=i/300;
      pose(g,Infinity,t,empty);
      assert.ok(samePoint(support.position,front)||samePoint(strong.position,rear),'unsupported at '+t);
      if(t>.19 && t<.63){
        assert.ok(samePoint(support.position,magGrip.clone().applyMatrix4(magazine.matrix)));
      }
    }
    assert.ok(samePoint(support.position,front) && samePoint(strong.position,rear));
  }
});
