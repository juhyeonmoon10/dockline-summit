// Authoritative snapshots can reach the client more often than it draws. Keep
// only the unconsumed events, including a volley omitted by a later snapshot.
const HISTORY_LIMIT = 40;
const MAX_EFFECT_AGE = 1000;
const RESUME_EFFECT_AGE = 150;

export class SnapshotEvents {
  constructor() {
    this.reset();
  }

  reset() {
    this.pending = [];
    this.receivedSeq = 0;
    this.lastRound = null;
    this.elapsed = 0;
    this.lastFrame = null;
  }

  receive(game, now) {
    const rewind = game.seq < this.receivedSeq || game.elapsed < this.elapsed;
    const roundChange = this.lastRound !== null && this.lastRound !== game.round;
    if (rewind || roundChange) {
      this.pending = [];
      if (rewind) this.receivedSeq = 0;
    }
    const history = game.events;
    for (const event of history) {
      if (event.seq <= this.receivedSeq) continue;
      if (event.type === 'round') this.pending = [];
      this.pending.push({ event, receivedAt: now, elapsed: event.at ?? game.elapsed });
      this.receivedSeq = event.seq;
    }
    this.receivedSeq = game.seq;
    if (this.pending.length > HISTORY_LIMIT) this.pending.splice(0, this.pending.length - HISTORY_LIMIT);
    this.lastRound = game.round;
    this.elapsed = game.elapsed;
    return rewind;
  }

  frame(now) {
    const resumed = this.lastFrame !== null && now - this.lastFrame > MAX_EFFECT_AGE;
    this.lastFrame = now;
    const age = resumed ? RESUME_EFFECT_AGE : MAX_EFFECT_AGE;
    this.pending = this.pending.filter(({event, receivedAt, elapsed}) =>
      event.type === 'round' || (now - receivedAt <= age && (this.elapsed - elapsed) * 1000 <= age));
    return this.pending.map(item => item.event);
  }

  acknowledge(feedbackSeq, rendererSeq) {
    const through = Math.min(feedbackSeq, rendererSeq);
    this.pending = this.pending.filter(item => item.event.seq > through);
  }
}
