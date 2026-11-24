import { seed } from '../data/seed-orders.js';
import { expire } from '../domain/rental.js';
import { readOrders, writeOrders, validStoredOrders } from '../storage/order-storage.js';
import { AUTOSAVE_DELAY_MS } from '../config.js';

export function createOrderState({ read = readOrders, write = writeOrders, seedOrders = seed, now = Date.now, onRecovery = () => {} } = {}) {
  let records, recovery = false, generation = 0, savedGeneration = 0;
  try {
    const raw = read();
    const parsed = raw === null ? seedOrders() : JSON.parse(raw);
    if (!validStoredOrders(parsed)) throw new Error('Invalid saved orders');
    records = expire(parsed, now());
    if (raw === null || records.some((order, i) => order !== parsed[i])) generation++;
  } catch {
    records = seedOrders();
    recovery = true;
    onRecovery();
  }
  let selected = records[0].id;
  let index = new Map(records.map(order => [order.id, order]));
  let queue = Promise.resolve();
  function replace(next) {
    records = next;
    index = new Map(records.map(order => [order.id, order]));
  }
  function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  return {
    get orders() { return records; },
    get dirty() { return generation !== savedGeneration; },
    get needsRecovery() { return recovery; },
    current: () => index.get(selected) || records[0],
    getOrder: id => index.get(id),
    select(id) { selected = id; },
    patch(changes) { Object.assign(index.get(selected) || records[0], changes); generation++; },
    add(order) { replace([order, ...records]); selected = order.id; generation++; },
    async reset() {
      await enqueue(async () => {
        if (recovery) throw new Error('Recover the stored data first.');
        const next = seedOrders();
        const authoritative = await write(next, { action: 'reset' });
        replace(authoritative || next); selected = records[0].id; savedGeneration = ++generation;
      });
    },
    save() {
      return enqueue(async () => {
        if (recovery) throw new Error('Recover the stored data first.');
        if (generation === savedGeneration) return;
        const version = generation;
        await write(structuredClone(records), { action: 'edit' });
        savedGeneration = version;
      });
    },
    commitBatch(ids, changes, context = { action: 'batch' }) {
      return enqueue(async () => {
        if (recovery) throw new Error('Recover the stored data first.');
        if (context.action === 'batch' && records.some(order => ids.has(order.id) && (order.archived || ('discount' in changes && order.status !== 'Draft')))) {
          throw new Error('Remove ineligible or archived orders first.');
        }
        const next = records.map(order => ids.has(order.id) ? { ...order, ...changes } : order);
        const authoritative = await write(next, context);
        replace(authoritative || next);
        savedGeneration = ++generation;
      });
    },
    reconcileExpiry() {
      const next = expire(records, now());
      if (!next.some((order, i) => order !== records[i])) return false;
      replace(next); generation++; return true;
    },
  };
}

export function createAutosave({ save, onStatus, onError, delay = AUTOSAVE_DELAY_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer;
  async function flush() {
    clearTimer(timer);
    try { await save(); onStatus('Saved'); return true; }
    catch (error) { onStatus('Save failed'); onError(error); return false; }
  }
  return { flush, schedule() { onStatus('Saving…'); clearTimer(timer); timer = setTimer(flush, delay); } };
}
