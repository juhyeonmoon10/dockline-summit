export const KNIFE_LABELS = Object.freeze({ karambit: '카람빗', balisong: '발리송' });
export const KARAMBIT_RING = Object.freeze([.018,-.210,0]);

// Seconds from the confirmed draw or inspection start. Both renderers and
// audio use the actual grip/hinge contacts, including after a frame-rate drop.
export const KNIFE_TIMING = Object.freeze({
  karambit:Object.freeze({draw:.36,drawCatch:.251,inspect:1.76,inspectCatch:1.04}),
  balisong:Object.freeze({draw:.42,drawBeat:.14,drawCatch:.29,inspect:1.32,inspectFold:.47,inspectOpen:.96})
});

export function normalizeKnifeSkin(value) {
  return value === 'balisong' ? 'balisong' : 'karambit';
}
