import { $ } from '../shared/dom.js';
import { renderDatePicker as renderDatePickerView } from '../views/date-picker-view.js';

export function createDatePickerController({ current, editable, patch }) {
  let dateField = 'pickup', dateChosen = '', dateMonth = new Date();
  function renderDatePicker() {
    return renderDatePickerView({ dateMonth, dateChosen });
  }

  function openDatePicker(field) {
    if (!editable()) return;
    dateField = field;
    const value = current()[field];
    dateChosen = value.slice(0, 10);
    dateMonth = new Date(`${dateChosen.slice(0, 7)}-01T12:00:00`);
    if (Number.isNaN(dateMonth.getTime())) { dateMonth = new Date(); dateMonth.setDate(1); }
    $('date-hour').value = Number(value.slice(11, 13)) || 0;
    $('date-minute').value = Number(value.slice(14, 16)) || 0;
    $('date-picker-title').textContent = field === 'pickup' ? 'Pickup date and time' : 'Return date and time';
    $('date-error').hidden = true;
    renderDatePicker();
    $('date-dialog').showModal();
  }
  function handle(action, id) {
    switch (action) {
      case 'pick-date': openDatePicker(id); break;
      case 'date-prev': dateMonth.setMonth(dateMonth.getMonth() - 1); renderDatePicker(); break;
      case 'date-next': dateMonth.setMonth(dateMonth.getMonth() + 1); renderDatePicker(); break;
      case 'date-day': dateChosen = id; renderDatePicker(); break;
      case 'date-apply': {
        if (!editable()) break;
        const hour = Number($('date-hour').value), minute = Number($('date-minute').value);
        if (!dateChosen || $('date-hour').value === '' || $('date-minute').value === '' || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
          $('date-error').textContent = 'Select a date and a valid time (00:00–23:59).'; $('date-error').hidden = false; break;
        }
        patch({ [dateField]: `${dateChosen}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, reviewShifts: current().shiftsOverride !== null });
        $('date-dialog').close(); break;
      }
      default: return false;
    }
    return true;
  }
  return { open: openDatePicker, handle };
}
