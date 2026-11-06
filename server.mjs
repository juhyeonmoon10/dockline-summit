import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createGame, stepGame } from './dist/sim.js';
import { gameSnapshot } from './dist/game-snapshot.js';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const sessions = new Map();
const primaryWeapons = new Set(['rifle', 'shotgun', 'sniper']);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8'
};
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const cleanName = name => (String(name || '').replace(/[<>\u0000-\u001F\u007F]/g, '').trim().slice(0, 16) || '플레이어');
const codeForRoom = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
const roster = room => ({
  code: room.code, size: room.size, hostId: room.hostId, phase: room.phase,
  players: room.players, needed: room.size * 2
});
const toEvent = (type, data) => 'event: ' + type + '\ndata: ' + JSON.stringify(type==='game'?gameSnapshot(data):data) + '\n\n';

function writeTo(session, packet, important = false) {
  if (!session.stream || session.stream.destroyed) return;
  if (session.stream.writableLength > 256 * 1024) {
    session.stream.destroy();
    return;
  }
  if (important || !session.stream.writableNeedDrain) session.stream.write(packet);
}
function broadcast(room, packet, important = false) {
  for (const session of room.members.values()) writeTo(session, packet, important);
}
function roomUpdate(room) { broadcast(room, toEvent('room', roster(room)), true); }

function addMember(room, fields) {
  const id = randomUUID().slice(0, 12);
  const token = randomBytes(24).toString('base64url');
  const counts = [0, 0];
  room.players.forEach(p => counts[p.team]++);
  const host = !room.hostId;
  const player = {
    id, name: cleanName(fields.name), weapon: primaryWeapons.has(fields.weapon) ? fields.weapon : 'rifle',
    team: counts[0] <= counts[1] ? 0 : 1, bot: false, ready: host
  };
  if (host) room.hostId = id;
  const session = {
    id, token, room, player, stream: null, disconnectedAt: Date.now(),
    lastInput: {}, lastInputAt: 0, seq: -1
  };
  room.players.push(player);
  room.members.set(id, session);
  sessions.set(token, session);
  roomUpdate(room);
  return { id, token, room: roster(room) };
}

function removeMember(session) {
  if (!sessions.delete(session.token)) return;
  const { room, id } = session;
  room.members.delete(id);
  session.stream?.end();
  session.stream = null;
  if (!room.members.size) { rooms.delete(room.code); return; }
  if (room.phase === 'lobby') {
    room.players = room.players.filter(p => p.id !== id);
  } else {
    session.player.bot = true;
    const avatar = room.game.players.find(p => p.id === id);
    if (avatar) avatar.bot = true;
  }
  if (room.hostId === id) {
    const host = room.members.values().next().value;
    room.hostId = host.id;
    host.player.ready = true;
  }
  roomUpdate(room);
}

async function readJSON(req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json'))
    fail(415, 'JSON 요청이 필요합니다.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) fail(413, '요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString());
    if (result && typeof result === 'object' && !Array.isArray(result)) return result;
  } catch {}
  fail(400, '잘못된 요청입니다.');
}

function sanitizedInput(input = {}) {
  const number = (v, min, max) => (typeof v === 'number' && Number.isFinite(v))
    ? Math.min(max, Math.max(min, v)) : 0;
  return {
    forward: number(input.forward, -1, 1), strafe: number(input.strafe, -1, 1),
    yaw: number(input.yaw, -1e6, 1e6), pitch: number(input.pitch, -Math.PI / 2, Math.PI / 2),
    fire: input.fire === true, reload: input.reload === true, jump: input.jump === true,
    slide: input.slide === true, ads: input.ads === true, slot: input.slot === 3 ? 3 : input.slot === 2 ? 2 : 1,
    ...(primaryWeapons.has(input.weapon) ? { weapon: input.weapon } : {})
  };
}

