import test from 'node:test';
import assert from 'node:assert/strict';
import { createRange, eyeHeight, MAX_HP, stepGame, WEAPONS } from '../dist/sim.js';
import { impactDamage } from '../dist/balance.js';
import { worldHit } from '../dist/arena-world.js';

const tick=1/60;
const fire=(game,input)=>stepGame(game,{[game.players[0].id]:{fire:true,...input}},tick);

test('one shotgun shell reports all ten resolved pellet endpoints and their actual target damage', t=>{
  const game=createRange({weapon:'shotgun'}), player=game.players[0];
  Object.assign(player,{x:16.45,y:0,z:20.2});
  const targets=game.targets.slice(0,2);
  targets.forEach((target,i)=>Object.assign(target,{x:player.x+(i?-.34:.34),y:0,z:player.z-4,yaw:Math.PI}));
  game.targets=targets;
  let calls=0;
  // Five right pellets and five left pellets, independently resolving two targets.
  t.mock.method(Math,'random',()=>{
    const call=calls++;
    return call%2 ? .5 : (Math.floor(call/2)%2 ? .5 : 0);
  });
  fire(game,{yaw:0,pitch:Math.atan2(1.12-eyeHeight(player),4)});
  const shots=game.events.filter(e=>e.type==='shot');
  assert.equal(shots.length,1,'one volley must remain one visual/audio event');
  assert.equal(player.ammo,WEAPONS.shotgun.mag-1);
  assert.equal(game.range.shots,1);
  assert.equal(calls,20,'publishing endpoints must not reroll spread');
  const shot=shots[0];
  assert.equal(shot.pellets.length,10);
  const first=shot.pellets[0];
  assert.deepEqual([shot.ex,shot.ey,shot.ez],[first.ex,first.ey,first.ez],'legacy endpoint remains the first resolved hit');
  for(const target of targets){
    const landed=shot.pellets.filter(pellet=>pellet.target===target.id);
    assert.equal(landed.length,5);
    for(const pellet of landed){
      assert.ok(Math.abs(pellet.ex-target.x)<.32);
      assert.ok(pellet.ey>target.y+.63 && pellet.ey<target.y+1.395);
      assert.ok(Math.abs(pellet.ez-(target.z+.14))<1e-8,'trail ends on the dummy front face');
    }
    const expected=Math.round(landed.reduce((sum,pellet)=>sum+impactDamage(WEAPONS.shotgun,
      Math.hypot(pellet.ex-shot.x,pellet.ey-shot.y,pellet.ez-shot.z),false),0)*100)/100;
    const hit=game.events.find(event=>event.type==='hit'&&event.target===target.id);
    assert.equal(hit.damage,expected,'visible pellet endpoints match the damage calculation');
    assert.equal(target.hp,Math.round((MAX_HP-expected)*100)/100);
  }
});

test('shotgun trails stop at solid cover and never mark a target hidden behind it', t=>{
  const game=createRange({weapon:'shotgun'}), player=game.players[0],target=game.targets[0];
  Object.assign(player,{x:-6.9,y:0,z:6});
  Object.assign(target,{x:-6.9,y:0,z:14,yaw:0});game.targets=[target];
  let calls=0;
  t.mock.method(Math,'random',()=>calls++%2 ? .35 : Math.floor(calls/2)/10);
  fire(game,{yaw:Math.PI,pitch:Math.atan2(1.14-eyeHeight(player),8)});
  const shot=game.events.find(event=>event.type==='shot');
  assert.equal(shot.pellets.length,10);
  assert.equal(target.hp,MAX_HP);
  assert.equal(game.events.filter(event=>event.type==='hit').length,0);
  for(const pellet of shot.pellets){
    assert.equal(pellet.target,null);
    const dx=pellet.ex-shot.x,dy=pellet.ey-shot.y,dz=pellet.ez-shot.z,distance=Math.hypot(dx,dy,dz);
    assert.ok(distance>0 && distance<8,'each pellet must stop in front of the hidden target');
    assert.ok(Math.abs(worldHit(shot.x,shot.y,shot.z,dx/distance,dy/distance,dz/distance)-distance)<1e-8);
  }
});

test('rifle, sniper and pistol retain the existing single-endpoint shot payload',()=>{
  for(const weapon of ['rifle','sniper','pistol']){
    const game=createRange({weapon:weapon==='pistol'?'rifle':weapon}),player=game.players[0];
    if(weapon==='pistol')for(let i=0;i<20;i++)stepGame(game,{[player.id]:{slot:2}},tick);
    fire(game,{pitch:1});
    const shots=game.events.filter(event=>event.type==='shot');
    assert.equal(shots.length,1);
    assert.equal(shots[0].weapon,weapon);
    assert.equal(Object.hasOwn(shots[0],'pellets'),false);
    for(const coordinate of ['x','y','z','ex','ey','ez'])assert.ok(Number.isFinite(shots[0][coordinate]));
    assert.equal(player.ammo,WEAPONS[weapon].mag-1);
  }
});
