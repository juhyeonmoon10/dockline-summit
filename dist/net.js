const PRIMARY = new Set(['rifle', 'shotgun', 'sniper']);
const protocolVersion = 1;
const api = path => new URL('api/' + path, new URL('./', location.href));

export async function supportsLAN() {
  if (!['http:', 'https:'].includes(location.protocol)) return false;
  const controller = new AbortController();
  // Low-power machines can spend several seconds compiling the initial WebGL scene.
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(api('capabilities'), { cache: 'no-store', signal: controller.signal });
    return r.ok && (await r.json()).docklineLAN === protocolVersion;
  } catch { return false; } finally { clearTimeout(timer); }
}

export class RoomClient {
  constructor({ onRoom, onGame, onError, onClose } = {}) {
    Object.assign(this, { onRoom, onGame, onError, onClose });
    this.id = null;
    this.room = null;
    this.token = null;
    this.stream = null;
    this.pendingInput = null;
    this.postingInput = false;
    this.inputSeq = 0;
    this.unload = () => {
      if (this.token) this.post('leave', {}, { keepalive: true }).catch(() => {});
    };
  }
  async post(action, fields, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const response = await fetch(api(action), {
      method: 'POST', headers, body: JSON.stringify(fields), cache: 'no-store', ...options
    });
    if (response.status === 204) return;
    let data;
    try { data = await response.json(); } catch { throw new Error('도크라인 경기 서버에 연결해 주세요.'); }
    if (!response.ok) throw new Error(data.error || '요청을 처리할 수 없습니다.');
    return data;
  }
  async enter(action, fields) {
    if (this.token) await this.leave();
    const result = await this.post(action, fields);
    this.token = result.token;
    this.id = result.id;
    this.room = result.room;
    const url = api('stream');
    url.searchParams.set('session', this.token);
    this.stream = new EventSource(url);
    this.stream.addEventListener('room', e => {
      this.room = JSON.parse(e.data);
      this.onRoom?.(this.room);
    });
    this.stream.addEventListener('game', e => this.onGame?.(JSON.parse(e.data)));
    this.stream.onerror = () => {
      if (this.lost) clearTimeout(this.lost);
      if (!this.stream) return;
      // EventSource retries automatically. The timeout starts just once per outage.
      this.outageStart ??= Date.now();
      const remaining = Math.max(0, 9500 - (Date.now() - this.outageStart));
      this.lost = setTimeout(() => {
        if (!this.stream || this.stream.readyState === EventSource.OPEN) return;
        this.leave().catch(() => {});
        (this.onClose || this.onError)?.('방 연결이 끊겼습니다. 방 코드를 입력해 다시 접속해 주세요.');
      }, remaining);
    };
    this.stream.onopen = () => {
      this.outageStart = null;
      clearTimeout(this.lost);
    };
    this.sendLoop = setInterval(() => this.flush(), 40);
    addEventListener('pagehide', this.unload);
    this.onRoom?.(this.room);
    return this.room;
  }
  create({ name, size, weapon = 'rifle' }) { return this.enter('create', { name, size, weapon }); }
  join({ name, code, weapon = 'rifle' }) { return this.enter('join', { name, code: String(code).trim().toUpperCase(), weapon }); }
  ready(ready = true) { return this.post('ready', { ready }); }
  weapon(weapon) { return this.post('weapon', { weapon }); }
  team(team) { return this.post('team', { team }); }
  start(fillBots = false) { return this.post('start', { fillBots }); }
  lobby() { return this.post('lobby', {}); }
  input(input) {
    if (!this.token || this.room?.phase !== 'playing') return;
    const next = { ...input };
    if (!PRIMARY.has(next.weapon)) delete next.weapon;
    // Preserve short tap edges occurring between two 25 Hz transfers.
    for (const key of ['fire', 'slide', 'jump', 'reload']) {
      if (this.pendingInput?.[key]) next[key] = true;
    }
    this.pendingInput = next;
  }
  async flush() {
    if (!this.pendingInput || !this.token || this.postingInput) return;
    this.postingInput = true;
    const input = this.pendingInput;
    this.pendingInput = null;
    try { await this.post('input', { input, seq: ++this.inputSeq }); }
    catch { /* Stream health drives recovery and one user-facing error per outage. */ }
    finally { this.postingInput = false; }
  }
  async leave() {
    const request = this.token ? this.post('leave', {}, { keepalive: true }).catch(() => {}) : null;
    clearInterval(this.sendLoop);
    clearTimeout(this.lost);
    removeEventListener('pagehide', this.unload);
    if (this.stream) { this.stream.close(); this.stream = null; }
    this.id = this.token = this.room = this.pendingInput = this.outageStart = null;
    if (request) await request;
  }
}
