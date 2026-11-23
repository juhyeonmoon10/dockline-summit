import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaSound} from '../dist/match-audio.js';
import {prepareShot,prepareAction,makeHandlingFoley} from '../dist/weapon-sound.js';
import {KNIFE_TIMING} from '../dist/knife-types.js';
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

test('a knife inspect schedules its contacts once and cancels unplayed catches on attack or switch',()=>{
  const {audio,calls}=listen(),actor={...player('local','knife'),knifeSkin:'balisong'};
  audio.sample=(id,gain,pan,rate,delay,options)=>{
    calls.push({id,delay,options});audio.voices.add({id,...options});
  };
  audio.stop=voice=>audio.voices.delete(voice);
  audio.handling(actor,Infinity,1);assert.ok(calls.some(c=>c.id==='hingeOpen'));
  audio.handling(actor,0,2);audio.handling(actor,.016,2.016);
  const catches=calls.filter(c=>['hingeFold','hingeOpen'].includes(c.id)&&c.options.handling==='inspect');
  assert.deepEqual(catches.map(c=>[c.id,c.delay]),[['hingeFold',KNIFE_TIMING.balisong.inspectFold],['hingeOpen',KNIFE_TIMING.balisong.inspectOpen]]);
  assert.ok([...audio.voices].every(v=>v.handling==='inspect'));
  audio.event({type:'melee',actor:actor.id,weapon:'knife',seq:1},{players:[actor]},actor);
  assert.equal([...audio.voices].filter(v=>v.handling).length,0);
  audio.handling(actor,0,3);actor.active='pistol';audio.handling(actor,Infinity,3.1);
  assert.ok(![...audio.voices].some(v=>v.handling==='inspect'||v.handling==='draw'&&v.weapon==='knife'));
  audio.cancelHandling();audio.handling(actor,Infinity,3.11);
  assert.ok(![...audio.voices].some(v=>v.handling));
});

test('the karambit uses one palm catch, and a late balisong inspection starts at its current movement',()=>{
  const {audio,calls}=listen(),actor={...player('local','knife'),knifeSkin:'karambit'};
  audio.handling(actor,0,3);
  assert.deepEqual(calls.filter(c=>c.id==='ringCatch').map(c=>c.delay),[KNIFE_TIMING.karambit.inspectCatch]);
  assert.ok(calls.every(c=>c.delay<KNIFE_TIMING.karambit.inspect));
  calls.length=0;actor.knifeSkin='balisong';audio.handling(actor,.59,4);
  assert.ok(!calls.some(c=>c.id==='hingeFold'));
  near(calls.find(c=>c.id==='hingeOpen').delay,KNIFE_TIMING.balisong.inspectOpen-.59);
});

test('authoritative swipes skip stale attacks and catch up immediately without waiting for gun downloads',()=>{
  const {audio,calls}=listen(),actor={...player('local','knife'),knifeSkin:'karambit'},game={players:[actor],elapsed:10};
  audio.pending.push({event:{type:'shot',actor:'someone',weapon:'rifle'},actor,view:actor,at:performance.now()});
  const event={type:'melee',actor:actor.id,knifeSkin:'balisong',at:9.96,seq:1};
  audio.event(event,game,actor);
  assert.equal(audio.pending.length,1);assert.equal(calls[0].id,'flipSwing');near(calls[0].options.offset,.04);
  calls.length=0;audio.event({...event,at:9.58},game,actor);assert.equal(calls.length,0);
  audio.ctx.state='suspended';audio.event({...event,at:10},game,actor);
  assert.equal(audio.pending.length,1);
});

test('delayed earlier melee confirmations leave a newer inspection playing',()=>{
  const {audio}=listen(),actor={...player('local','knife'),knifeSkin:'balisong'},game={players:[actor],elapsed:10};
  audio.held={actor:actor.id,item:'balisong'};audio.inspectClock=performance.now()/1000;
  const started=audio.inspectClock;
  audio.event({type:'melee',actor:actor.id,at:9.92},game,actor);
  assert.equal(audio.inspectClock,started);
  audio.event({type:'melee',actor:actor.id,at:9.60},game,actor);
  assert.equal(audio.inspectClock,started);
  audio.event({type:'melee',actor:actor.id,at:10},game,actor);
  assert.equal(audio.inspectClock,null);
});

test('resuming the same knife after pause or muting does not replay its draw catches',()=>{
  const {audio,calls}=listen(),actor={...player('local','knife'),knifeSkin:'balisong'};
  audio.handling(actor,Infinity,1);calls.length=0;
  audio.clear(true);audio.handling(actor,Infinity,2);
  assert.deepEqual(calls,[]);
  audio.enabled=false;actor.knifeSkin='karambit';audio.handling(actor,Infinity,3);
  audio.enabled=true;audio.handling(actor,Infinity,4);assert.deepEqual(calls,[]);
  audio.clear();audio.handling(actor,Infinity,5);assert.ok(calls.some(c=>c.id==='ringCatch'));
});

test('contact audio comes from the impact point and the two swings have different takes',()=>{
  const {audio,calls}=listen(),view=player('view','rifle',0),actor=player('away','knife',-1.3);
  for(const skin of ['karambit','balisong']){
    actor.knifeSkin=skin;audio.playEvent({type:'melee',weapon:'knife',seq:2},actor,view);
  }
  assert.deepEqual(calls.map(c=>c.id),['hookSwing','flipSwing']);
  audio.playEvent({type:'meleeImpact',x:-1.3,z:0,ex:.4,ez:0,seq:2},actor,view);
  assert.ok(calls[2].pan>0);assert.ok(calls[2].delay>0);
});

function buffers(rate){
  return {sampleRate:rate,createBuffer(channels,length,sampleRate){
    const data=Array.from({length:channels},()=>new Float32Array(length));
    return {sampleRate,length,numberOfChannels:channels,getChannelData:c=>data[c]};
  }};
}
test('stereo shot reflections preserve the same immediate attack and leave headroom for the mix',()=>{
  const ctx=buffers(22050),source=ctx.createBuffer(1,6000,ctx.sampleRate);
  source.getChannelData(0)[4]=.75;
  for(const id of ['rifle','pistol','shotgun','sniper','smg','burst','marksman','lmg']){
    const {near,mono}=prepareShot(ctx,source,id),left=near.getChannelData(0),right=near.getChannelData(1);
    assert.equal(mono.numberOfChannels,1);assert.equal(near.numberOfChannels,2);
    assert.equal(left[4],right[4]);assert.ok(left[4]>.65);
    assert.ok(left.some((v,i)=>Math.abs(v-right[i])>.002));assert.ok(left.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
  }
  assert.notDeepEqual(prepareAction(ctx,source,'lmg','magSeat').getChannelData(0),prepareAction(ctx,source,'pistol','pistolSeat').getChannelData(0));
  for(const cue of makeHandlingFoley(ctx).values()){
    const data=cue.getChannelData(0);
    assert.ok(data.every(Number.isFinite)&&data.some(v=>Math.abs(v)>.55));assert.equal(Math.abs(data.at(-1)),0);
  }
});
