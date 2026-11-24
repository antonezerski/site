import { $, escape } from '../shared/dom.js';

export function renderCalendar({ item, month, start, days, bookings, available }) {
  $('calendar-title').textContent = `${item.name} · availability`;
  $('calendar-month').textContent = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('calendar-days').innerHTML = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => `<span class="weekday">${day}</span>`).join('') +
    '<span></span>'.repeat(start) + days.map(({ day, date, count, requested, shortage }) =>
      `<button data-action="inspect-day" aria-label="${date}: ${count} available, ${requested} requested" class="${shortage ? 'day-shortage' : ''}" title="${date}: ${count} available">${day}</button>`).join('');
  $('calendar-summary').textContent = `${available} available for this order. Physical stock: ${item.stock}. Grace periods affect billing only.`;
  $('calendar-bookings').innerHTML = bookings.map(other => `<div class="catalog-row"><div><strong>${escape(other.project)}</strong><small>${escape(other.pickup.replace('T', ' '))} → ${escape(other.returns.replace('T', ' '))}</small></div><span>${other.quantity} reserved</span></div>`).join('');
}