function startMatch(session, fillBots) {
  const { room } = session;
  if (room.hostId !== session.id) fail(403, '방장만 경기를 시작할 수 있습니다.');
  if (room.phase !== 'lobby') fail(409, '이미 경기가 시작됐습니다.');
  if (room.players.some(p => !p.ready)) fail(409, '다른 참가자가 준비를 누르면 시작할 수 있습니다.');
  if (room.players.length !== room.size * 2 && !fillBots) fail(409, '자리가 남았습니다. 참가자를 기다리거나 봇을 선택해 주세요.');
  for (let team = 0; team < 2; team++) {
    const current = room.players.filter(p => p.team === team).length;
    for (let i = current; i < room.size; i++) {
      room.players.push({ id: 'bot-' + team + '-' + i, name: ['봇 리프', '봇 루크', '봇 코브'][i], team,
        bot: true, ready: true, weapon: ['rifle', 'shotgun', 'sniper'][i] });
    }
  }
  room.game = createGame({ size: room.size, players: room.players.map(p => ({ ...p })) });
  room.phase = 'playing';
  for (const member of room.members.values()) { member.lastInput = {}; member.lastInputAt = 0; }
  roomUpdate(room);
  broadcast(room, toEvent('game', room.game), true);
}

async function handleAPI(req, res, url) {
  const action = url.pathname.slice(5);
  if (req.headers.origin && !['http://', 'https://'].some(scheme => req.headers.origin === scheme + req.headers.host))
    fail(403, '다른 사이트에서 보낸 요청입니다.');
  if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '다른 사이트에서 보낸 요청입니다.');
  if (action === 'capabilities' && req.method === 'GET') {
    json(res, 200, { docklineLAN: 1 });
    return;
  }
  if (action === 'stream' && req.method === 'GET') {
    const session = sessions.get(url.searchParams.get('session'));
    if (!session) fail(401, '방 연결이 만료됐습니다.');
    session.stream?.end();
    session.stream = res;
    session.disconnectedAt = 0;
    const avatar = session.room.game?.players.find(p => p.id === session.id);
    if (avatar) avatar.bot = false;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'Referrer-Policy': 'no-referrer'
    });
    res.write('retry: 1000\n\n' + toEvent('room', roster(session.room)));
    if (session.room.game) res.write(toEvent('game', session.room.game));
    res.on('close', () => {
      if (session.stream === res) {
        session.stream = null;
        session.disconnectedAt = Date.now();
        session.lastInputAt = 0;
      }
    });
    return;
  }
  if (req.method !== 'POST') fail(405, '지원하지 않는 요청입니다.');
  const body = await readJSON(req);
  if (action === 'create') {
    if (![2, 3].includes(body.size)) fail(400, '팀 인원은 2명 또는 3명입니다.');
    if (rooms.size >= 32) fail(503, '사용 중인 방이 많습니다. 잠시 뒤 다시 시도해 주세요.');
    let code;
    do { code = codeForRoom(); } while (rooms.has(code));
    const room = { code, size: body.size, hostId: null, phase: 'lobby', players: [], members: new Map(), game: null };
    rooms.set(code, room);
    json(res, 201, addMember(room, body)); return;
  }
  if (action === 'join') {
    const room = rooms.get(String(body.code || '').trim().toUpperCase());
    if (!room) fail(404, '방 코드를 다시 확인해 주세요.');
    if (room.phase !== 'lobby') fail(409, '경기 중인 방입니다. 다음 경기를 기다려 주세요.');
    if (room.players.length >= 2 * room.size) fail(409, '방이 가득 찼습니다.');
    json(res, 201, addMember(room, body)); return;
  }
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const session = sessions.get(token);
  if (!session) fail(401, '방 연결이 만료됐습니다.');
  const { player, room } = session;
  if (action === 'input') {
    if (room.phase === 'playing' && Number.isSafeInteger(body.seq) && body.seq > session.seq &&
        body.input && typeof body.input === 'object') {
      session.seq = body.seq;
      session.lastInput = sanitizedInput(body.input);
      session.lastInputAt = Date.now();
    }
    res.writeHead(204); res.end(); return;
  }
  if (action === 'leave') { removeMember(session); res.writeHead(204); res.end(); return; }
  if (action === 'start') startMatch(session, body.fillBots === true);
  else if (action === 'lobby') {
    if (room.hostId !== session.id) fail(403, '방장만 다시 시작할 수 있습니다.');
    if (room.phase !== 'end') fail(409, '경기 종료 후 이용할 수 있습니다.');
    room.phase = 'lobby'; room.game = null;
    room.players = room.players.filter(p => !p.bot);
    for (const member of room.members.values()) member.player.ready = member.id === room.hostId;
    roomUpdate(room);
  } else if (['ready', 'weapon', 'team'].includes(action)) {
    if (room.phase !== 'lobby') fail(409, '대기실에서만 변경할 수 있습니다.');
    if (action === 'ready') player.ready = body.ready === true || session.id === room.hostId;
    if (action === 'weapon') {
      if (!primaryWeapons.has(body.weapon)) fail(400, '무기를 다시 선택해 주세요.');
      player.weapon = body.weapon;
    }
    if (action === 'team' && body.team !== player.team) {
      if (![0, 1].includes(body.team)) fail(400, '팀을 다시 선택해 주세요.');
      if (room.players.filter(p => p.team === body.team).length >= room.size) fail(409, '팀에 빈자리가 없습니다.');
      player.team = body.team;
      player.ready = session.id === room.hostId;
    }
    roomUpdate(room);
  } else fail(404, '요청한 기능을 찾을 수 없습니다.');
  json(res, 200, roster(room));
}

