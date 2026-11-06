import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame,createRange,eyeHeight,MAX_HP,stepGame,WEAPONS } from '../dist/sim.js';

const dt=1/60;
function advance(game,input,seconds){
  for(let left=seconds;left>1e-8;left-=dt)stepGame(game,{[game.players[0].id]:input},Math.min(left,dt));
}
function setup(mode='range',distance=1.4){
  const game=mode==='range'?createRange():createGame({size:2,warmup:0,
    players:[0,1].flatMap(team=>[0,1].map(seat=>({id:team+'-'+seat,team,bot:false,weapon:'rifle'})))});
  const player=game.players[0],target=mode==='range'?game.targets[0]:game.players.find(p=>p.team===1);
  Object.assign(player,{x:16.45,y:0,z:20.2,yaw:0,pitch:0});
  Object.assign(target,{x:player.x,y:0,z:player.z-distance,yaw:Math.PI});
  if(mode==='range')game.targets=[target];
  advance(game,{slot:3,yaw:0,pitch:0},.24);
  assert.equal(player.active,'knife');
  return {game,player,target};
}
function swing(game,extra={}){
  stepGame(game,{[game.players[0].id]:{slot:3,fire:true,yaw:0,pitch:0,...extra}},dt);
}

test('knife has a real equip/windup, one50-damage contact and no headshot multiplier in both modes',()=>{
  for(const mode of ['range','team']){
    const {game,player,target}=setup(mode);
    swing(game);
    const start=game.events.find(e=>e.type==='melee');
    assert.ok(start);assert.equal(target.hp,MAX_HP);
    advance(game,{slot:3},.07);assert.equal(target.hp,MAX_HP,'swing must not hit during windup');
    advance(game,{slot:3},.04);
    assert.equal(target.hp,MAX_HP-50);
    const impacts=game.events.filter(e=>e.type==='meleeImpact'),hits=game.events.filter(e=>e.type==='hit');
    assert.equal(impacts.length,1);assert.equal(hits.length,1);
    assert.equal(impacts[0].target,target.id);assert.equal(hits[0].weapon,'knife');
    assert.equal(hits[0].headshot,false);assert.equal(hits[0].damage,50);
    assert.ok(impacts[0].at-start.at>=WEAPONS.knife.windup-1e-8);
    assert.ok(Math.hypot(impacts[0].ex-player.x,impacts[0].ey-player.y-eyeHeight(player),impacts[0].ez-player.z)<=1.8+1e-8);
    assert.equal(game.events.filter(e=>e.type==='shot').length,0,'swing is not a gunshot');
    assert.equal(player.ammo,null);assert.equal(player.reserve,null);
    if(mode==='range')assert.deepEqual(game.range,{shots:1,hits:1,kills:0});
  }
  const game=createRange();
  advance(game,{slot:3,fire:true},.15);assert.equal(game.events.filter(e=>e.type==='melee').length,0);
  advance(game,{slot:3,fire:true},.09);assert.equal(game.events.filter(e=>e.type==='melee').length,1);
});

test('melee uses finite range and a3D forward cone instead of hitting nearby targets behind or above',()=>{
  for(const change of [
    ({player,target})=>target.z=player.z-2.2,
    ({player,target})=>target.z=player.z+1,
    ({player,target})=>{target.x=player.x-1.3;target.z=player.z-.3;},
    ({player,target})=>{target.y=3;target.z=player.z-1;}
  ]){
    const fixture=setup();change(fixture);swing(fixture.game);advance(fixture.game,{slot:3},.12);
    assert.equal(fixture.target.hp,MAX_HP);assert.equal(fixture.game.range.hits,0);
    assert.equal(fixture.game.events.filter(e=>e.type==='hit').length,0);
  }
});

