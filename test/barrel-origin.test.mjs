import test from 'node:test';
import assert from 'node:assert/strict';
import {createRange,stepGame,eyeHeight,firingMuzzle,MAX_HP} from '../dist/sim.js';
import {getArena} from '../dist/arena-map.js';
import {isSecondaryWeapon} from '../dist/balance.js';
import {gunFit} from '../dist/gun-fit.js';
import {worldHit} from '../dist/arena-world.js';
import {clipBarrelOrigin,pelletTrails,pelletSpan,singleShotSpan} from '../dist/shot-path.js';
import {sniperScopeVisible} from '../dist/weapon-view.js';

test('every gun publishes the muzzle as its shot origin for hip and aimed fire',t=>{
  t.mock.method(Math,'random',()=>0);
  for(const id of Object.keys(gunFit))for(const ads of [false,true]){
    const game=createRange({weapon:id,sidearm:id}),p=game.players[0];
    Object.assign(p,{x:16.45,y:0,z:20.2});
    const input={slot:isSecondaryWeapon(id)?2:1,yaw:.18,pitch:.06,ads};
    for(let i=0;i<80;i++)stepGame(game,{[p.id]:input},1/60);
    stepGame(game,{[p.id]:{...input,fire:true}},1/60);
    const shot=game.events.find(e=>e.type==='shot'),tip=firingMuzzle(p);
    assert.equal(shot.weapon,id);
    for(const key of ['x','y','z'])assert.ok(Math.abs(shot[key]-tip[key])<1e-8,id+' '+key);
    assert.ok(Math.hypot(shot.x-p.x,shot.y-p.y-eyeHeight(p),shot.z-p.z)>.49);
    assert.ok(!shot.blocked);
  }
});

test('a barrel touching a corner or shooting across it stops at the near wall even with a clear reticle',t=>{
  t.mock.method(Math,'random',()=>0);
  const map=getArena('switchyard');
  for(const [z,touching] of [[13.55,true],[15.0,false]]){
    const game=createRange({weapon:'sniper',mapId:map.id}),p=game.players[0],dummy=game.targets[0];
    Object.assign(p,{x:3.679,y:0,z,yaw:0,pitch:0});
    Object.assign(dummy,{x:p.x,y:0,z:3.85,yaw:Math.PI});game.targets=[dummy];
    assert.ok(worldHit(p.x,eyeHeight(p),p.z,0,0,-1,100,map)>p.z-dummy.z);
    stepGame(game,{[p.id]:{fire:true,yaw:0,pitch:0}},1/60);
    const shot=game.events.find(e=>e.type==='shot');
    assert.equal(Boolean(shot.blocked),touching);
    assert.ok(Math.abs(shot.ez-12.75)<1e-5);
    assert.equal(dummy.hp,MAX_HP);
    assert.ok(shot.z>shot.ez);
  }
});

test('an opponent already touching the barrel intercepts the shot before the far target',t=>{
  t.mock.method(Math,'random',()=>0);
  const game=createRange({weapon:'sniper',mapId:'switchyard'}),p=game.players[0];
  Object.assign(p,{yaw:0,pitch:0});
  const [near,far]=game.targets;
  // Put the front face of the dummy's head across the eye-to-barrel segment.
  Object.assign(near,{x:p.x,y:0,z:p.z-.48,yaw:0});
  Object.assign(far,{x:p.x,y:0,z:p.z-4,yaw:0});
  game.targets=[near,far];
  stepGame(game,{[p.id]:{fire:true,yaw:0,pitch:0}},1/60);
  const shot=game.events.find(e=>e.type==='shot');
  assert.equal(shot.blocked,true);
  assert.ok(shot.z>shot.ez && shot.ez>near.z);
  assert.equal(game.events.find(e=>e.type==='hit')?.target,near.id);
  assert.equal(far.hp,MAX_HP);
});

test('each tracer starts at the cap on the first visible frame, including long shots',()=>{
  const tip={x:.20,y:1.35,z:-.72},event={x:0,y:1.55,z:0,ex:0,ey:1.55,ez:-95};
  const [trail]=pelletTrails(event,true,false,tip);
  assert.deepEqual([trail.x,trail.y,trail.z],[tip.x,tip.y,tip.z]);
  for(const span of [pelletSpan(trail),singleShotSpan(95,0,'sniper')]){
    assert.equal(span.tail,0);assert.ok(span.head>0 && span.head<.02);
  }
  assert.ok(singleShotSpan(95,.04,'rifle').tail>0);
  const map={width:50,depth:50,boxes:[],ramps:[]},eye={x:0,y:1.55,z:0};
  assert.equal(clipBarrelOrigin(eye,tip,map).blocked,false);
  assert.equal(sniperScopeVisible('sniper',.4,true),false);
  assert.equal(sniperScopeVisible('sniper',1,true),true);
});

test('a reticle target already beside the barrel cannot pull its origin into the player',t=>{
  t.mock.method(Math,'random',()=>0);
  const game=createRange({weapon:'sniper',mapId:'switchyard'}),p=game.players[0];
  Object.assign(p,{yaw:0,pitch:0});
  const cap=firingMuzzle(p),[near,far]=game.targets;
  // The sight line skims the thin side of the target. The actual gun clears it.
  Object.assign(near,{x:p.x-.13,y:0,z:p.z-.70,yaw:Math.PI/2});
  Object.assign(far,{x:cap.x,y:0,z:p.z-4,yaw:0});
  game.targets=[near,far];
  stepGame(game,{[p.id]:{fire:true,yaw:0,pitch:0}},1/60);
  const shot=game.events.find(e=>e.type==='shot');
  assert.ok(!shot.blocked);
  assert.deepEqual([shot.x,shot.y,shot.z],[cap.x,cap.y,cap.z]);
  assert.ok(shot.ez<shot.z);
  assert.equal(near.hp,MAX_HP);
  assert.equal(game.events.find(e=>e.type==='hit')?.target,far.id);
});
