export const KNIFE_LABELS = Object.freeze({ karambit: '카람빗', balisong: '발리송' });

export function normalizeKnifeSkin(value) {
  return value === 'balisong' ? 'balisong' : 'karambit';
}
