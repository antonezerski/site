import { $, escape } from '../shared/dom.js';
import { money, remainingTime } from '../shared/format.js';
const rowMarkup = new WeakMap();

export function renderRegistry(visible, { headerSelected = false } = {}) {
  const scroller = $('order-rows');
  const existing = new Map([...scroller.querySelectorAll('[data-order-row]')].map(row => [row.dataset.orderRow, row]));
  const markup = visible.map(order => `<tr data-order-row="${escape(order.id)}">
    <td class="selection-cell"><input type="checkbox" data-order-check="${escape(order.id)}" aria-label="Select order ${escape(order.id)}"></td>
    <td><button class="link" data-action="select" data-id="${escape(order.id)}">#${escape(order.id.length > 6 ? order.id.slice(-6) : order.id)}</button></td>
    <td><span class="badge">${escape(order.status)}</span></td>
    <td><span class="project-name" title="${escape(order.project)} · ${escape(order.status)}">${escape(order.project)}</span></td>
    <td title="${escape(order.manager || 'Unassigned')}">${escape(order.manager || 'Unassigned')}</td><td class="numeric">${order.amount === null ? '—' : money(order.amount)}</td>
    <td class="date-cell"><span class="compact-dates">${escape(order.pickup.slice(5, 10))} → ${escape(order.returns.slice(5, 10))}</span><span class="expanded-dates">${escape(order.pickup.replace('T', ' '))}</span></td>
    <td class="expanded-order-column return-date-cell">${escape(order.returns.replace('T', ' '))}</td>
    <td class="wide-extra" title="${escape(order.client || '—')}">${escape(order.client || '—')}</td>
    <td class="wide-extra">${escape(order.shifts)}${order.shiftsOverride !== null ? ' · adjusted' : ''}</td>
    <td class="wide-extra">${escape(order.discount)}%</td>
    <td class="wide-extra"><span data-registry-hold="${escape(order.id)}"></span></td><td class="row-actions"><button class="order-download" data-action="download" data-id="${escape(order.id)}" aria-label="Download order ${escape(order.id)}" title="Download order"><img src="assets/icons/download.svg" alt="" width="22" height="22"></button></td></tr>`);
  if (!visible.length) {
    if (!scroller.querySelector('[data-empty]')) scroller.innerHTML = '<tr data-empty><td colspan="13">No matching orders.</td></tr>';
  } else {
    scroller.querySelector('[data-empty]')?.remove();
    for (let index = 0; index < visible.length; index++) {
      const order = visible[index], html = markup[index];
      let row = existing.get(order.id);
      if (!row || rowMarkup.get(row) !== html) {
        const template = document.createElement('template');
        template.innerHTML = html;
        const next = template.content.firstElementChild;
        if (row) row.replaceWith(next);
        row = next;
        rowMarkup.set(row, html);
      }
      if (scroller.children[index] !== row) scroller.insertBefore(row, scroller.children[index] || null);
      if (row.className !== order.rowClass) row.className = order.rowClass;
      row.querySelector('[data-order-check]').checked = order.checked;
      const hold = row.querySelector('[data-registry-hold]');
      const remaining = order.status === 'Awaiting Payment' && order.expires ? remainingTime(order.expires) : '—';
      if (hold.textContent !== remaining) hold.textContent = remaining;
      existing.delete(order.id);
    }
    for (const row of existing.values()) row.remove();
  }
  $('order-count').textContent = `${visible.length} orders`;
  const checked = visible.filter(order => order.checked).length;
  $('select-orders').checked = headerSelected && visible.length > 0 && checked === visible.length;
  $('select-orders').indeterminate = false;
  $('select-orders').disabled = !visible.length;
}
