import { $, escape } from '../shared/dom.js';
import { money } from '../shared/format.js';
export function renderEquipment(rows) {
  $('equipment-rows').innerHTML = rows.map(line => {
    const { item, count, shortage, editable } = line;
    return `<tr class="${line.pending ? 'pending' : shortage ? 'conflict' : ''}">
      <td><button class="availability" data-action="calendar" data-id="${item.id}">${shortage ? 'Shortage · ' : ''}${count} available</button></td>
      <td><span class="equipment-name" title="${escape(item.name)}">${escape(item.name)}</span>${line.pending ? `<small>Replaced ${escape(line.replaced)}. ${escape(item.spec)} · Total change ${money(line.delta)}. Confirmation required.</small>` : ''}</td>
      <td><input aria-label="${escape(item.name)} quantity" type="number" min="1" step="1" data-quantity="${item.id}" value="${line.quantity}" ${editable ? '' : 'disabled'}></td>
      <td class="numeric">${money(line.rate)}</td><td class="numeric">${money(line.amount)}</td>
      <td><div class="actions"><button data-action="calendar" data-id="${item.id}">Calendar</button>${editable ? `
        <span class="select-chevron"><select data-alternative="${item.id}" aria-label="Alternative for ${escape(item.name)}"><option value="">Other option…</option>${line.alternatives.map(option => `<option value="${option.id}">${escape(option.name)} · ${escape(option.spec)} · ${money(option.rate)}</option>`).join('')}</select></span>
        ${line.pending ? `<button data-action="confirm" data-id="${item.id}">Confirm</button>` : ''}
        <button data-action="remove" data-id="${item.id}" aria-label="Remove ${escape(item.name)}">Remove</button>` : ''}</div></td></tr>`;
  }).join('');
  $('empty-equipment').hidden = rows.length > 0;
}
