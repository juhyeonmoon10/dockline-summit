import test from 'node:test';
import assert from 'node:assert/strict';
import { gameSnapshot } from '../dist/game-snapshot.js';
import { createGame, stepGame } from '../dist/sim.js';

test('snapshots drop only stale timestamped shotgun effects and never mutate the game',()=>{
  const events=[
    {seq:1,type:'shot',weapon:'shotgun',at:9.699},
    {seq:2,type:'shot',weapon:'shotgun',at:9.70,pellets:[{ex:1.23456789,ey:2.3456789,ez:3.456789,target:'opponent'}]},
    {seq:3,type:'shot',weapon:'shotgun',at:9.95},
    {seq:4,type:'hit',weapon:'shotgun',at:8,target:'opponent',damage:40},
    {seq:5,type:'kill',weapon:'shotgun',at:8,target:'opponent'},
    {seq:6,type:'round',at:7},
    {seq:7,type:'shot',weapon:'rifle',at:8},
    {seq:8,type:'shot',weapon:'shotgun'},
    {seq:9,type:'shot',weapon:'shotgun',at:null},
    {seq:10,type:'reload',weapon:'shotgun',at:8},
    {seq:11,type:'shot',weapon:'shotgun',at:11}
  ];
  const game={elapsed:10,seq:11,players:[{id:'opponent',hp:0,alive:false}],score:[1,0],events};
  const before=structuredClone(game);
  Object.freeze(game);Object.freeze(events);events.forEach(Object.freeze);
  const snapshot=gameSnapshot(game);
  assert.deepEqual(snapshot.events.map(event=>event.seq),[2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual({...snapshot,events:game.events},game,'authoritative state and sequence stay unchanged');
  assert.deepEqual(snapshot.events[0].pellets,events[1].pellets,'no endpoint quantization');
  assert.deepEqual(game,before,'serialization must not trim authoritative history');
});

test('six simultaneous shotgun volleys stay complete while repeated packets avoid forty old volleys',()=>{
  const players=[0,1].flatMap(team=>[0,1,2].map(seat=>({id:'player-'+team+'-'+seat,team,weapon:'shotgun',bot:false})));
  const game=createGame({size:3,players,warmup:0});
  const input=Object.fromEntries(game.players.map(player=>[player.id,{fire:true,pitch:1.3,yaw:player.team?3:0}]));
  for(let i=0;i<260;i++)stepGame(game,input,1/60);
  assert.equal(game.events.length,40);
  assert.equal(game.events.filter(event=>event.type==='shot').length,40);
  const snapshot=gameSnapshot(game),shots=snapshot.events.filter(event=>event.type==='shot');
  assert.equal(shots.length,6,'the latest simultaneous six-player volley is preserved');
  assert.equal(new Set(shots.map(shot=>shot.actor)).size,6);
  for(const shot of shots){
    assert.equal(shot.pellets.length,10);
    assert.ok(Number.isFinite(shot.at));
    assert.ok(game.elapsed-shot.at<=.30);
  }
  const fullBytes=Buffer.byteLength(JSON.stringify(game)),packetBytes=Buffer.byteLength(JSON.stringify(snapshot));
  assert.ok(packetBytes<12*1024,'six-player snapshot stays under 12 KiB');
  assert.ok(packetBytes<fullBytes*.30,'old pellet history no longer dominates every packet');
  assert.equal(game.events.length,40,'server history remains intact after snapshot');
  for(let i=0;i<20;i++)stepGame(game,{},1/60);
  const later=gameSnapshot(game);
  assert.equal(later.events.filter(event=>event.type==='shot'&&event.weapon==='shotgun').length,0);
  assert.equal(later.players,game.players);
  assert.equal(later.seq,game.seq);
});
