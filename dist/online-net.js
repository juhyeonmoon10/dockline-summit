import { Peer } from './vendor/peerjs.js';

const PROTOCOL = 2;
const PREFIX = 'dockline-v2-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRIMARY = new Set(['rifle', 'shotgun', 'sniper']);
const ACTIONS = new Set(['ready', 'team', 'weapon', 'start', 'lobby', 'input']);
const CLOSED = '방 연결이 종료됐습니다.';
const CONNECT_FAILED = '방에 연결하지 못했습니다. 코드를 확인하고, 학교 Wi-Fi에서 안 되면 다른 네트워크로 시도해 주세요.';
const errorText = error => error?.type === 'peer-unavailable' ? '이 코드의 방이 없습니다. 방장이 방을 열어 뒀는지 확인해 주세요.' :
  error?.type === 'browser-incompatible' ? '온라인 대전은 최신 Chrome에서 이용해 주세요.' : CONNECT_FAILED;
const codeForRoom = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => ALPHABET[n % ALPHABET.length]).join('');
const packetOK = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  try { return JSON.stringify(data).length <= 32768; } catch { return false; }
};

export class OnlineRoomClient {
  constructor({ onRoom, onGame, onError, onClose } = {}) {
    Object.assign(this, { onRoom, onGame, onError, onClose });
    this.online = true;
    this.id = this.room = this.peer = this.connection = this.worker = null;
    this.closed = true;
    this.epoch = 0;
    this.requestId = 0;
    this.pending = new Map();
    this.guests = new Map();
    this.unload = () => { this.leave(); };
  }

  begin() {
    this.leave();
    this.closed = false;
    this.entered = false;
    this.isHost = false;
    this.inputSeq = 0;
    this.pendingInput = null;
    addEventListener('pagehide', this.unload);
    return this.epoch;
  }

  assertActive(epoch) {
    if (this.closed || this.epoch !== epoch) throw Error(CLOSED);
  }

