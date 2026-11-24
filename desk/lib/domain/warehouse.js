import { available, gear, localMinute } from './rental.js';

export const kitParts = Object.freeze({
  Camera: ['Body cap', 'Top handle'], Lens: ['Front cap', 'Rear cap'],
  Power: ['Terminal cover'], Cable: ['Connector check'],
});

export function serials(gearId) {
  return Array.from({ length: gear(gearId).stock }, (_, i) => gearId.toUpperCase() + '-' + (i + 1));
}

export function freeSerials(gearId, orders) {
  const assigned = new Set(orders.flatMap(order => (order.units || [])
    .filter(unit => unit.condition !== 'Good').map(unit => unit.serial)));
  for (const order of orders) for (const fault of order.faults || []) assigned.add(fault.serial);
  return serials(gearId).filter(serial => !assigned.has(serial));
}

export function warehouseAction(order, orders, action, input = {}, now = Date.now()) {
  if (order.archived) throw new Error('Restore this order before editing.');
  const units = order.units || [];
  if (action === 'repair-kit') {
    if (!order.faults?.some(fault => fault.serial === input.serial)) throw new Error('Choose a blocked kit.');
    return { faults: order.faults.filter(fault => fault.serial !== input.serial) };
  }
  if (order.status === 'Warehouse Picking') {
    if (action === 'block-kit') {
      if (!order.lines.some(line => line.gearId === input.gearId) || !freeSerials(input.gearId, orders).includes(input.serial) || !input.issue?.trim()) {
        throw new Error('Choose an available serial and describe the incomplete or defective kit.');
      }
      return { faults: [...order.faults || [], { serial: input.serial, gearId: input.gearId, issue: input.issue }] };
    }
    if (action === 'assign') {
      const line = order.lines.find(line => line.gearId === input.gearId);
      if (!line || units.filter(unit => unit.gearId === line.gearId).length >= line.quantity ||
        !freeSerials(line.gearId, orders).includes(input.serial)) throw new Error('Choose an available unit still required by this order.');
      if (!kitParts[gear(line.gearId).category].every(part => input.parts?.includes(part))) throw new Error('Verify every required component first.');
      return { units: [...units, { serial: input.serial, gearId: line.gearId, parts: input.parts, condition: 'Assigned' }] };
    }
    if (action === 'ready') {
      if (!order.lines.every(line => units.filter(unit => unit.gearId === line.gearId).length === line.quantity)) throw new Error('Assign each required unit and verify its kit.');
      return { status: 'Ready for Pickup' };
    }
  }
  if (action === 'cancel-paid' && ['Warehouse Picking', 'Ready for Pickup'].includes(order.status)) {
    return { status: 'Canceled', units: [], note: 'Simulated rental refund and deposit release recorded.' };
  }
  if (order.status === 'Ready for Pickup' && action === 'dispatch') {
    const pickup = localMinute(now);
    if (pickup < order.pickup) {
      const extraWindow = { ...order, pickup, returns: order.pickup };
      if (order.lines.some(line => available(line.gearId, extraWindow, orders, now) < line.quantity)) {
        throw new Error('This early handover overlaps another booking. Review the pickup time.');
      }
    }
    return { status: 'On Rent', handedOverAt: now, note: 'Handover signed · simulated' };
  }
  if (['On Rent', 'Return Inspection', 'Settlement Required', 'Closed'].includes(order.status)) {
    const unit = units.find(unit => unit.serial === input.serial);
    if (action === 'inspect' && ['On Rent', 'Return Inspection'].includes(order.status) && unit?.condition === 'Assigned') {
      if (!['Good', 'Damaged', 'Missing'].includes(input.condition)) throw new Error('Choose a return condition.');
      if (input.condition !== 'Good' && !input.issue?.trim()) throw new Error('Describe the damage or missing item.');
      return { status: 'Return Inspection', units: units.map(row => row === unit ? { ...row, condition: input.condition, issue: input.issue } : row) };
    }
    if (action === 'clear-unit' && ['Damaged', 'Missing'].includes(unit?.condition)) {
      return { units: units.map(row => row === unit ? { ...row, condition: 'Good', cleared: true } : row) };
    }
    if (action === 'finish' && order.status === 'Return Inspection') {
      if (units.some(unit => unit.condition === 'Assigned')) throw new Error('Record the condition of every unit first.');
      if (units.some(unit => unit.condition !== 'Good' || unit.cleared)) return { status: 'Settlement Required' };
      return { status: 'Closed', settlement: { charge: 0, released: order.deposit || 0, balance: 0 }, note: 'Clean return · deposit released (simulated)' };
    }
    if (action === 'collect-balance' && order.status === 'Settlement Required' && order.settlement?.balance > 0) {
      return { status: 'Closed', settlement: { ...order.settlement, received: order.settlement.balance, balance: 0 }, note: 'Outstanding balance received · simulated' };
    }
    if (action === 'settle' && order.status === 'Settlement Required' && !order.settlement) {
      if (!Number.isSafeInteger(input.charge) || input.charge < 0) throw new Error('Enter the assessed amount in whole rubles.');
      const deposit = order.deposit || 0;
      return { status: input.charge > deposit ? 'Settlement Required' : 'Closed', settlement: { charge: input.charge, released: Math.max(0, deposit - input.charge), balance: Math.max(0, input.charge - deposit) }, note: 'Settlement recorded · simulated' };
    }
  }
  throw new Error('This action is unavailable at the current rental stage.');
}