let lastTick = performance.now(), lastBroadcast = 0, lastSweep = 0;
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(.1, Math.max(.001, (now - lastTick) / 1000));
  lastTick = now;
  const wall = Date.now();
  const shouldBroadcast = now - lastBroadcast >= 45;
  if (shouldBroadcast) lastBroadcast = now;
  for (const room of rooms.values()) {
    if (room.phase !== 'playing') continue;
    const inputs = Object.create(null);
    for (const session of room.members.values()) {
      if (!session.stream && wall - session.disconnectedAt > 1700) {
        const avatar = room.game.players.find(p => p.id === session.id);
        if (avatar) avatar.bot = true;
        continue;
      }
      if (wall - session.lastInputAt < 350) inputs[session.id] = session.lastInput;
      else if (typeof session.lastInput.yaw === 'number') {
        const { yaw, pitch, slot } = session.lastInput;
        inputs[session.id] = { yaw, pitch, slot };
      }
    }
    stepGame(room.game, inputs, dt);
    const finished = room.game.phase === 'end';
    if (shouldBroadcast || finished) broadcast(room, toEvent('game', room.game), finished);
    if (finished) { room.phase = 'end'; roomUpdate(room); }
  }
  if (now - lastSweep >= 3000) {
    lastSweep = now;
    for (const session of sessions.values()) {
      if (!session.stream && wall - session.disconnectedAt > 11000) removeMember(session);
      else if (session.room.phase !== 'playing') writeTo(session, ': live\n\n');
    }
  }
}, 1000 / 60).unref();

const server = createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleAPI(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, '지원하지 않는 요청입니다.');
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { fail(400, '잘못된 주소입니다.'); }
    if (path === '/') path = '/index.html';
    if (path.includes('\\') || path.includes(':') || path.split('/').some(part => part.startsWith('.')))
      fail(404, '파일을 찾을 수 없습니다.');
    const filename = resolve(root, '.' + path);
    if (!filename.startsWith(resolve(root) + sep)) fail(404, '파일을 찾을 수 없습니다.');
    const info = await stat(filename).catch(() => null);
    if (!info?.isFile()) fail(404, '파일을 찾을 수 없습니다.');
    const etag = '"' + info.size + '-' + Math.floor(info.mtimeMs) + '"';
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (etag === req.headers['if-none-match']) { res.writeHead(304); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Content-Length': info.size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    if (res.headersSent) res.destroy();
    else json(res, error.status || 500, { error: error.status ? error.message : '서버에서 요청을 처리하지 못했습니다.' });
  }
});
server.on('clientError', (_, socket) => { if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'This port is busy. Stop the other host or set PORT.' : error.message);
  process.exitCode = 1;
});
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  const actualPort = server.address().port;
  console.log('DOCKLINE  |  http://localhost:' + actualPort + '/');
  console.log('On Chromebooks connected to the same network, open one of:');
  for (const devices of Object.values(networkInterfaces())) for (const device of devices || []) {
    if (device.family === 'IPv4' && !device.internal) console.log('  http://' + device.address + ':' + actualPort + '/');
  }
  console.log('Keep this window open while playing. Press Ctrl+C to stop.');
});
