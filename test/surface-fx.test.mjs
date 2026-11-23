import test from 'node:test';
import assert from 'node:assert/strict';
import {getArena} from '../dist/arena-map.js';
import {worldHit,slopeAt} from '../dist/arena-world.js';
import {classifyImpact,ImpactParticlePool,SURFACE_FX} from '../dist/surface-fx.js';

const yard=getArena('switchyard'),roof=getArena('summit');
const vector=(x,y,z)=>({x,y,z});
const left=vector(-1,0,0),down=vector(0,-1,0),up=vector(0,1,0);
function trace(map,x,y,z,dir){
  const d=worldHit(x,y,z,dir.x,dir.y,dir.z,100,map);
  return classifyImpact(map,{ex:x+d*dir.x,ey:y+d*dir.y,ez:z+d*dir.z},dir);
}
test('warehouse ray contacts match cargo, truck side, scales, glazing and masonry',()=>{
  for(const [kind,expected] of [['trailer','metal'],['crate','wood'],['pallet','wood'],['sack','fabric'],['dock','metal'],['partition','concrete']]){
    const b=yard.boxes.find(box=>box.kind===kind);
    const p=trace(yard,b.x+b.w/2+.2,b.h*.66,b.z,left);
    assert.equal(p?.kind,expected,kind);
    assert.equal(p.nx,1);assert.equal(p.markable,kind!=='sack');
  }
  const office=yard.boxes.find(b=>b.kind==='officeWindow');
  const x=office.x+office.w/2+.2,z=office.z+office.d*.06;
  assert.equal(trace(yard,x,office.h*.56,z,left).kind,'glass');
  assert.equal(trace(yard,x,office.h*.2,z,left).kind,'concrete');
  const cab=yard.boxes.find(b=>b.kind==='cab');
  assert.equal(trace(yard,cab.x+cab.w/2+.2,2.25,cab.z,left).kind,'glass');
  assert.equal(trace(yard,-6,.9,18,down).kind,'concrete');
  assert.equal(trace(yard,1,.9,1,down).kind,'metal');
  assert.equal(trace(yard,2.9,.9,1,down).kind,'concrete');
});

test('the loading door opening and sky stay blank while real end and side cladding respond',()=>{
  const door=vector(0,0,1),side=vector(1,0,0);
  assert.equal(trace(yard,0,1.65,yard.depth/2-.3,door),null);
  assert.equal(trace(yard,7,2,yard.depth/2-.3,door).kind,'concrete');
  assert.equal(trace(yard,0,4.22,yard.depth/2-.3,door).kind,'metal');
  assert.equal(trace(yard,yard.width/2-.2,2,0,side).kind,'concrete');
  assert.equal(trace(yard,yard.width/2-.2,3.5,0,side).kind,'metal');
  assert.equal(trace(yard,yard.width/2-.2,8,0,side),null);
  assert.equal(trace(roof,roof.width/2-.2,.55,0,side).kind,'concrete');
  assert.equal(trace(roof,roof.width/2-.2,2.4,0,side),null);
  assert.equal(classifyImpact(yard,{ex:2,ey:28,ez:3},up),null);
});

test('elevated slabs, ramp slopes and target hits supply the correct independent normals',()=>{
  const b=roof.boxes.find(box=>box.kind==='summit');
  const underside=trace(roof,b.x,b.base-.15,b.z,up);
  assert.equal(underside.kind,'metal');assert.equal(underside.ny,-1);
  assert.equal(trace(roof,b.x,b.h+.15,b.z,down).kind,'concrete');
  for(const map of [yard,roof])for(const r of map.ramps){
    const p=trace(map,r.x,slopeAt(r,r.x,r.z)+.2,r.z,down);
    const s=r.h*r.sign/(r.axis==='x'?r.w:r.d);
    assert.ok(Math.abs(p.ny-1/Math.hypot(s,1))<1e-7);
    assert.ok(Math.abs((r.axis==='x'?p.nx:p.nz)+s*p.ny)<1e-7);
    assert.equal(p.kind,r.kind==='dock'?'metal':'concrete');
  }
  const data={};
  assert.equal(classifyImpact(yard,{ex:3,ey:1,ez:0,target:'dummy-1'},vector(0,0,-2),data),data);
  assert.equal(data.kind,'target');assert.equal(data.nz,1);assert.equal(data.markable,false);
  const b2=yard.boxes.find(box=>box.kind==='crate');
  const corner=trace(yard,b2.x+b2.w/2-.006,b2.h+.13,b2.z,down);
  assert.equal(corner.kind,'wood');assert.equal(corner.markable,false);
});

test('particle pools recycle the same slots, accept pellet budgets, and preserve a repeatable outward spray',()=>{
  const a=new ImpactParticlePool(4),b=new ImpactParticlePool(4);
  const refs=[...a.particles],end={ex:1,ey:2,ez:3},hit={kind:'metal',nx:0,ny:1,nz:0};
  assert.equal(a.emit(end,hit,917,2),2);assert.equal(b.emit(end,hit,917,2),2);
  assert.deepEqual(a.particles,b.particles);
  assert.ok(a.particles.filter(p=>p.active).every(p=>p.vy>0&&p.alpha>0&&p.age===0));
  const life=a.particles[0].life;
  a.step(.03);b.step(.01);b.step(.02);
  for(const k of ['x','y','z','vx','vy','vz','alpha','size']){
    assert.ok(Math.abs(a.particles[0][k]-b.particles[0][k])<1e-9,k);
  }
  assert.equal(a.emit(end,{...hit,kind:'wood'},20),4);
  assert.ok(a.particles.every((p,i)=>p===refs[i]&&p.kind==='wood'));
  a.step(life+1);assert.ok(a.particles.every(p=>!p.active&&p.alpha===0));
  a.clear();assert.equal(a.cursor,0);assert.equal(a.emit(end,null,0),0);
  assert.equal(new ImpactParticlePool(0).emit(end,hit,0),0);
  assert.equal(SURFACE_FX.metal.streak,true);assert.equal(SURFACE_FX.concrete.streak,false);
});