  async openPeer(id, epoch) {
    const peer = this.peer = new Peer(id, { debug: 0 });
    peer.on('connection', connection => {
      if (this.peer !== peer || this.closed || !this.isHost) { connection.close(); return; }
      this.accept(connection);
    });
    peer.on('call', call => call.close());
    peer.on('disconnected', () => {
      if (this.peer !== peer || this.closed) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.peer === peer && !peer.destroyed && peer.disconnected && !this.closed) {
          try { peer.reconnect(); } catch { /* Existing data channels remain usable. */ }
        }
      }, 1500);
    });
    peer.on('error', error => {
      if (this.peer !== peer || this.closed) return;
      if (this.joinReject) this.joinReject(Error(errorText(error)));
      else if (this.entered && error.type === 'unavailable-id')
        this.onError?.('방 코드 연결이 끊겼습니다. 현재 경기는 계속할 수 있지만 새 참가자는 새 방으로 초대해 주세요.');
      else if (this.entered && peer.destroyed) this.lost(errorText(error));
    });
    peer.on('close', () => {
      if (this.peer === peer && !this.closed && this.entered) this.lost('온라인 연결이 종료됐습니다. 새 방을 만들어 주세요.');
    });
    await new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        peer.off('open', opened);
        peer.off('error', failed);
        if (this.openCancel === cancel) this.openCancel = null;
        error ? reject(error) : resolve(value);
      };
      const opened = value => finish(null, value);
      const failed = error => finish(Object.assign(Error(errorText(error)), { type: error.type }));
      const cancel = () => finish(Error(CLOSED));
      const timer = setTimeout(() => finish(Error('온라인 연결이 지연되고 있습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.')), 15000);
      this.openCancel = cancel;
      peer.on('open', opened);
      peer.on('error', failed);
    });
    this.assertActive(epoch);
    return peer;
  }

  async create({ name, size, weapon = 'rifle' }) {
    const epoch = this.begin();
    this.isHost = true;
    try {
      let code;
      for (let attempt = 0; attempt < 4; attempt++) {
        code = codeForRoom();
        try { await this.openPeer(PREFIX + code, epoch); break; }
        catch (error) {
          this.assertActive(epoch);
          const old = this.peer; this.peer = null; old?.destroy();
          if (error.type !== 'unavailable-id' || attempt === 3) throw error;
        }
      }
      this.assertActive(epoch);
      this.id = 'host-' + crypto.randomUUID();
      this.worker = new Worker(new URL('./online-worker.js', import.meta.url), { type: 'module' });
      const worker = this.worker;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || this.closed) return;
        if (data.type === 'result') this.resolveRequest(data.requestId, data);
        else if (data.type === 'room' || data.type === 'game') {
          this.broadcast({ type: data.type, data: data.data }, data.type === 'game');
          this.receiveState(data.type, data.data);
        }
      };
      worker.onerror = () => {
        if (this.worker === worker && !this.closed) this.lost('방장 경기 처리가 중단됐습니다. 새 방을 만들어 주세요.');
      };
      const room = await this.workerRequest('init', { fields: { code, size, hostId: this.id, name, weapon } });
      this.assertActive(epoch);
      this.entered = true;
      this.receiveState('room', room);
      this.startLoops();
      return room;
    } catch (error) { if (this.epoch === epoch) await this.leave(); throw error; }
  }

  async join({ name, code, weapon = 'rifle' }) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw Error('영문·숫자 방 코드 6자리를 입력해 주세요.');
    const epoch = this.begin();
    try {
      const peer = await this.openPeer(undefined, epoch);
      const connection = this.connection = peer.connect(PREFIX + code, {
        reliable: true, serialization: 'json', metadata: { game: 'dockline', protocol: PROTOCOL }
      });
      this.lastHostAt = performance.now();
      connection.on('data', data => this.guestMessage(connection, data));
      connection.on('close', () => {
        if (this.connection === connection && !this.closed) {
          const message = '방장과 연결이 끊겼습니다. 방장이 나갔다면 새 방 코드로 참가해 주세요.';
          if (this.joinReject) this.joinReject(Error(message));
          else this.lost(message);
        }
      });
      connection.on('error', () => {
        if (this.connection !== connection || this.closed) return;
        if (this.joinReject) this.joinReject(Error(CONNECT_FAILED));
        else this.lost(CONNECT_FAILED);
      });
      const result = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (this.joinReject === failed) this.joinReject = null;
          error ? reject(error) : resolve(value);
        };
        const failed = error => finish(error);
        this.joinReject = failed;
        const timer = setTimeout(() => finish(Error(CONNECT_FAILED)), 18000);
        connection.on('open', () => {
          if (this.closed || this.epoch !== epoch || this.connection !== connection) return;
          this.remoteRequest('join', { name, weapon, protocol: PROTOCOL }).then(value => finish(null, value), failed);
        });
      });
      this.assertActive(epoch);
      this.id = result.id;
      this.entered = true;
      this.receiveState('room', result.room);
      this.startLoops();
      return this.room;
    } catch (error) { if (this.epoch === epoch) await this.leave(); throw error; }
  }

  pendingRequest(send, timeout = 10000) {
    if (this.closed) return Promise.reject(Error(CLOSED));
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(Error('응답이 늦어지고 있습니다. 연결 상태를 확인하고 다시 시도해 주세요.'));
      }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      try { send(requestId); } catch (error) { this.resolveRequest(requestId, { error: error.message }); }
    });
  }

  resolveRequest(requestId, result) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(requestId);
    result.error ? pending.reject(Error(result.error)) : pending.resolve(result.data);
  }

  workerRequest(type, fields) {
    return this.pendingRequest(requestId => {
      if (!this.worker) throw Error(CLOSED);
      this.worker.postMessage({ type, requestId, ...fields });
    });
  }

  remoteRequest(action, body = {}) {
    return this.pendingRequest(requestId => {
      if (!this.send(this.connection, { type: 'request', requestId, action, body })) throw Error(CLOSED);
    });
  }

  send(connection, packet, disposable = false) {
    if (!connection?.open) return false;
    const buffered = connection.dataChannel?.bufferedAmount || 0;
    if (disposable && buffered > 128 * 1024) return false;
    if (buffered > 512 * 1024) { connection.close(); return false; }
    try { connection.send(packet); return true; } catch { return false; }
  }

  broadcast(packet, disposable = false) {
    for (const member of this.guests.values()) if (member.joined) this.send(member.connection, packet, disposable);
  }

  receiveState(type, data) {
    if (type === 'room') { this.room = data; if (this.entered) this.onRoom?.(data); }
    else if (type === 'game' && this.entered) this.onGame?.(data);
  }

  accept(connection) {
    const metadata = connection.metadata;
    if (this.guests.size >= 7 || metadata?.game !== 'dockline' || metadata?.protocol !== PROTOCOL ||
        connection.serialization !== 'json' || this.guests.has(connection.peer)) { connection.close(); return; }
    const now = performance.now();
    const member = { connection, id: 'guest-' + crypto.randomUUID(), joined: false, joining: false, acceptedAt: now, lastAt: now, windowAt: now, count: 0 };
    this.guests.set(connection.peer, member);
    const drop = () => this.dropGuest(member);
    connection.on('close', drop);
    connection.on('error', drop);
    connection.on('data', data => this.hostMessage(member, data));
  }

  dropGuest(member) {
    if (this.guests.get(member.connection.peer) !== member) return;
    this.guests.delete(member.connection.peer);
    // A join may already be queued in the Worker even if its reply has not arrived.
    if (this.worker && !this.closed) this.worker.postMessage({ type: 'remove', id: member.id });
    member.connection.close();
  }

  async hostMessage(member, packet) {
    if (this.closed || this.guests.get(member.connection.peer) !== member) return;
    if (!packetOK(packet)) { this.dropGuest(member); return; }
    const now = performance.now();
    if (now - member.windowAt >= 1000) { member.windowAt = now; member.count = 0; }
    if (++member.count > 100) { this.dropGuest(member); return; }
    member.lastAt = now;
    if (packet.type === 'ping') { this.send(member.connection, { type: 'pong' }); return; }
    if (packet.type === 'pong') return;
    if (packet.type === 'leave') { this.dropGuest(member); return; }
    if (packet.type === 'input' && member.joined) {
      this.worker?.postMessage({ type: 'action', id: member.id, action: 'input', fields: { input: packet.input, seq: packet.seq } });
      return;
    }
    if (packet.type !== 'request' || !Number.isSafeInteger(packet.requestId) || packet.requestId < 1) return;
    const reply = result => this.send(member.connection, { type: 'result', requestId: packet.requestId, ...result });
    let joining = false;
    try {
      let data;
      if (packet.action === 'join') {
        if (member.joined || member.joining) throw Error('이미 참가 중입니다.');
        if (packet.body?.protocol !== PROTOCOL) throw Error('게임을 새로고침한 뒤 다시 참가해 주세요.');
        member.joining = true;
        joining = true;
        const room = await this.workerRequest('join', { id: member.id, fields: packet.body });
        if (this.closed || this.guests.get(member.connection.peer) !== member) {
          this.worker?.postMessage({ type: 'remove', id: member.id }); return;
        }
        member.joined = true;
        data = { id: member.id, room };
      } else {
        if (!member.joined || !ACTIONS.has(packet.action) || packet.action === 'input') throw Error('지원하지 않는 요청입니다.');
        data = await this.workerRequest('action', { id: member.id, action: packet.action, fields: packet.body || {} });
      }
      reply({ data });
    } catch (error) {
      if (joining && !member.joined) this.worker?.postMessage({ type: 'remove', id: member.id });
      reply({ error: error.message });
    } finally { if (joining) member.joining = false; }
  }

  guestMessage(connection, packet) {
    if (this.connection !== connection || this.closed || !packetOK(packet)) return;
    this.lastHostAt = performance.now();
    if (packet.type === 'ping') this.send(connection, { type: 'pong' });
    else if (packet.type === 'result') this.resolveRequest(packet.requestId, packet);
    else if (packet.type === 'room' || packet.type === 'game') this.receiveState(packet.type, packet.data);
    else if (packet.type === 'closed') {
      const message = '방장이 방을 닫았습니다. 새 방 코드로 다시 참가해 주세요.';
      if (this.joinReject) this.joinReject(Error(message)); else this.lost(message);
    }
  }

  startLoops() {
    this.sendLoop = setInterval(() => this.flush(), 40);
    this.healthLoop = setInterval(() => {
      const now = performance.now();
      if (this.isHost) {
        for (const member of this.guests.values()) {
          if (member.joined ? now - member.lastAt > 16000 : now - member.acceptedAt > 20000) this.dropGuest(member);
          else this.send(member.connection, { type: 'ping' });
        }
      } else if (now - this.lastHostAt > 16000) this.lost('방장 응답이 끊겼습니다. 인터넷 연결을 확인하고 방 코드로 다시 참가해 주세요.');
      else this.send(this.connection, { type: 'ping' });
    }, 2000);
  }

  request(action, fields) {
    return this.isHost ? this.workerRequest('action', { id: this.id, action, fields }) : this.remoteRequest(action, fields);
  }
  ready(ready = true) { return this.request('ready', { ready }); }
  weapon(weapon) { return this.request('weapon', { weapon }); }
  team(team) { return this.request('team', { team }); }
  start(fillBots = false) { return this.request('start', { fillBots }); }
  lobby() { return this.request('lobby', {}); }

  input(input) {
    if (this.closed || !this.entered || this.room?.phase !== 'playing') return;
    const next = { ...input };
    if (!PRIMARY.has(next.weapon)) delete next.weapon;
    for (const key of ['fire', 'slide', 'jump', 'reload']) if (this.pendingInput?.[key]) next[key] = true;
    this.pendingInput = next;
  }

  flush() {
    if (!this.pendingInput || this.closed) return;
    const fields = { input: this.pendingInput, seq: ++this.inputSeq };
    this.pendingInput = null;
    if (this.isHost) this.worker?.postMessage({ type: 'action', id: this.id, action: 'input', fields });
    else this.send(this.connection, { type: 'input', ...fields }, true);
  }

  lost(message) {
    if (this.closed) return;
    this.leave();
    (this.onClose || this.onError)?.(message);
  }

  async leave() {
    this.closed = true;
    this.entered = false;
    this.epoch++;
    clearInterval(this.sendLoop); clearInterval(this.healthLoop); clearTimeout(this.reconnectTimer);
    removeEventListener('pagehide', this.unload);
    this.openCancel?.(); this.openCancel = null;
    this.joinReject?.(Error(CLOSED)); this.joinReject = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(Error(CLOSED)); }
    this.pending.clear();
    if (this.isHost) this.broadcast({ type: 'closed' });
    else this.send(this.connection, { type: 'leave' });
    const peer = this.peer;
    this.peer = this.connection = null;
    this.worker?.terminate(); this.worker = null;
    this.guests.clear();
    // Give the reliable channel one task to deliver the explicit leave message.
    if (peer) setTimeout(() => peer.destroy(), 30);
    this.id = this.room = this.pendingInput = null;
  }
}
