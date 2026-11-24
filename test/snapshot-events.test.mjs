import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotEvents } from '../dist/snapshot-events.js';
import { gameSnapshot } from '../dist/game-snapshot.js';

const shot={seq:1,type:'shot',actor:'remote',weapon:'shotgun',at:2,pellets:[{ex:3,ey:1,ez:4}]};
const hit={seq:2,type:'hit',actor:'remote',target:'local'};
const state=(seq,elapsed,events,round=1)=>({seq,elapsed,events,round});

test('a volley received between draws survives later shotgun filtering and is consumed exactly once',()=>{
  const queue=new SnapshotEvents();
  queue.frame(0);
  queue.receive(gameSnapshot(state(2,2,[shot,hit])),10);
  queue.receive(gameSnapshot(state(2,2.1,[shot,hit])),110);
  const later=gameSnapshot(state(2,2.36,[shot,hit]));
  assert.deepEqual(later.events,[hit]);
  queue.receive(later,370);
  assert.deepEqual(queue.frame(375),[shot,hit]);
  queue.acknowledge(2,0); // Audio and HUD ran on a frame that Lite skipped.
  assert.deepEqual(queue.frame(390),[shot,hit]);
  queue.acknowledge(1,2);
  assert.deepEqual(queue.frame(398),[hit]);
  queue.acknowledge(2,2);
  // Another retained copy from the transport must not resurrect a consumed shot.
  queue.receive(state(2,2.42,[shot,hit]),430);
  assert.deepEqual(queue.frame(432),[]);
});

test('an idle tab discards old bursts without suppressing a shot just received on resume',()=>{
  const queue=new SnapshotEvents();
  queue.frame(0);
  queue.receive(state(1,2,[shot]),20);
  // Old worker messages can also arrive together in a burst of JS tasks after a stall.
  const old={seq:2,type:'reload'},fresh={...shot,seq:3,at:6};
  queue.receive(state(2,3,[old]),4010);
  // Some actions lack a timestamp on older hosts. The intermediate snapshot
  // still identifies their age. New hosts also timestamp individual actions.
  const historical={seq:4,type:'kill',at:4};
  queue.receive(state(4,6,[fresh,historical]),4015);
  assert.deepEqual(queue.frame(4020),[fresh]);
});

test('round changes, same-round warmup transitions and restarted games do not leak pending shots',()=>{
  const queue=new SnapshotEvents();
  queue.receive(state(1,2,[shot]),0);
  const round={seq:2,type:'round',round:1};
  queue.receive(state(2,2.1,[shot,round]),100);
  assert.deepEqual(queue.frame(100),[round]);
  const nextRound={seq:3,type:'round',round:2},fresh={...shot,seq:4,at:2.2};
  queue.receive(state(4,2.2,[shot,round,nextRound,fresh],2),200);
  assert.deepEqual(queue.frame(200),[nextRound,fresh]);
  assert.equal(queue.receive(state(1,.1,[{...shot,at:.1}]),300),true);
  assert.deepEqual(queue.frame(300),[{...shot,at:.1}]);
  queue.reset();
  assert.deepEqual(queue.frame(310),[]);
  queue.receive(state(1,.1,[{...shot,at:.1}]),311);
  assert.equal(queue.frame(312).length,1);
});

test('pending events are bounded by the authoritative history length',()=>{
  const queue=new SnapshotEvents();
  for(let seq=1;seq<=60;seq++)queue.receive(state(seq,seq*.001,[{seq,type:'shot'}]),seq);
  const events=queue.frame(61);
  assert.equal(events.length,40);
  assert.equal(events[0].seq,21);
  assert.equal(events.at(-1).seq,60);
});
