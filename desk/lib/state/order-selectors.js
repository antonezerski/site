import { catalog, compatible } from '../data/catalog.js';
import { available, billableShifts, gear, localMinute, occupiedIntervals, roundedRental, total } from '../domain/rental.js';
import { canEditOrder } from '../domain/order-actions.js';

export function selectedOrders(orders, ids) {
  return orders.filter(order => ids.has(order.id));
}

function appliedShifts(order, fallback) {
  try { return order.shiftsOverride ?? billableShifts(order.pickup, order.returns); }
  catch { return fallback; }
}

function availabilityFor(order, orders, now) {
  const counts = new Map();
  return id => {
    if (!counts.has(id)) counts.set(id, available(id, order, orders, now));
    return counts.get(id);
  };
}

export function selectRegistryRows(orders, { query, filter, batchIds, currentId, editorOpen }) {
  const search = query.toLowerCase();
  return orders.filter(order => (filter === 'Archive' ? order.archived === true :
    !order.archived && (filter === 'All' || order.status === filter)) &&
    `${order.id} ${order.project} ${order.client}`.toLowerCase().includes(search)).map(order => {
    let amount = null;
    try { amount = total(order); } catch { /* An incomplete Draft has no billable total. */ }
    return {
      ...order, amount, shifts: appliedShifts(order, '—'), checked: batchIds.has(order.id),
      rowClass: batchIds.has(order.id) ? 'batch-selected' : !batchIds.size && editorOpen && order.id === currentId ? 'selected' : '',
    };
  });
}

export function selectEquipment(order, orders, now) {
  const count = availabilityFor(order, orders, now);
  const shifts = appliedShifts(order, 0);
  const used = new Set(order.lines.map(line => line.gearId));
  const editable = canEditOrder(order);
  const quote = order.status === 'Draft' ? null : order.quotes?.at(-1);
  let subtotal = 0, previous = 0;
  return order.lines.map((line, index) => {
    const item = gear(line.gearId), quantityAvailable = count(item.id);
    const rate = quote?.lines.find(row => row.gearId === item.id)?.rate ?? item.rate;
    const original = catalog.find(option => option.name === line.replaced);
    subtotal += rate * line.quantity;
    const cumulative = quote && index === order.lines.length - 1 ? quote.total :
      roundedRental(subtotal, quote?.shifts ?? shifts, quote?.discount ?? order.discount);
    const amount = cumulative - previous;
    previous = cumulative;
    return {
      ...line, rate, delta: original ? (item.rate - original.rate) * line.quantity * shifts * (1 - order.discount / 100) : 0, item, count: quantityAvailable, shortage: quantityAvailable < line.quantity, editable,
      amount,
      alternatives: editable ? catalog.filter(option => compatible(item, option) &&
        count(option.id) >= line.quantity && !used.has(option.id)) : [],
    };
  });
}

export function selectCatalog(query, order, orders, now) {
  const count = availabilityFor(order, orders, now);
  return catalog.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
    .map(item => ({ ...item, available: count(item.id) }));
}

export function selectAvailabilityCalendar(order, calendarId, monthOffset, orders, now) {
  const month = new Date(`${order.pickup.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(month.getTime())) return null;
  month.setMonth(month.getMonth() + monthOffset);
  const item = gear(calendarId), year = month.getFullYear(), index = month.getMonth();
  const requested = order.lines.find(line => line.gearId === calendarId)?.quantity ?? 1;
  const dayCount = new Date(year, index + 1, 0).getDate();
  const midnights = Array.from({ length: dayCount + 1 }, (_, i) => {
    const date = new Date(month);
    date.setDate(i + 1);
    return localMinute(date.getTime()).slice(0, 10) + 'T00:00';
  });
  const days = midnights.slice(0, -1).map((pickup, i) => {
    const count = available(calendarId, { ...order, pickup, returns: midnights[i + 1] }, orders, now);
    return { day: i + 1, date: pickup.slice(0, 10), count, requested, shortage: count < requested };
  });
  const first = midnights[0], last = midnights.at(-1);
  const bookings = orders.filter(other => other.id !== order.id).flatMap(other =>
    occupiedIntervals(calendarId, other, now).filter(slot => slot.start < last && slot.end > first).map(slot => ({
      project: other.project, pickup: slot.start, returns: slot.end.startsWith('9999') ? 'Until cleared' : slot.end, quantity: slot.quantity,
    })));
  return { item, month, start: (month.getDay() + 6) % 7, days, bookings, available: available(calendarId, order, orders, now) };
}
