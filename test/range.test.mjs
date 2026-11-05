import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createRange, eyeHeight, stepGame } from '../dist/sim.js';

function advance(game, seconds) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= .25) {
    stepGame(game, {}, Math.min(remaining,.25));
  }
}

function shoot(game, input={}) {
  stepGame(game, { [game.players[0].id]:{fire:true,...input} }, 1/60);
}

function aim(player, target, height) {
  const dx = target.x-player.x, dz = target.z-player.z;
  return { yaw:Math.atan2(dx,-dz), pitch:Math.atan2(target.y+height-player.y-eyeHeight(player), Math.hypot(dx,dz)) };
}

test('starting aim lands body hits, dummies fall and return without starting a match', () => {
  const game = createRange(), p = game.players[0], near = game.targets[0];
  assert.deepEqual(game.players.map(player=>player.bot), [false]);
  for (let i=0; i<4; i++) {
    if (i) advance(game,.15);
    shoot(game);
  }
  assert.deepEqual(game.range,{shots:4,hits:4,kills:1});
  assert.equal(near.hp,0);
  assert.equal(near.alive,false);
  advance(game,.2);
  shoot(game);
  assert.deepEqual(game.range,{shots:5,hits:4,kills:1});
  advance(game,1.1);
  assert.equal(near.alive,false);
  advance(game,.25);
  assert.equal(near.alive,true);
  assert.equal(near.hp,near.maxHp);
  advance(game,90);
  assert.equal(game.phase,'range');
  assert.equal(p.hp,100);
  assert.ok(game.events.every(e=>e.actor===p.id));
});

test('every dummy can be hit from spawn, including an elevated headshot', () => {
  const template = createRange();
  assert.ok(template.targets.length>=4);
  for (let i=0; i<template.targets.length; i++) {
    const game = createRange({weapon:'sniper'}), target=game.targets[i];
    shoot(game,{...aim(game.players[0],target,1.61),ads:true});
    assert.equal(target.hp,0,target.name);
    assert.ok(game.events.some(e=>e.type==='hit' && e.target===target.id && e.headshot));
    assert.deepEqual(game.range,{shots:1,hits:1,kills:1});
  }
});

test('a pellet volley counts as one shot, and weapon changes remain available', () => {
  const game = createRange({weapon:'shotgun'}), p=game.players[0], near=game.targets[0];
  p.z=near.z+1.5;
  shoot(game,aim(p,near,1.1));
  assert.deepEqual(game.range,{shots:1,hits:1,kills:1});
  stepGame(game,{[p.id]:{weapon:'sniper',slot:1}});
  assert.equal(p.active,'sniper');
  stepGame(game,{[p.id]:{slot:2}});
  assert.equal(p.active,'pistol');
});

test('the steel stand and targets hidden by solid cover do not score', () => {
  const game=createRange({weapon:'sniper'}), p=game.players[0], target=game.targets[0];
  shoot(game,{...aim(p,target,.34),ads:true});
  advance(game,1.1);
  p.x=-6.9; p.z=6;
  target.x=-6.9; target.z=14;
  shoot(game,{...aim(p,target,1.14),ads:true});
  assert.deepEqual(game.range,{shots:2,hits:0,kills:0});
  assert.equal(target.hp,100);
});

test('an ordinary team room still proceeds from warmup into a round', () => {
  const game=createGame({size:3,warmup:1});
  assert.equal(game.targets.length,2);
  advance(game,1.1);
  assert.equal(game.phase,'round');
  assert.equal(game.targets.length,0);
  assert.equal(game.players.length,6);
  assert.equal(game.range,undefined);
});
