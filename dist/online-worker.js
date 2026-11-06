import { OnlineHost } from './online-host.js';

let host = null;
let lastTick = performance.now();
const emit = (type, data) => postMessage({ type, data });

self.onmessage = ({ data: message }) => {
  const { requestId, type, id, fields, action } = message;
  try {
    let result;
    if (type === 'init') {
      host = new OnlineHost({ ...fields, onRoom: room => emit('room', room), onGame: game => emit('game', game) });
      lastTick = performance.now();
      result = host.room;
    } else {
      if (!host) throw Error('방을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.');
      if (type === 'join') result = host.join(id, fields);
      else if (type === 'remove') result = host.remove(id);
      else if (type === 'action') result = host.action(id, action, fields);
      else throw Error('지원하지 않는 요청입니다.');
    }
    if (requestId) postMessage({ type: 'result', requestId, data: result });
  } catch (error) {
    if (requestId) postMessage({ type: 'result', requestId, error: error.message || '요청을 처리하지 못했습니다.' });
  }
};

setInterval(() => {
  const now = performance.now();
  const dt = Math.min(.1, Math.max(.001, (now - lastTick) / 1000));
  lastTick = now;
  if (host) host.tick(dt, now);
}, 1000 / 60);
