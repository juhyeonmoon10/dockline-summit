import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { OnlineHost } from '../dist/online-host.js';

const sourceURL = new URL('../dist/online-net.js', import.meta.url);
const source = (await readFile(sourceURL, 'utf8')).replace(/^import .*\n/, '')
  .replace('export class OnlineRoomClient', 'class OnlineRoomClient')
  .replaceAll('import.meta.url', JSON.stringify(sourceURL.href));

function harness() {
  const peers = new Map(), workers = new Set();
  class Connection extends EventEmitter {
    constructor(peer, options) { super(); this.peer = peer; Object.assign(this, options); this.open = false; this.dataChannel = { bufferedAmount: 0 }; }
    send(packet) {
      assert.ok(this.open);
      const copy = structuredClone(packet);
      queueMicrotask(() => { if (this.other.open) this.other.emit('data', copy); });
    }
    close() {
      if (this.closed) return;
      this.closed = true; this.open = false;
      this.emit('close'); this.other?.close();
    }
  }
  class FakePeer extends EventEmitter {
    constructor(id = webcrypto.randomUUID()) {
      super(); this.id = id; this.connections = []; this.destroyed = false;
      queueMicrotask(() => {
        if (this.destroyed) return;
        if (peers.has(id)) this.emit('error', { type: 'unavailable-id' });
        else { peers.set(id, this); this.emit('open', id); }
      });
    }
    connect(id, options) {
      const mine = new Connection(id, options), other = new Connection(this.id, options);
      mine.other = other; other.other = mine; this.connections.push(mine);
      queueMicrotask(() => {
        const remote = peers.get(id);
        if (!remote) { this.emit('error', { type: 'peer-unavailable' }); return; }
        remote.connections.push(other); remote.emit('connection', other);
        if (other.closed) return;
        mine.open = other.open = true; other.emit('open'); mine.emit('open');
      });
      return mine;
    }
    destroy() {
      this.destroyed = true;
      if (peers.get(this.id) === this) peers.delete(this.id);
      for (const c of this.connections) c.close();
      this.emit('close');
    }
    reconnect() { this.disconnected = false; }
  }
  class FakeWorker {
    constructor() { workers.add(this); }
    emit(data) { queueMicrotask(() => { if (!this.terminated) this.onmessage?.({ data: structuredClone(data) }); }); }
    postMessage({ type, requestId, id, fields, action }) {
      queueMicrotask(() => {
        if (this.terminated) return;
        try {
          let data;
          if (type === 'init') {
            this.host = new OnlineHost({ ...fields, onRoom: data => this.emit({ type: 'room', data }), onGame: data => this.emit({ type: 'game', data }) });
            data = this.host.room;
          } else if (type === 'join') data = this.host.join(id, fields);
          else if (type === 'remove') data = this.host.remove(id);
          else data = this.host.action(id, action, fields);
          if (requestId) this.emit({ type: 'result', requestId, data });
        } catch (error) { if (requestId) this.emit({ type: 'result', requestId, error: error.message }); }
      });
    }
    terminate() { this.terminated = true; workers.delete(this); this.host?.destroy(); }
  }
  const context = vm.createContext({ Peer: FakePeer, Worker: FakeWorker, crypto: webcrypto, performance, URL, structuredClone,
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {} });
  vm.runInContext(source + '\nglobalThis.Client = OnlineRoomClient;', context);
  return { Client: context.Client, peers, workers };
}

const settled = () => new Promise(resolve => setTimeout(resolve, 10));

test('online transport joins by code, binds identity, gates host actions, and closes guests', async () => {
  const { Client, workers } = harness();
  const games = [], closes = [];
  const host = new Client(), guest = new Client({ onGame: game => games.push(game), onClose: message => closes.push(message) });
  try {
    const room = await host.create({ name: '방장', size: 2 });
    assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
    await guest.join({ name: '친구', code: room.code.toLowerCase() });
    await settled();
    assert.equal(host.room.players.length, 2);
    assert.equal(guest.room.players.length, 2);
    assert.notEqual(guest.id, host.id);
    await assert.rejects(guest.start(true), /방장만/);
    await assert.rejects(host.start(true), /준비/);
    await guest.ready();
    await host.start(true);
    await settled();
    assert.equal(guest.room.phase, 'playing');
    assert.equal(games.at(-1).players.length, 4);
    guest.input({ slot: 3, yaw: .3, pitch: 0, forward: 1, fire: true });
    guest.flush(); await settled();
    const engine = [...workers][0].host;
    assert.equal(engine.members.get(guest.id).lastInput.slot, 3);
    assert.equal(engine.members.get(host.id).lastInput.slot, undefined);
    await host.leave(); await settled();
    assert.equal(closes.length, 1);
    assert.match(closes[0], /방장/);
    assert.equal(guest.closed, true);
  } finally { await host.leave(); await guest.leave(); }
});

test('online input preserves tap edges and skips congested snapshots', async () => {
  const { Client } = harness();
  const client = new Client();
  client.begin(); client.entered = true; client.room = { phase: 'playing' };
  try {
    client.input({ fire: true, jump: true, slot: 3 });
    client.input({ fire: false, jump: false, forward: 1, slot: 3 });
    assert.equal(client.pendingInput.fire, true);
    assert.equal(client.pendingInput.jump, true);
    const sent = [], connection = { open: true, dataChannel: { bufferedAmount: 140000 }, send: packet => sent.push(packet) };
    assert.equal(client.send(connection, { type: 'game' }, true), false);
    assert.equal(client.send(connection, { type: 'room' }), true);
    assert.equal(sent.length, 1);
  } finally { await client.leave(); }
});

test('cancelling pending entry releases peer resources and missing codes fail', async () => {
  const { Client, peers } = harness();
  const cancelled = new Client();
  const creating = cancelled.create({ name: '방장', size: 2 });
  await cancelled.leave();
  await assert.rejects(creating, /종료/);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(peers.size, 0);
  const guest = new Client();
  try { await assert.rejects(guest.join({ name: '친구', code: 'ZZZZZZ' }), /방이 없습니다/); }
  finally { await guest.leave(); }
});

test('join capacity and identity cannot be overridden by request payload', async () => {
  const { Client, workers } = harness();
  const host = new Client(), guests = [new Client(), new Client(), new Client(), new Client()];
  try {
    const { code } = await host.create({ name: '방장', size: 2 });
    for (let i = 0; i < 3; i++) await guests[i].join({ name: '친구' + i, code });
    await assert.rejects(guests[3].join({ name: '초과', code }), /가득/);
    await guests[0].remoteRequest('weapon', { weapon: 'sniper', id: host.id, playerId: host.id });
    const engine = [...workers][0].host;
    assert.equal(engine.members.get(guests[0].id).player.weapon, 'sniper');
    assert.equal(engine.members.get(host.id).player.weapon, 'rifle');
  } finally { for (const client of [host, ...guests]) await client.leave(); }
});
