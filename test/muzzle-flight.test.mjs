import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {ArenaRenderer} from '../dist/render.js';
import {PelletRenderer} from '../dist/pellet-render.js';
import {WorldImpacts} from '../dist/world-impacts.js';
import {flightSlices,muzzleDeparture,exitsForward,SHOT_TRAIL_LIFE} from '../dist/shot-path.js';
import {shotKickResponse} from '../dist/weapon-view.js';

const map={width:50,depth:50,boxes:[],ramps:[]};
const v=(x,y,z)=>new T.Vector3(x,y,z);

test('a visible shot leaves the rendered cap along the bore before recoil, even when the target projects behind the barrel silhouette',()=>{
  for(const weapon of ['rifle','shotgun','sniper','smg','burst','marksman','lmg','pistol']){
    const cap=v(.24,1.40,-1.1),bore=v(-.04,.03,-1).normalize(),end=v(1.6,.5,-19);
    const scene=new T.Scene(),material=new T.MeshBasicMaterial();
    const mesh=new T.Mesh(new T.CylinderGeometry(1,1,1),material);
    const tracer={mesh,flightMesh:mesh.clone(),ttl:0,start:v(0,0,0),end:v(0,0,0)};
    const renderer=Object.assign(Object.create(ArenaRenderer.prototype),{
      map,flash:new T.Group(),sightFlare:new T.Group(),flashTime:.016,viewMuzzle:cap,viewForward:bore,res:{h:600},tracers:[tracer],traceIndex:0,
      impacts:new WorldImpacts(scene,()=>{}),shotTrails:new PelletRenderer(scene),
    });
    const camera=new T.PerspectiveCamera();camera.position.set(0,1.55,0);camera.updateMatrixWorld();
    const player={id:'self',active:weapon,alive:true};
    const event={actor:player.id,seq:10,weapon,x:0,y:1.55,z:0,ex:end.x,ey:end.y,ez:end.z};
    renderer.shotsThisFrame=[{event,mine:true}];renderer.renderShots({players:[player]},player,camera);
    assert.equal(shotKickResponse(0,weapon),0);
    const crest=shotKickResponse(.022,weapon);
    assert.ok(crest>0 && crest>shotKickResponse(.05,weapon));
    assert.ok(renderer.flash.position.distanceTo(cap)<1e-8);
    if(weapon==='shotgun'){
      renderer.shotTrails.draw(camera,600);
      const pos=renderer.shotTrails.position;
      const vertex=i=>new T.Vector3().fromBufferAttribute(pos,i);
      const tail=vertex(0).lerp(vertex(1),.5),head=vertex(2).lerp(vertex(5),.5);
      assert.ok(tail.distanceTo(cap)<1e-6);
      assert.ok(head.sub(tail).normalize().dot(bore)>.99999);
    }else{
      mesh.updateMatrixWorld();const tail=mesh.localToWorld(v(0,-.5,0)),head=mesh.localToWorld(v(0,.5,0));
      assert.ok(tail.distanceTo(cap)<1e-7,weapon);
      assert.ok(head.sub(tail).normalize().dot(bore)>.99999,weapon);
      // The light and starting point must not follow the gun on the next frame.
      const released=cap.clone();cap.y+=.25;tracer.ttl=SHOT_TRAIL_LIFE-.025;
      renderer.shotsThisFrame=[];renderer.renderShots({players:[player]},player,camera);
      assert.ok(tracer.start.distanceTo(released)<1e-7 && renderer.flash.position.distanceTo(released)<1e-7);
    }
  }
});

test('the departure legs meet continuously, end at the confirmed impact and never take a visual detour through cover',()=>{
  const start=v(0,1,0),end=v(0,1,-10),bore=v(.45,0,-1).normalize();
  const departure=muzzleDeparture(start,end,bore,map);
  assert.ok(departure && departure.x>0);
  const legs=[];
  flightSlices(10,departure,0,1,(...slice)=>legs.push(slice));
  assert.deepEqual(legs,[[true,0,1],[false,0,1]]);
  const wall={x:.30,z:-.66,w:.16,d:.19,h:2};
  assert.equal(muzzleDeparture(start,end,bore,{...map,boxes:[wall]}),null);
  assert.equal(exitsForward(start,v(0,1,.15),bore),false);
});
