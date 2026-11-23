import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaSound} from '../dist/match-audio.js';
import {reloadClips} from '../dist/weapon-foley.js';
import {RELOAD_CONTACT, SNIPER_RELOAD_CONTACT, SHOT_MECHANIC} from '../dist/weapon-view.js';

function listen(){
  const audio=new ArenaSound(),calls=[];
  audio.ctx={state:'running',currentTime:1};
  audio.sample=(id,volume,pan,rate,delay,options)=>calls.push({id,volume,pan,rate,delay,options});
  return {audio,calls};
}
const player=(id,active,x=0)=>({id,active,x,z:0,yaw:0,ammo:3,alive:true});
const shot=(actor,weapon)=>({type:'shot',actor:actor.id,weapon,x:actor.x,z:actor.z});
const near=(actual,want)=>assert.ok(Math.abs(actual-want)<.00001,`${actual} vs ${want}`);

test('automatic reports alternate recordings at their original pitch independently for each shooter',()=>{
  for(const weapon of ['rifle','smg','burst','lmg']){
    const {audio,calls}=listen(),local=player('local',weapon),remote=player('remote',weapon,9);
    audio.buffers.set(weapon,true);audio.buffers.set(weapon+'-2',true);
    for(const actor of [local,remote,local,local])audio.event(shot(actor,weapon),{players:[actor]},local);
    assert.deepEqual(calls.map(c=>c.id),[weapon,weapon,weapon+'-2',weapon]);
    assert.ok(calls.every(c=>c.rate===1));
    assert.equal(calls[0].pan,0);assert.equal(calls[0].delay,0);
    assert.ok(calls[1].volume<calls[0].volume&&calls[1].pan>0&&calls[1].delay>0);
  }
});

test('magazines, individual shells and the empty sniper action are played at their animated contacts',()=>{
  for(const weapon of ['rifle','pistol','smg','burst','lmg','marksman','sniper','shotgun']){
    const {audio,calls}=listen(),actor=player('local',weapon);
    actor.ammo=0;actor.reloadDuration=actor.reload=2;
    audio.playEvent({type:'reload',weapon},actor,actor);
    const clips=reloadClips(weapon),phase=weapon==='sniper'?SNIPER_RELOAD_CONTACT:RELOAD_CONTACT;
    const expected=weapon==='shotgun'?[['shell',RELOAD_CONTACT.shell]]:
      [[clips.out,phase.release],[clips.seat,phase.seat],...(clips.settle?[[clips.settle,phase.settle]]:[])];
    if(weapon==='sniper')expected.push(['boltClose',phase.empty]);
    assert.deepEqual(calls.map(c=>c.id),expected.map(([id])=>id));
    calls.forEach((c,i)=>{near(c.delay,expected[i][1]*2);assert.equal(c.rate,1);});
    if(weapon==='shotgun'){
      calls.length=0;actor.ammo=1;audio.playEvent({type:'reload',weapon},actor,actor);
      assert.deepEqual(calls.map(c=>c.id),['shellAlt']);
    }
  }
  for(const [weapon,open,close] of [['sniper','boltOpen','boltClose'],['shotgun','pumpOpen','pumpClose']]){
    const {audio,calls}=listen(),actor=player('local',weapon);
    audio.playEvent(shot(actor,weapon),actor,actor);
    assert.deepEqual(calls.map(c=>c.id),[weapon,open,close]);
    near(calls[1].delay,SHOT_MECHANIC[weapon].open);near(calls[2].delay,SHOT_MECHANIC[weapon].close);
  }
});

test('a cold buffered shot can sound after a weapon switch without scheduling that old weapon’s reload or action',()=>{
  const {audio,calls}=listen(),actor=player('local','sniper'),game={players:[actor]};
  actor.reload=actor.reloadDuration=2;
  audio.event(shot(actor,'sniper'),game,actor);
  audio.event({type:'reload',actor:actor.id,weapon:'sniper'},game,actor);
  actor.active='pistol';actor.reload=0;audio.reconcile(game);
  audio.buffers.set('sniper',true);audio.flushPending();
  assert.deepEqual(calls.map(c=>c.id),['sniper']);
  assert.equal(audio.pending.length,0);
});
