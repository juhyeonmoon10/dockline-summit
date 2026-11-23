import test from 'node:test';
import assert from 'node:assert/strict';
import { clearBufferedFire, createRange, stepGame } from '../dist/sim.js';
import { approachAim, gunPresentation } from '../dist/weapon-view.js';
import { PRIMARY_WEAPONS } from '../dist/balance.js';

const step=(game,fire,time)=>stepGame(game,{local:{fire}},time);

test('a short tap at the end of the marksman recovery fires exactly once',()=>{
  const game=createRange({weapon:'marksman'}),p=game.players[0];
  step(game,true,.01);step(game,false,.24);
  step(game,true,.01);step(game,false,.11);
  assert.equal(p.ammo,8);
  step(game,false,.25);assert.equal(p.ammo,8);
});

test('the pistol fires one round per press even when the network repeats a held input',()=>{
  const game=createRange(),p=game.players[0];
  for(let i=0;i<40;i++)stepGame(game,{local:{slot:2,fire:true}},1/30);
  assert.equal(p.ammo,12);
  stepGame(game,{local:{slot:2,fire:false}},1/30);
  stepGame(game,{local:{slot:2,fire:true}},1/30);
  assert.equal(p.ammo,11);
});

test('an early tap expires and a pause clears a queued press',()=>{
  for(const pause of [false,true]){
    const game=createRange({weapon:'marksman'}),p=game.players[0];
    step(game,true,.01);step(game,false,pause?.24:.03);step(game,true,.01);
    if(pause)clearBufferedFire(p);
    step(game,false,.25);step(game,false,.15);
    assert.equal(p.ammo,9);
  }
});

test('all firearm poses are distinct and the aim transition is frame-rate independent',()=>{
  const ids=[...PRIMARY_WEAPONS,'pistol'];
  assert.equal(new Set(ids.map(id=>JSON.stringify(gunPresentation(id)))).size,8);
  for(const id of ids){
    const a=approachAim(0,true,1/30,id),b=approachAim(approachAim(0,true,1/60,id),true,1/60,id);
    assert.ok(Math.abs(a-b)<1e-10);
  }
  assert.ok(approachAim(0,true,.08,'pistol')>approachAim(0,true,.08,'lmg'));
});
