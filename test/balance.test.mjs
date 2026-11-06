import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createRange, eyeHeight, MAX_HP, stepGame, WEAPONS } from '../dist/sim.js';

const tick = 1 / 60;

function teamGame(weapon) {
  const players = [0,1].flatMap(team => [0,1].map(seat => ({
    id:team+'-'+seat, team, bot:false, weapon
  })));
  return createGame({size:2, players, warmup:0});
}

function advance(game,input,seconds) {
  for (let left=seconds; left>1e-8; left-=tick)
    stepGame(game,{[game.players[0].id]:input},Math.min(left,tick));
}

// A clear lane along the east wall avoids other targets, ramps and spawn cover.
function fireAt(mode,weapon,distance,height) {
  const primary=weapon==='pistol'?'rifle':weapon;
  const game=mode==='range'?createRange({weapon:primary}):teamGame(primary);
  const player=game.players[0];
  const target=mode==='range'?game.targets[0]:game.players.find(p=>p.team===1);
  Object.assign(player,{x:16.45,y:0,z:20.2});
  Object.assign(target,{x:player.x,y:0,z:player.z-distance,yaw:Math.PI});
  const input={yaw:0,pitch:Math.atan2(height-eyeHeight(player),distance),
    ads:true,slot:weapon==='pistol'?2:1};
  advance(game,input,1);
  assert.equal(player.active,weapon);
  stepGame(game,{[player.id]:{...input,fire:true}},tick);
  const hit=game.events.find(e=>e.type==='hit' && e.target===target.id);
  assert.ok(hit,mode+' '+weapon+' at '+distance+'m');
  assert.equal(target.hp,MAX_HP-hit.damage);
  return hit;
}

test('all four weapons deal the same close-range body and head damage to dummies and opponents', t => {
  t.mock.method(Math,'random',()=>0); // Test damage, independent of pellet dispersion.
  assert.equal(MAX_HP,150);
  const expected={rifle:[12,15],pistol:[12,15],shotgun:[80,120],sniper:[50,150]};
  for(const mode of ['range','team']){
    for(const [weapon,[body,head]] of Object.entries(expected)){
      const torso=fireAt(mode,weapon,1.5,1.12), critical=fireAt(mode,weapon,1.5,1.65);
      assert.equal(torso.damage,body,mode+' '+weapon+' body');
      assert.equal(critical.damage,head,mode+' '+weapon+' head');
      assert.equal(torso.headshot,false);
      assert.equal(critical.headshot,true);
    }
  }
});

test('distance reduces damage after the weapon’s effective range', t => {
  t.mock.method(Math,'random',()=>0);
  for(const gun of ['rifle','pistol']){
    assert.equal(fireAt('range',gun,13,1.12).damage,12);
    assert.ok(fireAt('range',gun,34,1.12).damage<12);
  }
  assert.equal(fireAt('range','shotgun',2.6,1.12).damage,80);
  const intermediate=fireAt('range','shotgun',8,1.12).damage;
  const far=fireAt('range','shotgun',20,1.12).damage;
  assert.ok(80>intermediate && intermediate>far);
  assert.equal(fireAt('range','sniper',34,1.12).damage,50);
});

test('full-auto fire cadence stays consistent across 30 and 60 Hz and fractional pistol intervals', () => {
  for(const [gun,interval,clip] of [['rifle',.10,20],['pistol',.13,13]]){
    for(const hz of [30,60]){
      const game=createRange(), player=game.players[0], slot=gun==='pistol'?2:1;
      advance(game,{slot},.35);
      assert.equal(player.ammo,clip);
      const timestamps=[];
      for(let i=0;i<2.5*hz && timestamps.length<12;i++){
        const before=game.range.shots;
        stepGame(game,{[player.id]:{slot,fire:true,pitch:1}},1/hz);
        if(game.range.shots!==before)timestamps.push(game.elapsed);
      }
      assert.equal(timestamps.length,12);
      const elapsed=timestamps.at(-1)-timestamps[0];
      assert.ok(Math.abs(elapsed-11*interval)<=1/hz+1e-6,
        gun+' at '+hz+' Hz took '+elapsed+'s for 11 firing intervals');
    }
  }
});

test('drawing a sidearm has its own delay and swapping back cannot skip a sniper shot interval', () => {
  const game=createRange({weapon:'sniper'}), player=game.players[0];
  stepGame(game,{[player.id]:{fire:true,pitch:1}},tick);
  advance(game,{slot:2,fire:true,pitch:1},.15);
  assert.equal(player.ammo,13);
  advance(game,{slot:2,fire:true,pitch:1},.10);
  assert.equal(player.ammo,12);
  advance(game,{slot:1,fire:true,pitch:1},1.18);
  assert.equal(player.ammo,3);
  advance(game,{slot:1,fire:true,pitch:1},.12);
  assert.equal(player.ammo,2);
});

test('the first shot after a completed reload uses the held scope accuracy', t => {
  t.mock.method(Math,'random',()=>.99);
  const game=createRange({weapon:'sniper'}), player=game.players[0], target=game.targets[0];
  stepGame(game,{[player.id]:{fire:true,pitch:1}},tick);
  advance(game,{},WEAPONS.sniper.interval);
  stepGame(game,{[player.id]:{reload:true}},tick);
  const distance=player.z-target.z;
  const pitch=Math.atan2(target.y+1.63-player.y-eyeHeight(player),distance);
  advance(game,{fire:true,ads:true,yaw:0,pitch},WEAPONS.sniper.reload+.04);
  assert.equal(target.hp,0);
  assert.equal(game.range.kills,1);
});

test('reloading spends the active weapon’s reserve in team play and is unlimited in the range', () => {
  for(const game of [teamGame('rifle'),createRange()]){
    const player=game.players[0], range=game.phase==='range';
    const initial=player.reserve;
    if(range)assert.equal(initial,null);else assert.ok(Number.isInteger(initial)&&initial>0);
    stepGame(game,{[player.id]:{fire:true,pitch:1}},tick);
    assert.equal(player.ammo,19);
    advance(game,{reload:true},.1);
    advance(game,{},WEAPONS.rifle.reload+.1);
    assert.equal(player.ammo,20);
    const after=range?null:initial-1;
    assert.equal(player.reserve,after);
    advance(game,{slot:2},.35);
    assert.equal(player.ammo,13);
    advance(game,{slot:1},.35);
    assert.equal(player.reserve,after);
  }
});

test('a partially loaded shotgun can fire after inserting one shell without spending the rest', () => {
  const game=teamGame('shotgun'), player=game.players[0];
  const initialReserve=player.reserve;
  assert.equal(player.ammo,7);
  advance(game,{fire:true,pitch:1},.85);
  assert.equal(player.ammo,5);
  stepGame(game,{[player.id]:{reload:true}},tick);
  for(let frame=0;frame<180 && player.ammo===5;frame++)stepGame(game,{},tick);
  assert.equal(player.ammo,6);
  assert.ok(player.reload>0);
  advance(game,{fire:true,pitch:1},.25);
  assert.equal(player.ammo,5);
  assert.equal(player.reload,0);
  assert.equal(player.reserve,initialReserve-1);
});
