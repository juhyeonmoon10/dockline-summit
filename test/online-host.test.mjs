import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineHost } from '../dist/online-host.js';

function fixture(size=2) {
  let wall=1000;
  const rooms=[],games=[];
  const host=new OnlineHost({code:'ABC234',size,hostId:'host',name:'방장',weapon:'rifle',
    now:()=>wall,onRoom:r=>rooms.push(r),onGame:g=>games.push(g)});
  return {host,rooms,games,tick(dt=.05){wall+=dt*1000;host.tick(dt,wall);},advance(ms){wall+=ms;}};
}

test('online lobby enforces capacity, balanced teams, names and ready/start gates',()=>{
  const {host}=fixture();
  host.join('a',{name:'<친구>\u0000',weapon:'knife'});
  host.join('b',{name:'B'});host.join('c',{name:'C'});
  assert.deepEqual(host.room.players.map(p=>p.team),[0,1,0,1]);
  assert.equal(host.room.players[1].name,'친구');assert.equal(host.room.players[1].weapon,'rifle');
  assert.throws(()=>host.join('d',{}),/가득/);
  assert.throws(()=>host.action('a','start'),/방장/);
  assert.throws(()=>host.action('host','start'),/준비/);
  assert.throws(()=>host.action('a','team',{team:0}),/빈자리/);
  for(const id of ['a','b','c'])host.action(id,'ready',{ready:true});
  host.action('host','start');
  assert.equal(host.room.phase,'playing');assert.equal(host.game.players.filter(p=>p.bot).length,0);
  assert.throws(()=>host.join('late',{}),/경기 중/);
  assert.throws(()=>host.action('a','weapon',{weapon:'sniper'}),/대기실/);
});

test('optional bot fill and team changes retain lobby rules in 3v3',()=>{
  const {host}=fixture(3);
  host.join('friend',{name:'친구'});
  host.action('friend','ready',{ready:true});
  host.action('friend','team',{team:0});
  assert.equal(host.room.players[1].ready,false);
  assert.throws(()=>host.action('host','start',{fillBots:true}),/준비/);
  host.action('friend','ready',{ready:true});
  assert.throws(()=>host.action('host','start'),/자리가/);
  host.action('host','ready',{ready:false});
  assert.equal(host.room.players[0].ready,true);
  host.action('host','start',{fillBots:true});
  assert.equal(host.game.players.length,6);
  assert.deepEqual([0,1].map(t=>host.game.players.filter(p=>p.team===t).length),[3,3]);
  assert.equal(host.game.players.filter(p=>p.bot).length,4);
});

test('host snapshots are detached from authoritative state and previous frames',()=>{
  const f=fixture(),{host,rooms,games}=f;
  rooms[0].players[0].name='changed';
  const read=host.room;read.players[0].team=1;
  assert.equal(host.room.players[0].name,'방장');assert.equal(host.room.players[0].team,0);
  host.action('host','start',{fillBots:true});
  const initial=structuredClone(games[0]);games[0].players[0].hp=0;
  assert.equal(host.game.players[0].hp,150);
  host.action('host','input',{seq:1,input:{forward:1,yaw:0,pitch:0}});f.tick();
  assert.equal(games.length,2);assert.equal(initial.elapsed,0);
  assert.notEqual(games[1].players[0].z,initial.players[0].z);
  games[1].events.push({type:'kill'});assert.ok(host.game.events.every(e=>e.type!=='kill'));
});

test('input sanitization and sequence checks protect authoritative movement and weapons',()=>{
  const f=fixture(),{host}=f;
  host.action('host','start',{fillBots:true});
  host.action('host','input',{seq:5,input:{forward:Infinity,strafe:999,yaw:Infinity,pitch:99,
    fire:'yes',slot:3,weapon:'fake',hp:999,x:999}});f.tick();
  const p=host.game.players.find(p=>p.id==='host');
  assert.equal(p.yaw,0);assert.ok(p.pitch>0&&p.pitch<=Math.PI/2);assert.equal(p.active,'knife');
  assert.equal(p.hp,150);assert.ok(Number.isFinite(p.x)&&Math.abs(p.x)<100);
  host.action('host','input',{seq:4,input:{slot:1,yaw:1,pitch:0}});f.tick();
  assert.equal(p.active,'knife');assert.equal(p.yaw,0);
  host.action('host','input',{seq:6,input:{slot:2,yaw:1,pitch:0}});f.tick();
  assert.equal(p.active,'pistol');assert.equal(p.yaw,1);
  assert.throws(()=>host.action('stranger','input',{seq:99,input:{fire:true}}),/만료/);
});

test('stale input stops firing after 350ms and snapshots publish at 20Hz',()=>{
  const f=fixture(),{host,games}=f;
  host.action('host','start',{fillBots:true});
  host.action('host','input',{seq:1,input:{fire:true,yaw:0,pitch:0}});
  f.tick(1/60);f.tick(1/60);
  assert.equal(games.length,1);f.tick(1/60);assert.equal(games.length,2);
  const p=host.game.players.find(p=>p.id==='host'),ammo=p.ammo;
  assert.ok(ammo<20);f.advance(350);
  for(let i=0;i<12;i++)f.tick();
  assert.equal(p.ammo,ammo);
});

test('guest departure frees a lobby seat or becomes a bot during the match',()=>{
  const f=fixture(),{host}=f;
  host.join('gone',{name:'떠난 친구'});host.remove('gone');
  assert.equal(host.room.players.length,1);
  host.join('friend',{name:'친구'});host.action('friend','ready',{ready:true});
  host.action('host','start',{fillBots:true});host.remove('friend');
  assert.equal(host.room.players.find(p=>p.id==='friend').bot,true);
  assert.equal(host.game.players.find(p=>p.id==='friend').bot,true);
  assert.throws(()=>host.action('friend','ready',{ready:true}),/만료/);
  // Ending is normally driven by sim.js; exercise the room lifecycle transition.
  host.game.phase='end';f.tick();assert.equal(host.room.phase,'end');
  host.action('host','lobby');assert.equal(host.room.phase,'lobby');
  assert.equal(host.room.players.length,1);assert.equal(host.game,null);
  host.join('new',{name:'새 친구'});assert.equal(host.room.players.length,2);
});

test('destroyed rooms reject actions and never emit further simulation updates',()=>{
  const f=fixture(),{host,games}=f;
  host.action('host','start',{fillBots:true});host.remove('host');
  f.tick();assert.equal(games.length,1);
  assert.throws(()=>host.join('late',{}),/닫혔/);
  assert.throws(()=>host.action('host','start'),/닫혔/);
});
