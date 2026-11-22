import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIMARY_WEAPONS, isPrimaryWeapon, WEAPONS, impactDamage } from '../dist/balance.js';
import { createRange, createGame, stepGame } from '../dist/sim.js';
import { weaponFov } from '../dist/weapon-view.js';
import { RoomClient } from '../dist/net.js';

function advance(game,seconds,input={},hz=60){
  const player=game.players[0];
  for(let t=0;t<seconds-1e-8;t+=1/hz)stepGame(game,{[player.id]:{pitch:1,...input}},Math.min(1/hz,seconds-t));
}

test('old and new primary IDs survive saved loadout, slot, turn and transport boundaries',()=>{
  const ids=['rifle','shotgun','sniper','smg','burst','marksman','lmg'];
  assert.deepEqual(PRIMARY_WEAPONS,ids);
  for(const id of ids){
    assert.equal(isPrimaryWeapon(id),true);
    const game=createRange({weapon:JSON.parse(JSON.stringify(id))}),p=game.players[0];
    assert.equal(p.active,id);
    advance(game,.25,{fire:true});
    const remaining=p.ammo;
    advance(game,.05,{slot:2});
    assert.equal(p.active,'pistol');
    advance(game,.05,{slot:1});
    assert.equal(p.active,id);assert.equal(p.ammo,remaining);assert.equal(p.reserve,null);
    const lan={token:'local',room:{phase:'playing'}};
    RoomClient.prototype.input.call(lan,{weapon:id});
    assert.equal(lan.pendingInput.weapon,id);
    const match=createGame({size:2,warmup:0,players:[{id:'local',team:0,weapon:id}]});
    assert.equal(match.players[0].active,id);assert.equal(match.players[0].reserve,WEAPONS[id].reserve);
  }
  for(const id of [undefined,'pistol','knife','unknown','__proto__']){
    assert.equal(isPrimaryWeapon(id),false);assert.equal(createRange({weapon:id}).players[0].active,'rifle');
  }
});

test('a short tap completes three spaced shots and a held burst waits between groups',()=>{
  for(const hz of [30,60,120]){
    const game=createRange({weapon:'burst'}),p=game.players[0],shots=[];
    for(let i=0;i<hz;i++){
      const before=game.range.shots;
      stepGame(game,{[p.id]:{fire:i===0,pitch:1}},1/hz);
      if(game.range.shots>before)shots.push(game.elapsed);
    }
    assert.equal(shots.length,3);assert.equal(p.ammo,WEAPONS.burst.mag-3);
    for(let i=1;i<3;i++)assert.ok(Math.abs(shots[i]-shots[0]-i*WEAPONS.burst.burstInterval)<=1/hz+1e-7);
    advance(game,.34,{fire:true},hz);assert.equal(game.range.shots,6);
    advance(game,.36,{fire:true},hz);assert.equal(game.range.shots,9);
  }
});

test('a burst stops at an empty magazine and cannot follow the player to another slot',()=>{
  const game=createRange({weapon:'burst'}),p=game.players[0];p.ammo=2;
  advance(game,.01,{fire:true});advance(game,.5);
  assert.equal(game.range.shots,2);assert.equal(p.ammo,0);
  advance(game,.02,{reload:true});advance(game,WEAPONS.burst.reload);
  assert.equal(p.ammo,WEAPONS.burst.mag);
  advance(game,.01,{fire:true});advance(game,.5,{slot:2});
  assert.equal(game.range.shots,3);assert.equal(p.ammo,WEAPONS.pistol.mag);
  advance(game,.7,{slot:1});assert.equal(p.ammo,WEAPONS.burst.mag-1);
});

test('marksman requires a fresh pull, SMG trades range for speed and the LMG sustains a longer volley',()=>{
  const marksman=createRange({weapon:'marksman'});
  advance(marksman,1.5,{fire:true});assert.equal(marksman.range.shots,1);
  advance(marksman,.04);advance(marksman,.5,{fire:true});assert.equal(marksman.range.shots,2);
  assert.ok(weaponFov('sniper',1)<weaponFov('marksman',1)&&weaponFov('marksman',1)<weaponFov('rifle',1));
  const smg=createRange({weapon:'smg'}),rifle=createRange({weapon:'rifle'}),lmg=createRange({weapon:'lmg'});
  for(const g of [smg,rifle,lmg])advance(g,1,{forward:1,fire:true});
  assert.ok(smg.range.shots>rifle.range.shots);
  assert.ok(smg.players[0].speed>rifle.players[0].speed&&rifle.players[0].speed>lmg.players[0].speed);
  assert.ok(impactDamage(WEAPONS.smg,25,false)<impactDamage(WEAPONS.rifle,25,false));
  advance(lmg,3,{fire:true});assert.ok(lmg.range.shots>35&&lmg.players[0].ammo>15);
  const p=lmg.players[0];advance(lmg,.1,{reload:true});advance(lmg,WEAPONS.rifle.reload+.05);
  assert.ok(p.reload>0);advance(lmg,WEAPONS.lmg.reload);assert.equal(p.ammo,60);
});

test('match reserves replenish each new magazine once and bots can repeatedly fire all four types',t=>{
  t.mock.method(Math,'random',()=>.5);
  for(const weapon of ['smg','burst','marksman','lmg']){
    const players=[0,1].flatMap(team=>[0,1].map(seat=>({id:`${team}-${seat}`,team,weapon,bot:team===0&&seat===0})));
    const game=createGame({size:2,warmup:0,players}),p=game.players[0],target=game.players[2];
    Object.assign(p,{x:16.45,y:0,z:20.2,yaw:0,pitch:0});
    Object.assign(target,{x:p.x,y:0,z:12.2});
    advance(game,1.9);
    const spent=WEAPONS[weapon].mag-p.ammo;
    assert.ok(spent>1,weapon+' bot fires repeated shots');
    p.bot=false;
    advance(game,WEAPONS[weapon].reload+.1,{reload:true});
    assert.equal(p.ammo,WEAPONS[weapon].mag);assert.equal(p.reserve,WEAPONS[weapon].reserve-spent);
  }
});
