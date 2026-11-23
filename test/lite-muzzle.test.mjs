import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiteRenderer} from '../dist/lite.js';
import {decodeLiteOperator,liteOperator} from '../dist/lite-operator.js';
import {fieldViews} from '../dist/assets/field-frames.js';
import {ImpactParticlePool} from '../dist/surface-fx.js';
import {singleShotSpan} from '../dist/shot-path.js';

test('every carried gun emits at the centre of a face on its posed barrel',()=>{
  const team=liteOperator(0),previous=team.model;
  const bytes=readFileSync(new URL('../dist/assets/customs-guard.lite.bin',import.meta.url));
  team.model=decodeLiteOperator(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  try{
    const scene=Object.assign(Object.create(LiteRenderer.prototype),{
      operatorStates:new Map(),meleeSwings:new Map(),remoteMuzzles:new Map(),
    });
    for(const active of Object.keys(fieldViews))for(const pitch of [-.6,.5]){
      const player={id:'remote',team:0,x:2,y:.3,z:4,yaw:.86,pitch,slide:pitch>0?.3:0,active,grounded:true};
      const faces=[];
      // A shooter behind the camera can still fire a visible shot into the view.
      scene.remoteOperator(faces,player,{x:2,y:1,z:0,sp:0,cp:1,sy:0,cy:1},.72,true);
      const {tip}=scene.remoteMuzzles.get(player.id);
      assert.ok(faces.some(({vertices})=>{
        const centre=vertices.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/vertices.length),[0,0,0]);
        return Math.hypot(centre[0]-tip.x,centre[1]-tip.y,centre[2]-tip.z)<1e-7;
      }),active);
      const behind=faces.flatMap(({vertices})=>vertices).map(([x,y,z])=>
        (x-tip.x)*tip.forward.x+(y-tip.y)*tip.forward.y+(z-tip.z)*tip.forward.z);
      assert.ok(Math.abs(Math.max(...behind))<1e-7,active+' points out of its opening');
    }
  }finally{team.model=previous;}
});

test('Lite releases from the resting cap, follows its pictured axis and keeps the shot independent of recoil',()=>{
  const map={width:60,depth:60,boxes:[],ramps:[]};
  const cam={x:0,y:1.5,z:0,sy:0,cy:1,sp:0,cp:1},sheet={complete:true,naturalWidth:1280};
  for(const [kind,entry] of Object.entries(fieldViews))for(const aim of [0,.58,1]){
    const focus={id:'self',active:kind,alive:true,reload:0,speed:0};
    const scene=Object.assign(Object.create(LiteRenderer.prototype),{
      map,aim,width:425,height:239,focal:208,shotAge:0,shotWeapon:kind,recoil:0,
      fieldAtlas:sheet,stillAtlases:{[kind]:sheet},motionAtlas:{[kind]:sheet,magazines:sheet},
      pellets:[{}],pelletIndex:0,trails:[],shotImpacts:[],remoteFlashes:new Map(),remoteMuzzles:new Map(),
    });
    const pose=scene.gunPose(focus,2),muzzle=scene.viewMuzzle(cam,pose,pose.depth);
    const ref=entry.muzzles.find(sample=>sample===pose.uv);
    assert.ok(ref&&ref.length===6,kind+' uses its still tile on release');
    const path={type:'shot',actor:'self',weapon:kind,x:0,y:1.5,z:0,ex:-.18,ey:1.55,ez:-24};
    scene.addShot(path,focus,cam,muzzle,Boolean(aim),2,pose);
    const shot=kind==='shotgun'?scene.pellets[0]:scene.trails[0];
    assert.deepEqual([shot.x,shot.y,shot.z],[muzzle.x,muzzle.y,muzzle.z]);
    assert.ok(shot.departure,kind);
    const bend=shot.departure,screen=scene.project([bend.x,bend.y-cam.y,-bend.z,0,0]);
    const ax=(ref[3]-ref[0])*pose.gunWidth,ay=(ref[4]-ref[1])*scene.height;
    const dx=screen[0]-pose.x,dy=screen[1]-pose.y;
    assert.ok(ax*dx+ay*dy>0 && Math.abs(ax*dy-ay*dx)<1e-6,kind+' leaves the bore forwards');
    const previous={...scene.localFlash.origin};focus.speed=5;scene.recoil=.8;scene.shotAge=.034;
    scene.gunPose(focus,2.034);assert.deepEqual(scene.localFlash.origin,previous);
    const behind={...path,ex:0,ey:1.5,ez:-.16};
    scene.trails=[];scene.pelletIndex=0;scene.shotImpacts=[];
    scene.addShot(behind,focus,cam,muzzle,Boolean(aim),3,pose);
    assert.equal(scene.shotImpacts.length,0,'no wall or target at this point in empty space');
    assert.equal(scene.trails.length+scene.pelletIndex,0);
  }
});

