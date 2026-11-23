import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,createRange,stepGame} from '../dist/sim.js';
import {ArenaSound} from '../dist/match-audio.js';
import {REVOLVER_RELOAD_CONTACT} from '../dist/revolver-timing.js';

function advance(game,input,seconds){
  for(let i=0;i<Math.ceil(seconds*60);i++)stepGame(game,{local:{slot:2,...input}},1/60);
}

test('a selected revolver keeps its six-shot cylinder across slots, requires distinct presses and replenishes on reload',()=>{
  for(const training of [false,true]){
    const loadout={id:'local',sidearm:'revolver',weapon:'smg',team:0};
    const game=training?createRange(loadout):createGame({size:1,players:[loadout],warmup:15});
    const p=game.players[0],reserve=training?null:36;
    advance(game,{},.4);
    assert.deepEqual([p.active,p.ammo,p.reserve],['revolver',6,reserve]);
    advance(game,{fire:true},1);assert.equal(p.ammo,5);
    advance(game,{slot:1},.5);assert.deepEqual([p.active,p.ammo],['smg',30]);
    advance(game,{},.4);assert.equal(p.ammo,5);
    for(let i=0;i<5;i++){
      advance(game,{fire:true},.02);advance(game,{},.45);
    }
    assert.equal(p.ammo,0);
    advance(game,{reload:true},.18);advance(game,{slot:3},.15);
    advance(game,{},.40);assert.equal(p.ammo,0);
    advance(game,{reload:true},.10);advance(game,{},1.90);
    assert.deepEqual([p.ammo,p.reserve],[6,training?null:30]);
  }
  const old=createRange({sidearm:'unknown'});
  advance(old,{},.4);assert.equal(old.players[0].active,'pistol');
});

test('the four revolver reload recordings follow cylinder movement and a late event skips elapsed contacts',()=>{
  const audio=new ArenaSound();
  audio.ctx={state:'running',currentTime:0};
  const heard=[];audio.sample=(id,volume,pan,speed,delay)=>heard.push([id,delay]);
  const p={id:'local',active:'revolver',x:0,z:0,yaw:0,alive:true,reloadDuration:1.85,reload:1.85};
  const event={type:'reload',weapon:'revolver',actor:p.id};
  audio.playEvent(event,p,p);
  const names=['cylinderOpen','cylinderEject','loaderSeat','cylinderClose'];
  assert.deepEqual(heard.map(([id])=>id),names);
  Object.values(REVOLVER_RELOAD_CONTACT).forEach((t,i)=>assert.ok(Math.abs(heard[i][1]-1.85*t)<1e-6));
  heard.length=0;p.reload=.8;audio.playEvent(event,p,p);
  assert.deepEqual(heard.map(([id])=>id),names.slice(2));
});
