import { HOLD_DURATION_MS } from '../config.js';
import { billableShifts, gear, total, validate } from './rental.js';

export function canEditOrder(order) {
  return order.status === 'Draft' && !order.archived;
}

export function reservation(order, availableFor, now) {
  if (!canEditOrder(order)) return null;
  const error = validate(order);
  if (error || order.lines.some(line => line.pending || availableFor(line.gearId) < line.quantity)) {
    return { error: error || 'Resolve shortages and confirm replacements first.' };
  }
  const quote = {
    version: (order.quotes?.length || 0) + 1, client: order.client, project: order.project,
    pickup: order.pickup, returns: order.returns, issued: now, expires: now + HOLD_DURATION_MS,
    shifts: order.shiftsOverride ?? billableShifts(order.pickup, order.returns), discount: order.discount,
    total: total(order), deposit: order.deposit || 0,
    lines: order.lines.map(({ gearId, quantity }) => ({ gearId, name: gear(gearId).name, rate: gear(gearId).rate, quantity })),
  };
  return {
    afterHours: order.pickup.slice(11) > '21:00',
    changes: { quotes: [...order.quotes || [], quote], status: 'Awaiting Payment', expires: now + HOLD_DURATION_MS, note: 'Quote sent · messaging simulated' },
  };
}

export function workflowChanges(order, action, now) {
  if (order.archived || order.status !== 'Awaiting Payment' || !(order.expires > now)) return null;
  if (action === 'extend') return { expires: Math.max(now, order.expires || 0) + HOLD_DURATION_MS, note: 'Hold extended by 24 hours' };
  if (action === 'pay') return { status: 'Warehouse Picking', expires: null, note: '' };
  if (action === 'release') return { status: 'Draft', expires: null, note: 'Reservation canceled' };
  return null;
}

export function amendment(order, fields, availableFor, now) {
  const unpaid = order.status === 'Awaiting Payment';
  if (order.archived || !(unpaid || ['Warehouse Picking', 'Ready for Pickup'].includes(order.status))) {
    throw new Error('Only active bookings before handover can be amended.');
  }
  if (unpaid && order.expires <= now) throw new Error('The hold expired. Reserve again.');
  const draft = { ...order, ...fields, status: 'Draft' };
  const proposal = reservation(draft, id => availableFor(id, draft), now);
  if (proposal.error) throw new Error(proposal.error);
  const quotes = proposal.changes.quotes;
  const previous = order.quotes?.at(-1)?.total ?? total(order);
  const difference = quotes.at(-1).total - previous;
  quotes.at(-1).expires = unpaid ? order.expires : null;
  return { ...fields, quotes, units: [], status: unpaid ? order.status : 'Warehouse Picking',
    note: unpaid ? 'Amended quote issued · existing hold deadline retained' :
      `Amended quote · simulated payment adjustment RUB ${difference}. Pick the revised kit.` };
}