test('Lite fires the contact once at the clipped wall when a frame jumps beyond trail expiry',()=>{
  const scene=Object.assign(Object.create(LiteRenderer.prototype),{
    map:{width:40,depth:40,ramps:[],boxes:[{x:0,z:-5,w:3,d:1,h:3,kind:'crate'}]},
    shotImpacts:[],trails:[],dummyHits:new Map(),remoteMuzzles:new Map(),remoteFlashes:new Map(),
    surfaceMarks:[{until:0}],nextMark:0,surfaceParticles:new ImpactParticlePool(16),
  });
  const shot={actor:'remote',seq:12,weapon:'pistol',x:0,y:1.2,z:0,ex:0,ey:1.2,ez:-9};
  scene.addShot(shot,{id:'local'},null,null,false,2,null,'target-behind-crate');
  assert.equal(scene.shotImpacts.length,1);const contact=scene.shotImpacts[0];
  assert.equal(contact.hit.kind,'wood');assert.equal(contact.end.target,null);
  assert.equal(contact.due,2+singleShotSpan(4.5,0,'pistol').arrivalTime);
  scene.releaseImpacts(contact.due-.001);assert.equal(scene.nextMark,0);
  scene.releaseImpacts(2.16);assert.equal(scene.nextMark,1);assert.ok(scene.surfaceParticles.particles.some(p=>p.active));
  scene.releaseImpacts(2.25);assert.equal(scene.nextMark,1);assert.equal(scene.shotImpacts.length,0);
  assert.equal(scene.dummyHits.size,0);
});

test('Lite pairs a target contact with the confirmed shot and flashes the dummy on arrival',()=>{
  const scene=Object.assign(Object.create(LiteRenderer.prototype),{
    map:{width:35,depth:42,ramps:[],boxes:[]},surfaceParticles:new ImpactParticlePool(12),
    shotImpacts:[],trails:[],dummyHits:new Map(),remoteMuzzles:new Map(),remoteFlashes:new Map(),surfaceMarks:[],nextMark:0,
  });
  const shot={actor:'self',seq:1,weapon:'sniper',x:0,y:1.4,z:0,ex:0,ey:1.4,ez:-9};
  scene.addShot(shot,{id:'self',active:'sniper'},null,null,true,1,null,'dummy');
  const due=scene.shotImpacts[0].due;scene.releaseImpacts(due-.001);assert.equal(scene.dummyHits.size,0);
  scene.releaseImpacts(due);assert.ok(scene.dummyHits.get('dummy')>due);assert.equal(scene.nextMark,0);
});

test('calibrated first-person cap pixels and their depth survive camera pitch and aspect',()=>{
  for(const [w,h] of [[425,239],[320,240],[640,260]])for(const pitch of [-.65,.6]){
    const yaw=1.3,cam={x:1,y:2,z:3,sy:Math.sin(yaw),cy:Math.cos(yaw),sp:Math.sin(pitch),cp:Math.cos(pitch)};
    const scene=Object.assign(Object.create(LiteRenderer.prototype),{width:w,height:h,focal:h*.9});
    for(const info of Object.values(fieldViews))for(const [u,v,depth] of info.muzzles){
      assert.ok(Number.isFinite(depth)&&depth>0);
      const screen={x:u*w,y:v*h},tip=scene.viewMuzzle(cam,screen,depth);
      const dx=tip.x-cam.x,dy=tip.y-cam.y,dz=tip.z-cam.z,forward=dx*cam.sy-dz*cam.cy;
      const [x,y]=scene.project([dx*cam.cy+dz*cam.sy,dy*cam.cp-forward*cam.sp,forward*cam.cp+dy*cam.sp,0,0]);
      assert.ok(Math.hypot(x-screen.x,y-screen.y)<1e-8);
    }
  }
});

test('cold viewmodels and operators still have visible barrel sockets while their art loads',()=>{
  const pending={complete:false,naturalWidth:0},cam={x:0,y:1.55,z:0,sy:0,cy:1,sp:0,cp:1};
  const scene=Object.assign(Object.create(LiteRenderer.prototype),{
    width:425,height:239,focal:210,aim:0,shotAge:0,recoil:0,fieldAtlas:pending,blasterAtlas:pending,arcadeAtlas:pending,
    motionAtlas:{},stillAtlases:{},remoteMuzzles:new Map(),operatorStates:new Map(),meleeSwings:new Map(),
  });
  const model=liteOperator(0),previous=model.model;model.model=null;
  try{
    for(const active of Object.keys(fieldViews)){
      const player={id:'a',active,team:0,x:0,y:0,z:-3,yaw:0,pitch:.3,alive:true,speed:0};
      const pose=scene.gunPose(player,1),tip=scene.viewMuzzle(cam,pose,pose.depth??.9),forward=scene.viewForward(cam,pose,tip);
      assert.ok(pose&&Number.isFinite(forward.x)&&forward.z<0,active);
      const meshes=[];scene.remoteOperator(meshes,player,cam,1,true);
      assert.ok(meshes.length>8 && scene.remoteMuzzles.get('a').tip.forward.z<0,active);
    }
  }finally{model.model=previous;}
});
