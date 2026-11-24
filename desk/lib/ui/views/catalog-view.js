import { $, escape } from '../shared/dom.js';
import { money } from '../shared/format.js';
export function renderCatalog(items) {
  $('catalog-items').innerHTML = items.map(item =>
    `<div class="catalog-row"><div><strong>${escape(item.name)}</strong><small>${item.available} available · ${money(item.rate)} / shift</small></div><button data-action="add" data-id="${item.id}">Add</button></div>`).join('') || '<p>No matching equipment.</p>';
}
