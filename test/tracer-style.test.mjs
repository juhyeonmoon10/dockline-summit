import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {PELLET_LIFE,SHOT_TRAIL_LIFE,pelletSpan,pelletTrails,singleShotSpan} from '../dist/shot-path.js';
import {PelletRenderer} from '../dist/pellet-render.js';

const ids=['pistol','smg','burst','rifle','lmg','marksman','sniper'];
const metres=(length,span)=>length*(span.head-span.tail);

test('streaks start at the cap, shrink with range, and expire after the exact arrival',()=>{
  for(const id of ids)for(const length of [.13,5,24,95]){
    const first=singleShotSpan(length,0,id),at=t=>singleShotSpan(length,t,id);
    assert.equal(first.tail,0,id);assert.ok(first.head>0&&first.head<1,id);
    assert.equal(first.arrived,false);
    const t=first.arrivalTime;
    assert.ok(at(t-1e-5).head<1);assert.equal(at(t).head,1);
    assert.equal(at(t-1e-5).arrived,false);assert.equal(at(t).arrived,true);
    assert.ok(metres(length,at(t))<=length*.24+1e-7);
    assert.ok(at(t+.005).tail>at(t).tail,id);
    assert.equal(at(SHOT_TRAIL_LIFE).alpha,0);assert.equal(at(SHOT_TRAIL_LIFE).tail,1);
  }
  const profile=id=>{const time=singleShotSpan(25,0,id).arrivalTime;return singleShotSpan(25,time,id)};
  assert.ok(metres(25,profile('pistol'))<1);
  assert.ok(metres(25,profile('smg'))<metres(25,profile('rifle')));
  assert.ok(profile('pistol').alpha<profile('rifle').alpha);
  assert.ok(profile('sniper').width<profile('rifle').width);
  assert.ok(metres(25,profile('sniper'))>2*metres(25,profile('rifle')));
});

test('a shell keeps its ten recorded endpoints with repeatable variation in brightness, width and time',t=>{
  t.mock.method(Math,'random',()=>{throw Error('visuals must not reroll a shell')});
  const e={seq:33,x:0,y:1.5,z:0,pellets:Array.from({length:10},(_,i)=>({ex:i*.07,ey:1,ez:-12,target:'dummy'}))};
  const first=pelletTrails(e,true),remote=pelletTrails(e,false),next=pelletTrails({...e,seq:e.seq+1},true);
  const spans=first.map(pelletSpan);
  assert.equal(new Set(first.map(t=>t.pelletRank)).size,10);
  assert.deepEqual(remote.map(pelletSpan),spans);
  assert.equal(spans.filter(s=>s.alpha>.75).length,2);
  assert.ok(Math.max(...spans.map(s=>s.width))>Math.min(...spans.map(s=>s.width)));
  for(const [i,trail] of first.entries()){
    const timing=spans[i],end=e.pellets[i];
    assert.deepEqual([trail.ex,trail.ey,trail.ez,trail.target],[end.ex,end.ey,end.ez,end.target]);
    assert.equal(timing.tail,0);assert.equal(timing.contactAlpha,0);
    assert.notEqual(trail.pelletRank,next[i].pelletRank);
    const sample=age=>pelletSpan({...trail,age});
    assert.equal(sample(timing.arrivalTime-1e-5).arrived,false);
    const landed=sample(timing.arrivalTime);assert.equal(landed.head,1);assert.ok(landed.contactAlpha>0);
    assert.equal(sample(PELLET_LIFE).contactAlpha,0);
  }
});

test('a clipped pellet uses the actual near-wall travel time and never draws a premature contact glint',()=>{
  const scene=new T.Scene(),renderer=new PelletRenderer(scene),camera=new T.PerspectiveCamera(72,1,.05,100);
  camera.position.set(0,1.5,8);camera.updateMatrixWorld();
  const event={seq:11,x:0,y:1.5,z:6,ex:0,ey:1.5,ez:-40,target:'beyond-wall'};
  const map={width:100,depth:100,ramps:[],boxes:[{x:0,z:1,w:10,d:1,h:4}]};
  const [trail]=renderer.add(event,true,event,map);
  assert.equal(trail.ez,1.5);assert.equal(trail.target,null);
  const wallTime=pelletSpan(trail).arrivalTime;
  assert.ok(wallTime<pelletSpan(pelletTrails(event,true)[0]).arrivalTime);
  trail.contact=true;
  const hasGlint=()=>{renderer.draw(camera,480);return Array.from({length:renderer.cursor},(_,i)=>renderer.shape.getW(i)).some(w=>w===1)};
  assert.equal(hasGlint(),false);renderer.step(wallTime);assert.equal(hasGlint(),true);
  renderer.step(PELLET_LIFE);assert.equal(hasGlint(),false);
});
