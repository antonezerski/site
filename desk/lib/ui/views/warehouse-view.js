import { escape } from '../shared/dom.js';
import { money } from '../shared/format.js';

const button = (action, label) => `<button data-warehouse="${action}">${label}</button>`;
export function warehouseView(order, requirements) {
  const units = order.units || [];
  const rows = units.map(unit => {
    const inspect = ['On Rent', 'Return Inspection'].includes(order.status) && unit.condition === 'Assigned';
    return `<div data-serial="${escape(unit.serial)}"><strong>${escape(unit.serial)}</strong> · ${escape(unit.condition)} ${escape(unit.issue || '')}
      ${inspect ? '<label>Return condition<select name="condition"><option>Good</option><option>Damaged</option><option>Missing</option></select></label><label>Issue<input name="issue"></label>' + button('inspect', 'Record inspection') : ''}
      ${['Damaged', 'Missing'].includes(unit.condition) ? button('clear-unit', 'Confirm repaired or recovered') : ''}</div>`;
  }).join('');
  const picking = order.status === 'Warehouse Picking';
  const allocation = picking ? requirements.map(({ line, item, parts, choices }) => {
    const count = units.filter(unit => unit.gearId === item.id).length;
    if (count >= line.quantity) return '';
    return `<fieldset data-gear="${item.id}"><legend>${escape(item.name)} · ${count} of ${line.quantity} assigned</legend>
      <label>Physical unit<select name="serial">${choices.map(id => `<option>${escape(id)}</option>`).join('')}</select></label>
      ${parts.map(part => `<label><input type="checkbox" value="${escape(part)}"> ${escape(part)}</label>`).join('')}
      ${button('assign','Assign checked kit')}<details><summary>Incomplete or defective kit</summary><label>Issue<input name="issue"></label>${button('block-kit','Block this serial')}</details></fieldset>`;
  }).join('') : '';
  const settlement = order.settlement;
  const faults = (order.faults || []).map(fault => `<p data-serial="${escape(fault.serial)}">Blocked kit ${escape(fault.serial)} · ${escape(fault.issue)} ${button('repair-kit','Confirm kit complete and repaired')}</p>`).join('');
  return faults + allocation + rows +
    (picking ? button('ready','Mark ready for pickup') : '') +
    (order.status === 'Ready for Pickup' ? button('dispatch','Simulate signed handover') : '') +
    (['Warehouse Picking','Ready for Pickup'].includes(order.status) ? button('cancel-paid','Cancel and simulate refund') : '') +
    (order.status === 'Return Inspection' ? button('finish','Finish inspection') : '') +
    (settlement?.balance > 0 ? button('collect-balance','Simulate balance payment and close') : '') +
    (order.status === 'Settlement Required' && !settlement ? '<label>Assessed charge (RUB)<input type="number" name="charge" min="0" step="1"></label>' + button('settle','Settle deposit') : '') +
    (settlement ? `<p>Assessed ${money(settlement.charge)} · Deposit released ${money(settlement.released)} · Balance due ${money(settlement.balance)}</p>` : '');
}
