import { ORDER_STATUSES } from '../config.js';
import { catalog } from '../data/catalog.js';

const ORDER_STORAGE_KEY = 'rental-desk-prototype-v1';

const knownGear = id => catalog.some(item => item.id === id);
function validQuote(quote) {
  return quote && Number.isInteger(quote.version) && Number.isFinite(quote.total) &&
    [quote.client, quote.project, quote.pickup, quote.returns].every(value => typeof value === 'string') &&
    [quote.deposit, quote.shifts, quote.discount, quote.issued].every(Number.isFinite) &&
    (quote.expires === null || Number.isFinite(quote.expires)) &&
    Array.isArray(quote.lines) && quote.lines.every(line => line && knownGear(line.gearId) &&
      typeof line.name === 'string' && Number.isFinite(line.rate) && Number.isInteger(line.quantity));
}
function validRecord(order) {
  if (!order || typeof order.id !== 'string' || !order.id || !ORDER_STATUSES.includes(order.status)) return false;
  if (![order.project, order.client, order.pickup, order.returns, order.overrideReason].every(value => typeof value === 'string')) return false;
  if (order.manager !== undefined && typeof order.manager !== 'string') return false;
  if (order.archived !== undefined && typeof order.archived !== 'boolean') return false;
  if (!Number.isFinite(order.discount) || order.shiftsOverride !== null && !Number.isFinite(order.shiftsOverride)) return false;
  if (order.expires !== null && !Number.isFinite(order.expires) || order.status === 'Awaiting Payment' && !order.expires) return false;
  if (!Array.isArray(order.lines) || !order.lines.every(line => line && knownGear(line.gearId) && Number.isFinite(line.quantity))) return false;
  if (new Set(order.lines.map(line => line.gearId)).size !== order.lines.length) return false;
  if (order.handedOverAt !== undefined && (!Number.isFinite(order.handedOverAt) || !Number.isFinite(new Date(order.handedOverAt).getTime()))) return false;
  if (order.quotes !== undefined && !(Array.isArray(order.quotes) && order.quotes.every(validQuote))) return false;
  if (order.events !== undefined && !(Array.isArray(order.events) && order.events.every(e => e && Number.isFinite(e.at) && typeof e.label === 'string'))) return false;
  if (order.faults !== undefined && !(Array.isArray(order.faults) && order.faults.every(fault => fault &&
    knownGear(fault.gearId) && typeof fault.serial === 'string' && typeof fault.issue === 'string'))) return false;
  if (order.units !== undefined && !(Array.isArray(order.units) && order.units.every(unit => unit && knownGear(unit.gearId) &&
    typeof unit.serial === 'string' && ['Good','Assigned','Damaged','Missing'].includes(unit.condition)))) return false;
  return true;
}

export function validStoredOrders(value) {
  return Array.isArray(value) && value.length > 0 && value.every(validRecord) &&
    new Set(value.map(order => order.id)).size === value.length;
}

let lastRead;
export function readOrders() {
  lastRead = localStorage.getItem(ORDER_STORAGE_KEY);
  return lastRead;
}
export function writeOrders(orders) {
  if (localStorage.getItem(ORDER_STORAGE_KEY) !== lastRead) throw new Error('Stored orders changed in another tab. Reload to see the latest version.');
  const next = JSON.stringify(orders);
  localStorage.setItem(ORDER_STORAGE_KEY, next);
  lastRead = next;
}

export function recoverOrders() {
  const raw = readOrders();
  if (raw === null) throw new Error('Reload to retry reading storage.');
  localStorage.setItem(ORDER_STORAGE_KEY + '-recovery-' + crypto.randomUUID(), raw);
  let candidates;
  try { candidates = JSON.parse(raw); } catch { candidates = []; }
  const ids = new Set();
  const valid = (Array.isArray(candidates) ? candidates : []).filter(order => {
    if (!validStoredOrders([order]) || ids.has(order.id)) return false;
    ids.add(order.id);
    return true;
  });
  if (valid.length) writeOrders(valid);
  else localStorage.removeItem(ORDER_STORAGE_KEY);
}