test('an actual close wall blocks a knife and emits only a surface contact',()=>{
  const {game,player,target}=setup();
  Object.assign(player,{x:2.65,z:2.85,y:0});Object.assign(target,{x:4.2,z:2.85,y:0});
  swing(game,{yaw:Math.PI/2});advance(game,{slot:3,yaw:Math.PI/2},.12);
  assert.equal(target.hp,MAX_HP);
  assert.equal(game.events.filter(e=>e.type==='hit').length,0);
  const contact=game.events.find(e=>e.type==='meleeImpact');
  assert.ok(contact);assert.equal(contact.target,null);assert.ok(Math.abs(contact.ex-3.06)<1e-8);
});

test('one sweep selects the nearest opponent and cannot damage teammates',()=>{
  const {game,player,target}=setup('team',1.15),other=game.players.find(p=>p.team===1&&p!==target);
  Object.assign(other,{x:player.x,y:0,z:player.z-1.75});
  swing(game);advance(game,{slot:3},.12);
  assert.equal(target.hp,MAX_HP-50);assert.equal(other.hp,MAX_HP);
  assert.equal(game.events.filter(e=>e.type==='hit').length,1);
  const teammate=game.players.find(p=>p.team===player.team&&p!==player);
  Object.assign(teammate,{x:player.x,y:0,z:player.z-1});
  target.z=other.z=-10;
  advance(game,{slot:3},.5);swing(game);advance(game,{slot:3},.12);
  assert.equal(teammate.hp,MAX_HP);assert.equal(game.events.filter(e=>e.type==='hit').length,1);
});

test('holstering or death cancels a pending contact and swapping does not reset attack recovery',()=>{
  const {game,target}=setup();swing(game);
  const first=game.events.find(e=>e.type==='melee');
  advance(game,{slot:2},.05);advance(game,{slot:3,fire:true},.35);
  assert.equal(target.hp,MAX_HP);
  assert.equal(game.events.filter(e=>e.type==='melee').length,1);
  advance(game,{slot:3,fire:true},.20);
  const swings=game.events.filter(e=>e.type==='melee');assert.equal(swings.length,2);
  assert.ok(swings[1].at-first.at>=WEAPONS.knife.interval-dt-1e-8);
  const dead=setup();swing(dead.game);dead.player.alive=false;
  advance(dead.game,{},.20);assert.equal(dead.target.hp,MAX_HP);
  assert.equal(dead.game.events.filter(e=>e.type==='meleeImpact').length,0);
  const reset=setup('team');swing(reset.game);reset.game.phase='between';reset.game.time=.001;
  advance(reset.game,{},.15);assert.equal(reset.game.phase,'round');
  assert.equal(reset.game.events.filter(e=>e.type==='meleeImpact').length,0);
});

test('knife ignores reload/ADS and preserves finite team weapon reserves across all slots',()=>{
  for(const mode of ['range','team']){
    const {game,player}=setup(mode);
    advance(game,{slot:3,reload:true,ads:true},.25);
    assert.equal(player.ads,false);assert.equal(player.reload,0);assert.equal(player.ammo,null);
    assert.equal(game.events.filter(e=>e.type==='reload').length,0);
    advance(game,{slot:2},.25);
    assert.equal(player.ammo,13);assert.equal(player.reserve,mode==='range'?null:WEAPONS.pistol.reserve);
    advance(game,{slot:3},.25);advance(game,{slot:1},.70);
    assert.equal(player.ammo,20);assert.equal(player.reserve,mode==='range'?null:WEAPONS.rifle.reserve);
  }
});

test('holding melee kills and respawns a dummy with one hit per swing and coherent range counters',()=>{
  const {game,target}=setup();
  advance(game,{slot:3,fire:true,yaw:0,pitch:0},1.23);
  assert.equal(target.hp,0);assert.equal(target.alive,false);
  assert.deepEqual(game.range,{shots:3,hits:3,kills:1});
  assert.equal(game.events.filter(e=>e.type==='kill').length,1);
  assert.ok(game.events.filter(e=>e.type==='hit').every(e=>e.damage===50&&!e.headshot));
  advance(game,{slot:3},1.6);assert.equal(target.alive,true);assert.equal(target.hp,MAX_HP);
});
