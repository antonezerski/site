import { $ } from '../shared/dom.js';
export function renderDatePicker({ dateMonth, dateChosen }) {
  $('date-month').textContent = dateMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const year = dateMonth.getFullYear(), month = dateMonth.getMonth();
  const start = (dateMonth.getDay() + 6) % 7;
  let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => `<span class="weekday">${day}</span>`).join('') + '<span></span>'.repeat(start);
  for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells += `<button data-action="date-day" data-id="${value}" class="${value === dateChosen ? 'chosen' : ''}" aria-label="${value}" aria-pressed="${value === dateChosen}">${day}</button>`;
  }
  $('date-days').innerHTML = cells;
}
