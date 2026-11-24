import inventory from './inventory.json' with { type: 'json' };
export const catalog = inventory;
export function compatible(original, candidate) {
  return original.id !== candidate.id && original.compatibility === candidate.compatibility && candidate.capacity >= original.capacity;
}
