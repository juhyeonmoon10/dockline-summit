import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import { ArenaRenderer } from '../dist/render.js';
import { PelletRenderer } from '../dist/pellet-render.js';
import { WorldImpacts } from '../dist/world-impacts.js';
import { singleShotSpan,pelletSpan } from '../dist/shot-path.js';

function setup(weapon='rifle',boxes=[]) {
  const scene=new T.Scene(),flashes=[];
  const view=Object.create(ArenaRenderer.prototype),map={id:'summit',width:50,depth:50,boxes,ramps:[]};
  const mesh=new T.Mesh(new T.CylinderGeometry(1,1,1),new T.MeshBasicMaterial());
  const trace={mesh,flightMesh:mesh.clone(),ttl:0,start:new T.Vector3(),end:new T.Vector3()};
  Object.assign(view,{map,flash:new T.Group(),sightFlare:new T.Group(),flashTime:.02,viewMuzzle:new T.Vector3(.80,1.40,-.7),
    viewForward:new T.Vector3(0,0,-1),res:{h:720},tracers:[trace],traceIndex:0,
    impacts:new WorldImpacts(scene,id=>flashes.push(id)),shotTrails:new PelletRenderer(scene)});
  view.flash.visible=false;
  const cam=new T.PerspectiveCamera(70,16/9,.02,80);cam.position.set(0,1.54,0);cam.updateMatrixWorld();
  const focus={id:'self',active:weapon,alive:true},game={players:[focus]};
  const draw=(events=[])=>{view.shotsThisFrame=events;view.renderShots(game,focus,cam);};
  const event={actor:'self',seq:12,weapon,x:0,y:1.40,z:-.7,ex:0,ey:1.40,ez:-10};
  return {view,cam,trace,draw,event,flashes,contact:view.impacts};
}
const active=contact=>contact.sprites.pool.particles.filter(p=>p.active);

test('target reaction waits for the complete optical path and fires once across skipped frames',()=>{
  const {draw,event,trace,contact,flashes}=setup('sniper');
  draw([{event,mine:true,hit:{target:'dummy-1'}}]);
  const arrival=singleShotSpan(trace.departure?.length??trace.length,0,'sniper').arrivalTime;
  assert.ok(arrival>0);assert.equal(contact.pending[0].at,arrival);assert.deepEqual(flashes,[]);
  contact.step(arrival*.95);draw();assert.equal(active(contact).length,0);
  contact.step(.042);draw();draw();
  assert.deepEqual(flashes,['dummy-1']);assert.equal(contact.pending.length,0);
  assert.ok(active(contact).every(p=>p.kind==='target'));assert.ok(active(contact).length>0);
  assert.equal(contact.marks.cursor,0);
});

for(const weapon of ['rifle','shotgun']){
  test(weapon+' uses the visible cover contact and suppresses the hidden target',()=>{
    const {view,draw,event,contact,flashes}=setup(weapon,[{kind:'crate',x:.54,z:-4,w:.66,d:.4,h:2}]);
    if(weapon==='shotgun')event.pellets=Array.from({length:3},(_,i)=>({ex:.015*i,ey:event.ey,ez:event.ez,target:'dummy-1'}));
    draw([{event,mine:true,hit:{target:'dummy-1'}}]);
    assert.equal(contact.pending.length,weapon==='shotgun'?3:1);
    assert.ok(contact.pending.every(p=>p.hit.kind==='wood'&&!p.target&&Math.abs(p.ez+3.8)<.001));
    if(weapon==='shotgun')assert.deepEqual(contact.pending.map(p=>p.at),view.shotTrails.trails.map(trail=>pelletSpan(trail).arrivalTime));
    assert.equal(contact.marks.cursor,0);
    contact.step(.08);draw();
    assert.equal(contact.marks.cursor,weapon==='shotgun'?3:1);
    assert.ok(active(contact).every(p=>p.kind==='wood'));assert.deepEqual(flashes,[]);
  });
}
test('blocked muzzle causes one immediate real impact, and an empty arena boundary creates none',()=>{
  const {view,draw,event,contact}=setup('rifle',[{kind:'crate',x:.54,z:-.3,w:.3,d:.7,h:2}]);
  draw([{event,mine:true}]);assert.equal(view.flash.visible,false);assert.equal(view.tracers[0].ttl,0);
  assert.equal(contact.pending.length,0);assert.ok(active(contact).length>0);
  contact.clear();view.map.boxes=[];
  draw([{event:{...event,ey:8,ez:-25},mine:true}]);contact.step(.11);draw();
  assert.equal(contact.pending.length,0);assert.equal(active(contact).length,0);
  assert.equal(contact.marks.mesh.visible,false);
});

test('a remote confirmed contact survives an unequipped prop and clears on a round reset',()=>{
  const {view,draw,event,flashes,contact}=setup();
  // The remote actor is already gone from this snapshot. Visuals still use the
  // authoritative origin and endpoint, without borrowing the focused viewmodel.
  draw([{event:{...event,actor:'remote'},mine:false,hit:{target:'dummy'}}]);
  assert.equal(view.flash.visible,false);
  assert.equal(view.tracers[0].start.x,event.x);
  assert.equal(contact.pending.length,1);
  contact.clear();contact.step(.09);draw();assert.deepEqual(flashes,[]);
  draw([{event:{...event,actor:'remote',blocked:true,x:0,y:1.4,z:-1,ex:0,ey:1.4,ez:-1.004},
    mine:false,hit:{target:'dummy'}}]);
  assert.deepEqual(flashes,['dummy']);assert.equal(contact.pending.length,0);
});
