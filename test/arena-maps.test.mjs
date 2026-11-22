import test from 'node:test';
import assert from 'node:assert/strict';
import { getArena } from '../dist/arena-map.js';
import { nextWaypoint } from '../dist/arena-routes.js';
import { createGame, createRange, eyeHeight, spawnYaw, stepGame } from '../dist/sim.js';

const summit=getArena('summit'), yard=getArena('switchyard');
const maps=[summit,yard];
const players=[0,1].flatMap(team=>[0,1].map(seat=>({id:`p-${team}-${seat}`,team,weapon:'sniper'})));
const xyz=({x,y=0,z})=>({x,y,z});

test('each match uses its own warmup plates and round respawns', () => {
  const games=maps.map(map=>createGame({mapId:map.id,players,warmup:.1}));
  assert.equal(createGame().mapId,'summit');
  assert.deepEqual(games.map(g=>g.mapId),['summit','switchyard']);
  for(const [i,g] of games.entries()) {
    assert.deepEqual(g.targets.map(xyz),maps[i].plates.map(xyz));
    g.players[0].x=0;
  }
  for(const g of [...games].reverse())stepGame(g,{},.15);
  for(const [i,g] of games.entries()) {
    assert.equal(g.phase,'round');
    for(const p of g.players) {
      const spawn=maps[i].spawns[p.team][p.seat];
      assert.deepEqual(xyz(p),xyz(spawn));
      assert.equal(p.yaw,spawn.yaw);
      assert.equal(spawnYaw(p,g.mapId),spawn.yaw);
    }
  }
});

test('a Switchyard boxcar blocks movement and gunfire in its own match', () => {
  const [open,blocked]=maps.map(map=>createGame({mapId:map.id,players,warmup:0}));
  const start={x:3,y:0,z:7.45};
  for(const g of [blocked,open]) {
    const p=g.players[0];
    Object.assign(p,start);
    stepGame(g,{[p.id]:{yaw:Math.PI/2,pitch:0,ads:true,fire:true}});
  }
  const shotX=g=>g.events.find(e=>e.type==='shot').ex;
  assert.ok(shotX(open)>8);
  assert.ok(Math.abs(shotX(blocked)-3.725)<.01);
  for(let i=0;i<36;i++) for(const g of [open,blocked]) {
    stepGame(g,{[g.players[0].id]:{yaw:0,strafe:1}});
  }
  assert.ok(open.players[0].x>7);
  assert.ok(blocked.players[0].x<3.4);
  const end={x:8,y:0,z:start.z};
  const route=map=>xyz(nextWaypoint(start,end.x,end.z,end.y,map));
  assert.deepEqual(route(summit),end);
  assert.notEqual(route(yard).z,end.z);
  assert.deepEqual(route(summit),end);
});

test('overtime distinguishes the Summit underpass from the Switchyard capture zone', () => {
  const games=maps.map(map=>createGame({mapId:map.id,players,warmup:0}));
  for(const g of games) {
    g.phase='overtime';
    Object.assign(g.players[0],{x:0,y:0,z:0});
  }
  for(let i=0;i<13;i++)for(const g of games)stepGame(g,{},.25);
  assert.equal(games[0].capture.team,null);
  assert.equal(games[0].phase,'overtime');
  assert.equal(games[1].roundWinner,0);
  Object.assign(games[0].players[0],xyz(summit.zone));
  for(let i=0;i<13;i++)stepGame(games[0],{},.25);
  assert.equal(games[0].roundWinner,0);
});

test('bots navigate from spawn to the correct capture floor in simultaneous matches', () => {
  const roster=players.map((p,i)=>({...p,bot:i===0}));
  const games=maps.map(map=>createGame({mapId:map.id,players:roster,warmup:0}));
  for(const g of games){g.phase='overtime';g.time=10;}
  for(let i=0;i<40;i++)for(const g of games)if(g.phase==='overtime')stepGame(g,{},.25);
  for(const [i,g] of games.entries()) {
    assert.ok(g.capture.progress>=1-1e-8);
    assert.equal(g.roundWinner,0);
    assert.equal(g.players[0].y,maps[i].zone.y);
  }
});

test('each range places its dummies on the selected map and permits aimed hits from spawn', () => {
  assert.equal(createRange().mapId,'summit');
  for(const map of maps) {
    for(const [i,position] of map.rangeTargets.entries()) {
      const g=createRange({mapId:map.id,weapon:'sniper'}), p=g.players[0], t=g.targets[i];
      assert.equal(g.mapId,map.id);
      assert.deepEqual(xyz(t),xyz(position));
      const dx=t.x-p.x, dz=t.z-p.z;
      const yaw=Math.atan2(dx,-dz), pitch=Math.atan2(t.y+1.62-p.y-eyeHeight(p),Math.hypot(dx,dz));
      stepGame(g,{[p.id]:{ads:true,fire:true,yaw,pitch}});
      assert.equal(t.alive,false,`${map.id} dummy ${i+1}`);
    }
  }
});
