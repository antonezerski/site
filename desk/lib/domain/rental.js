import { catalog } from '../data/catalog.js';

export function gear(id) {
  const item = catalog.find(item => item.id === id);
  if (!item) throw new Error('Unknown equipment');
  return item;
}

function parts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Choose valid pickup and return times.');
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new Error('Choose valid pickup and return times.');
  }
  return { day: date.getTime() / 86400000, minutes: hour * 60 + minute };
}

export function billableShifts(pickup, returns) {
  const a = parts(pickup), b = parts(returns);
  if (b.day < a.day || (b.day === a.day && b.minutes <= a.minutes)) throw new Error('Return must be after pickup.');
  if (a.day === b.day) return 1;
  return Math.max(0, b.day - a.day - 1) +
    (a.minutes < 720 ? 1 : a.minutes < 1080 ? .5 : 0) +
    (b.minutes <= 720 ? 0 : b.minutes <= 960 ? .5 : 1);
}

export function validate(order) {
  try { billableShifts(order.pickup, order.returns); }
  catch (error) { return error.message; }
  if (order.reviewShifts) return 'Review the adjusted shifts after changing dates.';
  if (!order.client.trim() || !order.project.trim()) return 'Client and project are required.';
  if (!Number.isFinite(order.discount) || order.discount < 0 || order.discount > 100) return 'Discount must be between 0 and 100.';
  if (!Number.isSafeInteger(order.deposit ?? 0) || (order.deposit ?? 0) < 0) return 'Enter a non-negative whole-ruble deposit.';
  if (!order.lines.length) return 'Add equipment before reserving.';
  if (order.lines.some(line => !Number.isInteger(line.quantity) || line.quantity < 1)) return 'Quantities must be positive whole numbers.';
  if (order.shiftsOverride !== null && (!Number.isFinite(order.shiftsOverride) || order.shiftsOverride < 0 || order.shiftsOverride * 2 % 1 !== 0)) return 'Billable shifts must use non-negative half-shift increments.';
  if (order.shiftsOverride !== null && !order.overrideReason.trim()) return 'Explain the billable-shift adjustment.';
  return '';
}

export function localMinute(timestamp) {
  const offset = new Date(timestamp).getTimezoneOffset();
  return new Date(timestamp - offset * 60000).toISOString().slice(0, 16);
}

export function occupiedIntervals(itemId, order, now) {
  const start = order.pickup;
  if (['On Rent', 'Return Inspection', 'Settlement Required', 'Closed'].includes(order.status)) {
    const wall = localMinute(now);
    const handover = order.handedOverAt ?? order.events?.find(event => event.label === 'dispatch · On Rent')?.at;
    const fallback = start < wall ? start : wall;
    const pickup = handover == null ? fallback : localMinute(handover);
    return (order.units || []).filter(unit => unit.gearId === itemId && unit.condition !== 'Good').map(unit => ({
      start: pickup, end: unit.condition === 'Assigned' && wall < order.returns ? order.returns : '9999-12-31T23:59', quantity: 1,
    }));
  }
  const quantity = order.lines.find(line => line.gearId === itemId)?.quantity;
  if (quantity && (['Warehouse Picking', 'Ready for Pickup'].includes(order.status) ||
    order.status === 'Awaiting Payment' && order.expires > now)) return [{ start, end: order.returns, quantity }];
  return [];
}

export function available(itemId, order, orders, now) {
  const edges = new Map();
  for (const other of orders) {
    if (other.id === order.id) continue;
    for (const { start, end, quantity } of occupiedIntervals(itemId, other, now)) {
      if (start >= order.returns || end <= order.pickup) continue;
      edges.set(start, (edges.get(start) || 0) + quantity);
      edges.set(end, (edges.get(end) || 0) - quantity);
    }
  }
  let used = 0, peak = 0;
  for (const time of [...edges.keys()].sort()) {
    used += edges.get(time);
    peak = Math.max(peak, used);
  }
  const blocked = orders.reduce((sum, record) => sum + (record.faults || []).filter(fault => fault.gearId === itemId).length, 0);
  return Math.max(0, gear(itemId).stock - blocked - peak);
}

export function expire(orders, now) {
  return orders.map(order => order.status === 'Awaiting Payment' && order.expires !== null && order.expires <= now
    ? { ...order, status: 'Draft', expires: null, note: 'Reservation period expired' }
    : order);
}

// Round the discounted subtotal once. Read decimal percentages as entered so
// a binary floating-point approximation cannot move a half-ruble tie.
export function roundedRental(subtotal, shifts, discount) {
  const halfShifts = shifts * 2;
  if (!Number.isInteger(subtotal) || !Number.isInteger(halfShifts) || !Number.isFinite(discount) ||
      subtotal < 0 || halfShifts < 0 || discount < 0 || discount > 100) {
    return Math.round(subtotal * shifts * (100 - discount) / 100); // Incomplete draft preview.
  }
  const [digits, exponent = '0'] = String(discount).split('e');
  const [whole, fraction = ''] = digits.split('.');
  const scale = 10n ** BigInt(fraction.length - Number(exponent));
  const percent = BigInt(whole + fraction);
  const divisor = 200n * scale;
  const numerator = BigInt(subtotal) * BigInt(halfShifts) * (100n * scale - percent);
  return Number((numerator + divisor / 2n) / divisor);
}

export function total(order) {
  if (order.status !== 'Draft' && order.quotes?.length) return order.quotes.at(-1).total;
  const shifts = order.shiftsOverride ?? billableShifts(order.pickup, order.returns);
  const subtotal = order.lines.reduce((sum, line) => sum + gear(line.gearId).rate * line.quantity, 0);
  return roundedRental(subtotal, shifts, order.discount);
}
