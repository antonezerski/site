import { selectRegistryRows, selectEquipment, selectCatalog, selectAvailabilityCalendar } from './state/order-selectors.js';
import { createBatchController } from './ui/controllers/batch-controller.js';
import { createDatePickerController } from './ui/controllers/date-picker-controller.js';
import { createOrderState, createAutosave } from './state/order-state.js';
import { amendment, canEditOrder, reservation, workflowChanges } from './domain/order-actions.js';
import { EXPIRY_CHECK_MS, ORDER_STATUSES } from './config.js';
import { sizeSelectedLabel, initSelectSizing } from './ui/shared/select-sizing.js';
import { renderCalendar as renderCalendarView } from './ui/views/availability-calendar-view.js';
import { $, escape } from './ui/shared/dom.js';
import { money, remainingTime } from './ui/shared/format.js';
import { renderCatalog as renderCatalogView } from './ui/views/catalog-view.js';
import { renderEquipment as renderEquipmentView } from './ui/views/equipment-view.js';
import { renderRegistry as renderRegistryView } from './ui/views/registry-view.js';
import { catalog, compatible } from './data/catalog.js';
import { newOrder } from './data/seed-orders.js';
import { initScrollbar } from './ui/controllers/scrollbar-controller.js';
import { available, billableShifts, gear, total, validate } from './domain/rental.js';

import { parseRequest } from './domain/intake.js';
import { freeSerials, kitParts, warehouseAction } from './domain/warehouse.js';
import { warehouseView } from './ui/views/warehouse-view.js';
import { recoverOrders } from './storage/order-storage.js';
import { reviewerStorage } from './storage/reviewer.js';

export async function startApplication() {
  const reviewer = Boolean(document.querySelector('meta[name="reviewer"]'));
  const storage = reviewer ? await reviewerStorage() : {};
  const now = storage.now || Date.now;
  for (const status of ORDER_STATUSES.slice(3)) {
    $('order-status').add(new Option(status));
    $('status-filter').add(new Option(status), $('status-filter').options.length - 1);
  }
  const batchIds = new Set();
  let calendarId = null, monthOffset = 0, equipmentModel;
  const state = createOrderState(storage);
  if (state.needsRecovery) {
    if (reviewer) throw new Error('The server returned unreadable records. Reload to retry.');
    const dialog = $('startup');
    dialog.querySelector('p').textContent = 'Saved orders could not be read. Reload to retry, or keep a backup and recover valid orders. If none are readable, the desk will open with examples.';
    $('recover').hidden = false;
    $('recover').onclick = () => {
      try { recoverOrders(); location.reload(); }
      catch (error) { dialog.querySelector('p').textContent = error.message; }
    };
    dialog.showModal();
    return;
  }
  let committing = false;
  const autosave = createAutosave({
    save: () => state.save(),
    onStatus: text => { $('retry-save').hidden = text !== 'Save failed'; $('sync').textContent = text === 'Saved' && !reviewer ? 'Saved locally' : text; },
    onError: error => showMessage('Save failed. Keep this tab open and retry. ' + error.message),
  });

  const datePicker = createDatePickerController({
    current: () => $('amend-dialog').open ? { pickup: $('amend-pickup').value, returns: $('amend-returns').value } : current(),
    editable: () => editable() || $('amend-dialog').open,
    patch: changes => {
      if (!$('amend-dialog').open) { patch(changes); return; }
      for (const field of ['pickup','returns']) if (changes[field]) $('amend-' + field).value = changes[field];
    },
  });
  const batchController = createBatchController({ state, batchIds, render, renderRegistry, setPanel, persist, showMessage, closeCalendar: () => { calendarId = null; $('calendar').close(); } });
  function leaveBatch() { return batchController.leave(); }
  function updateBatchPreview() { return batchController.preview(); }

  function current() { return state.current(); }
  function editable() { return canEditOrder(current()); }
  function persist() { return autosave.flush(); }
  async function commit(changes, action, input = {}) {
    if (!changes || committing) return false;
    committing = true;
    document.querySelector('.shell').inert = true;
    try {
      if (!await persist()) return false;
      const order = current();
      if (action === 'dispatch') changes = warehouseAction(order, state.orders, action, input, now());
      if (['extend', 'pay', 'release'].includes(action)) {
        if (action === 'pay' && order.lines.some(line => numberAvailable(line.gearId) < line.quantity)) throw new Error('Stock changed. Amend this hold before confirming payment.');
        changes = workflowChanges(order, action, now());
        if (!changes) throw new Error('The hold expired. Reserve again after checking availability.');
      }
      if (['approve-quote','amend'].includes(action) && order.status === 'Awaiting Payment' && order.expires <= now()) throw new Error('Hold expired. Reserve again.');
      const label = action === 'assign' || action === 'inspect' || action === 'clear-unit'
        ? action + ' · ' + input.serial + (input.condition ? ' · ' + input.condition : '') : action + ' · ' + (changes.status || order.status);
      changes = { ...changes, events: [...order.events || [], { at: now(), label }] };
      await state.commitBatch(new Set([order.id]), changes, { action, id: order.id, input });
      showMessage('');
      render();
      return true;
    } catch (error) {
      $('sync').textContent = 'Action failed';
      showMessage(error.message + (reviewer ? ' Check the saved order before retrying.' : ' Retry when ready.'));
      return false;
    } finally {
      committing = false;
      document.querySelector('.shell').inert = false;
    }
  }
  function scheduleSave() { autosave.schedule(); }
  function showMessage(text) { $('message').textContent = text; $('message').hidden = !text; }
  function patch(changes) {
    state.patch(changes);
    showMessage('');
    const metadataOnly = Object.keys(changes).every(key => ['project', 'client', 'manager', 'note'].includes(key));
    render({ equipmentChanged: !metadataOnly });
    scheduleSave();
  }
  function numberAvailable(id) { return available(id, current(), state.orders, now()); }
  function alternatives(id, quantity) {
    return catalog.filter(item => compatible(gear(id), item) &&
      numberAvailable(item.id) >= quantity && !current().lines.some(line => line.gearId === item.id));
  }
  function effectiveShifts() {
    try { return current().shiftsOverride ?? billableShifts(current().pickup, current().returns); }
    catch { return 0; }
  }
  function safeTotal(order) { try { return money(total(order)); } catch { return '—'; } }
  function fill(id, value) {
    // Keep the focused input intact so typing/caret position survives updates.
    if (document.activeElement !== $(id)) $(id).value = value ?? '';
  }
  function sizeStatusFilter() {
    sizeSelectedLabel($('status-filter'));
    sizeSelectedLabel($('order-status'));
  }
  function renderRegistry() {
    sizeStatusFilter();
    renderRegistryView(selectRegistryRows(state.orders, {
      query: $('order-search').value, filter: $('status-filter').value,
      batchIds, currentId: current().id, editorOpen: !$('editor').hidden,
    }), { headerSelected: batchController.isHeaderSelected() });
    updateRegistryDateHeading();
    if (batchIds.size > 1) updateBatchPreview();
  }

  function holdRemaining(order) {
    if (order.status !== 'Awaiting Payment' || !order.expires) return '—';
    return remainingTime(order.expires, now());
  }
  function renderTimer() {
    for (const element of document.querySelectorAll('[data-registry-hold]')) {
      const order = state.getOrder(element.dataset.registryHold);
      if (order) { const text = holdRemaining(order); if (element.textContent !== text) element.textContent = text; }
    }
    const expires = current().expires;
    $('timer').hidden = !expires;
    if (!expires) return;
    const text = remainingTime(expires, now());
    if ($('timer').textContent !== text) $('timer').textContent = text;
  }
  function render({ equipmentChanged = true } = {}) {
    const order = current();
    renderRegistry();
    $('order-number').textContent = `#${order.id.length > 6 ? order.id.slice(-6) : order.id}`;
    $('archive-order').textContent = order.archived ? 'Restore' : 'Archive';
    $('archive-order').disabled = !order.archived && !['Draft','Closed','Canceled'].includes(order.status);
    $('archive-order').title = $('archive-order').disabled ? 'Release the reservation before archiving. Paid orders must finish their warehouse workflow.' : '';
    $('order-status').disabled = Boolean(order.archived) || !['Draft','Awaiting Payment'].includes(order.status);
    $('order-status').value = order.status;
    sizeSelectedLabel($('order-status'));
    for (const option of $('order-status').options) {
      option.disabled = option.value !== order.status && !(order.status === 'Draft' && option.value === 'Awaiting Payment' || order.status === 'Awaiting Payment' && ['Draft', 'Warehouse Picking'].includes(option.value));
    }
    $('order-note').textContent = order.note || '';
    $('order-note').hidden = !order.note || order.note === 'Payment received · simulated. Warehouse workflow is next.';
    for (const field of ['client', 'project', 'manager', 'pickup', 'returns', 'discount', 'deposit']) fill(field, field === 'deposit' ? order.deposit || 0 : order[field]);
    let calculated = 0;
    try { calculated = billableShifts(order.pickup, order.returns); } catch { /* Validation explains invalid dates. */ }
    fill('shifts', order.shiftsOverride ?? calculated);
    fill('reason', order.overrideReason);
    $('calculated-shifts').textContent = `Calculated: ${calculated}`;
    $('pricing-description').textContent = `Pricing · ${effectiveShifts()} billable shifts · ${order.discount}% discount`;
    $('pricing-toggle').textContent = `${effectiveShifts()} shifts · ${order.discount}% discount`;
    $('reason-wrap').hidden = order.shiftsOverride === null;
    $('order-fields').disabled = !!order.archived;
    $('pickup').disabled = $('returns').disabled = !editable();
    $('keep-shifts').hidden = !order.reviewShifts;
    $('overdue').hidden = !(['On Rent','Return Inspection'].includes(order.status) &&
      new Date(order.returns).getTime() <= now() && order.units?.some(unit => unit.condition === 'Assigned'));
    $('history').hidden = !order.events?.length;
    $('events').replaceChildren(...(order.events || []).slice().reverse().map(event => {
      const p = document.createElement('p');
      p.textContent = new Date(event.at).toLocaleString() + ' · ' + event.label;
      return p;
    }));
    $('amend').hidden = order.archived || !['Awaiting Payment','Warehouse Picking','Ready for Pickup'].includes(order.status);
    $('view-quote').hidden = !order.quotes?.length;
    $('pricing-fields').disabled = !editable();
    $('parser-open').disabled = $('catalog-open').disabled = $('suggest').disabled = !editable();
    $('equipment-count').textContent = order.lines.length;
    if (equipmentChanged || !equipmentModel) equipmentModel = selectEquipment(order, state.orders, now());
    const conflicts = equipmentModel.filter(line => line.shortage);
    $('conflicts').hidden = !conflicts.length;
    $('conflict-count').textContent = `${conflicts.length} item(s) unavailable`;
    if (equipmentChanged) renderEquipmentView(equipmentModel);
    const error = validate(order);
    $('validation-error').textContent = error;
    $('validation-error').hidden = !error;
    $('total').textContent = safeTotal(order);
    $('reserve').hidden = !editable();
    $('reserve').disabled = Boolean(error || conflicts.length || order.lines.some(line => line.pending));
    $('workflow').hidden = order.status === 'Draft';
    $('workflow').innerHTML = order.status === 'Awaiting Payment'
      ? '<h3>Demo actions</h3><button data-action="extend">Extend hold · 24h</button><button data-action="pay">Simulate payment receipt</button><button data-action="release">Release hold</button>'
      : warehouseView(order, order.lines.map(line => ({ line, item: gear(line.gearId), parts: kitParts[gear(line.gearId).category], choices: freeSerials(line.gearId, state.orders) })));
    if (order.archived) $('workflow').hidden = true;
    renderTimer();
    if (calendarId) renderCalendar();
  }

  function renderCatalog() {
    return renderCatalogView(selectCatalog($('catalog-search').value, current(), state.orders, now()));
  }

  function renderCalendar() {
    const model = selectAvailabilityCalendar(current(), calendarId, monthOffset, state.orders, now());
    if (!model) { showMessage('Choose a pickup date to view availability.'); calendarId = null; $('calendar').close(); return; }
    renderCalendarView(model);
  }

  function setPanel(open) {
    if (batchIds.size > 1) return;
    $('editor').hidden = !open;
    $('workspace').classList.toggle('panel-closed', !open);
    if (!open) { calendarId = null; $('calendar').close(); }
  }
  function showQuote() {
    const order = current();
    const q = order.quotes.find(quote => quote.version === Number($('quote-version').value));
    $('client-quote').hidden = !reviewer;
    $('client-quote').href = '/quote/' + encodeURIComponent(order.id) + '/' + q.version;
    $('quote-body').textContent = [
      `Quote ${order.id} · version ${q.version}`, q.client, q.project, q.pickup + ' → ' + q.returns,
      ...q.lines.map(line => `${line.quantity} × ${line.name} · ${money(line.rate)} per shift`),
      `${q.shifts} shifts · ${q.discount}% discount`, `Rental ${money(q.total)} · Deposit ${money(q.deposit)}`,
      q.expires ? 'Original hold deadline ' + new Date(q.expires).toLocaleString() : 'Paid amendment',
      order.approvedVersion === q.version ? 'Client approval recorded · simulated' : '',
    ].filter(Boolean).join('\n');
    $('approve-quote').hidden = order.status !== 'Awaiting Payment' || order.approvedVersion === q.version || order.quotes.at(-1) !== q;
  }
  $('quote-version').addEventListener('change', showQuote);
  function previewRequest() {
    $('parse-preview').innerHTML = parseRequest($('request').value).map(({ raw, item, quantity }) =>
      `<fieldset><legend>${escape(raw)}</legend><label>Catalog match<select><option value="">Omit this line</option>${catalog.map(option => `<option value="${option.id}" ${option === item ? 'selected' : ''}>${escape(option.name)}</option>`).join('')}</select></label><label>Quantity<input type="number" required min="1" step="1" value="${quantity}"></label></fieldset>`).join('');
  }
  function addEquipment(id) {
    const lines = current().lines.map(line => ({ ...line }));
    const existing = lines.find(line => line.gearId === id);
    if (existing) existing.quantity++; else lines.push({ gearId: id, quantity: 1 });
    patch({ lines });
  }
  function reserve() {
    const result = reservation(current(), numberAvailable, now());
    if (!result) return;
    if (result.error) { showMessage(result.error); return; }
    if (result.afterHours && !window.confirm('Pickup is outside operating hours. Confirm the arrangement?')) return;
    if (effectiveShifts() === 0 && !confirm('Issue a quote with zero billable shifts?')) return;
    const checked = reservation(current(), numberAvailable, now());
    if (checked?.changes) commit(checked.changes, 'reserve');
  }

  document.addEventListener('input', event => {
    const input = event.target;
    if (input.id === 'order-search') { renderRegistry(); return; }
    if (input.id === 'catalog-search') { renderCatalog(); return; }
    if (input.id === 'request') { previewRequest(); return; }
    if (!input.dataset.field || current().archived || !editable() && !['project','manager','client'].includes(input.dataset.field)) return;
    let value = input.value;
    const field = input.dataset.field;
    if (field === 'discount') value = Math.min(100, Math.max(0, Number(value)));
    if (['deposit', 'shiftsOverride'].includes(field)) value = Number(value);
    const changes = { [field]: value };
    if (field === 'pickup' || field === 'returns') Object.assign(changes, { reviewShifts: current().shiftsOverride !== null });
    patch(changes);
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.id === 'status-filter') { renderRegistry(); return; }
    if (!editable()) return;
    if (input.dataset.quantity) patch({ lines: current().lines.map(line => line.gearId === input.dataset.quantity ? { ...line, quantity: Number(input.value) } : line) });
    if (input.dataset.alternative && input.value) {
      patch({ lines: current().lines.map(line => line.gearId === input.dataset.alternative ? { ...line, gearId: input.value, replaced: gear(line.gearId).name, pending: true } : line) });
    }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const { action, id } = button.dataset;
    const order = current();
    if (['add', 'parse', 'suggest', 'remove', 'confirm', 'calculated', 'reserve'].includes(action) && !editable()) return;
    if (datePicker.handle(action, id)) return;
    switch (action) {
      case 'open': setPanel(true); break;
      case 'close-editor': if (leaveBatch()) { setPanel(false); renderRegistry(); } break;
      case 'search': $('order-search-wrap').hidden = !$('order-search-wrap').hidden; if (!$('order-search-wrap').hidden) $('order-search').focus(); break;
      case 'select': {
        button.closest('[data-order-row]')?.querySelector('[data-order-check]')?.click();
        break;
      }
      case 'create': {
        if (!leaveBatch()) break;
        const fresh = newOrder();
        state.add(fresh); setPanel(true); calendarId = null; $('calendar').close(); render(); scheduleSave(); break;
      }
      case 'archive-order': {
        if (order.archived) {
          if (!await commit({ archived: false }, 'restore')) break;
          $('status-filter').value = 'All'; render();
        } else if (['Draft','Closed','Canceled'].includes(order.status) && confirm('Archive this order? It will be available in the Archive list.')) {
          if (!await commit({ archived: true }, 'archive')) break;
          showMessage('Order archived. Use the list dropdown to view archived orders or Restore to bring it back.');
        }
        break;
      }
      case 'amend':
        for (const field of ['pickup','returns','discount','deposit']) $('amend-' + field).value = order[field] ?? 0;
        $('amend-shifts').value = order.shiftsOverride ?? '';
        $('amend-reason').value = order.overrideReason;
        $('amend-equipment').innerHTML = catalog.map(item => `<label>${escape(item.name)}<input type="number" min="0" step="1" data-amend-gear="${item.id}" value="${order.lines.find(line => line.gearId === item.id)?.quantity || 0}"></label>`).join('');
        $('amend-error').textContent = '';
        $('amend-dialog').showModal(); break;
      case 'amend-apply': {
        try {
          const fields = { pickup: $('amend-pickup').value, returns: $('amend-returns').value,
            discount: $('amend-discount').valueAsNumber, deposit: $('amend-deposit').valueAsNumber,
            shiftsOverride: $('amend-shifts').value === '' ? null : $('amend-shifts').valueAsNumber,
            overrideReason: $('amend-reason').value, reviewShifts: false,
            lines: [...document.querySelectorAll('[data-amend-gear]')].map(el => ({ gearId: el.dataset.amendGear, quantity: el.valueAsNumber })).filter(line => line.quantity !== 0) };
          const propose = () => amendment(order, fields, (id, draft) => available(id, draft, state.orders, now()), now());
          const proposal = propose();
          if (!confirm(`Revise rental ${safeTotal(order)} → ${money(proposal.quotes.at(-1).total)}, deposit ${money(order.deposit || 0)} → ${money(fields.deposit)}? Pickup ${fields.pickup}. ${order.status === 'Awaiting Payment' ? 'Keep the current hold deadline.' : 'Clear picking assignments and simulate the price adjustment.'}`)) break;
          $('amend-dialog').close();
          await commit(propose(), 'amend', fields);
        } catch (error) { $('amend-error').textContent = error.message; }
        break;
      }
      case 'view-quote':
        $('quote-version').replaceChildren(...order.quotes.map(q => new Option('Version ' + q.version, q.version)));
        $('quote-version').selectedIndex = order.quotes.length - 1;
        showQuote(); $('quote-dialog').showModal(); break;
      case 'approve-quote':
        if (order.status === 'Awaiting Payment' && order.expires > now() && confirm('Record client approval for this issued quote?')) {
          const approvedVersion = Number($('quote-version').value);
          if (approvedVersion !== order.quotes.at(-1).version) break;
          $('quote-dialog').close();
          await commit({ approvedVersion }, 'approve-quote', { version: approvedVersion });
        }
        break;
      case 'print-quote': window.print(); break;
      case 'retry': await persist(); break;
      case 'download':
        if (id) alert('Quote downloads will be available in the next milestone.');
        else showMessage('Quote downloads will be available in the next milestone.');
        break;
      case 'pricing': $('pricing').open = !$('pricing').open; if ($('pricing').open) $('pricing').scrollIntoView({ block: 'nearest' }); break;
      case 'keep-shifts': patch({ reviewShifts: false }); break;
      case 'calculated': patch({ shiftsOverride: null, overrideReason: '', reviewShifts: false }); break;
      case 'catalog': if (editable()) { renderCatalog(); $('catalog-dialog').showModal(); $('catalog-search').focus(); } break;
      case 'parser': if (editable()) { previewRequest(); $('parser-dialog').showModal(); $('request').focus(); } break;
      case 'close-dialog': button.closest('dialog').close(); break;
      case 'add': addEquipment(id); renderCatalog(); break;
      case 'parse': {
        const lines = structuredClone(order.lines);
        for (const row of $('parse-preview').querySelectorAll('fieldset')) {
          const gearId = row.querySelector('select').value;
          if (!gearId) continue;
          const quantity = row.querySelector('input').valueAsNumber;
          if (!Number.isSafeInteger(quantity) || quantity < 1) { row.querySelector('input').reportValidity(); return; }
          const existing = lines.find(line => line.gearId === gearId);
          if (existing) existing.quantity += quantity;
          else lines.push({ gearId, quantity });
        }
        patch({ lines });
        $('request').value = ''; $('parser-dialog').close(); break;
      }
      case 'remove': patch({ lines: order.lines.filter(line => line.gearId !== id) }); break;
      case 'confirm': patch({ lines: order.lines.map(line => line.gearId === id ? { ...line, pending: false } : line) }); break;
      case 'suggest': {
        const used = new Set(order.lines.map(line => line.gearId));
        patch({ lines: order.lines.map(line => {
          if (!gear(line.gearId).bulk || numberAvailable(line.gearId) >= line.quantity) return line;
          const alternative = alternatives(line.gearId, line.quantity).find(item => !used.has(item.id));
          if (!alternative) return line;
          used.add(alternative.id);
          return { ...line, gearId: alternative.id, replaced: gear(line.gearId).name, pending: true };
        }) }); break;
      }
      case 'inspect-day': $('day-summary').textContent = button.getAttribute('aria-label'); break;
      case 'calendar': $('day-summary').textContent = ''; calendarId = id; monthOffset = 0; renderCalendar(); if (calendarId) $('calendar').showModal(); break;
      case 'close-calendar': calendarId = null; $('calendar').close(); break;
      case 'previous-month': $('day-summary').textContent = ''; monthOffset--; renderCalendar(); break;
      case 'next-month': $('day-summary').textContent = ''; monthOffset++; renderCalendar(); break;
      case 'reserve': reserve(); break;
      case 'extend': { const changes = workflowChanges(order, 'extend', now()); if (changes) await commit(changes, 'extend'); else showMessage('Hold expired. Reserve again.'); break; }
      case 'pay': if (order.status === 'Awaiting Payment' && confirm('Simulate payment receipt and send this order to warehouse picking?')) await commit({}, 'pay'); break;
      case 'release': if (order.status === 'Awaiting Payment' && confirm('Cancel the hold and release equipment?')) await commit({}, 'release'); break;
      case 'reset': {
        if (!confirm('Replace the orders in this workspace with the example dataset?') || !leaveBatch()) break;
        document.querySelector('.shell').inert = true;
        try {
          await state.reset();
          calendarId = null; $('calendar').close(); showMessage(''); setPanel(true); render();
        } catch (error) { showMessage(error.message); }
        finally { document.querySelector('.shell').inert = false; }
        break;
      }
    }
  });
  document.addEventListener('click', async event => {
    const action = event.target.closest('[data-warehouse]')?.dataset.warehouse;
    if (!action || committing) return;
    const order = current();
    const row = event.target.closest('[data-gear], [data-serial]') || $('workflow');
    const input = {
      serial: row.dataset.serial || row.querySelector('[name=serial]')?.value,
      gearId: row.dataset.gear, parts: [...row.querySelectorAll('input:checked')].map(el => el.value),
      condition: row.querySelector('[name=condition]')?.value, issue: row.querySelector('[name=issue]')?.value.trim(),
      charge: row.querySelector('[name=charge]')?.valueAsNumber,
    };
    try {
      const changes = warehouseAction(order, state.orders, action, input, now());
      if (['dispatch','cancel-paid','settle','clear-unit','repair-kit','finish','collect-balance'].includes(action) && !confirm(
        changes.settlement ? `Confirm settlement: release ${money(changes.settlement.released)}, balance due ${money(changes.settlement.balance)}?` :
        action === 'cancel-paid' ? 'Cancel this paid order, release all assigned gear, and simulate refunding the rental and deposit?' : 'Confirm ' + event.target.textContent + '?')) return;
      await commit(changes, action, input);
    } catch (error) { showMessage(error.message); }
  });
  document.addEventListener('keydown', event => { if (event.target.matches('[data-action="pick-date"]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); datePicker.open(event.target.dataset.id); } if (event.key === 'Escape') { calendarId = null; $('calendar').close(); } });
  window.addEventListener('beforeunload', event => {
    if (state.dirty || committing) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  let overdueOrders = '';
  setInterval(() => {
    if (committing) return;
    const overdue = state.orders.filter(order => ['On Rent', 'Return Inspection'].includes(order.status) &&
      new Date(order.returns).getTime() <= now() && order.units?.some(unit => unit.condition === 'Assigned')).map(order => order.id).join(',');
    if (overdue !== overdueOrders) { overdueOrders = overdue; render(); }
    if (state.reconcileExpiry()) { render(); scheduleSave(); }
    else renderTimer();
  }, EXPIRY_CHECK_MS);
  render();
  await persist();
  initSelectSizing([$('status-filter'), $('order-status')]);

  // Status choices invoke the same guarded workflow actions as the existing controls.
  $('order-status').addEventListener('change', event => {
    const requested = event.target.value;
    const previous = current().status;
    event.target.value = previous;
    if (requested === previous) return;
    if (previous === 'Draft' && requested === 'Awaiting Payment') reserve();
    else if (previous === 'Awaiting Payment') {
      const action = requested === 'Draft' ? 'release' : requested === 'Warehouse Picking' ? 'pay' : null;
      if (action) document.querySelector(`#workflow [data-action="${action}"]`)?.click();
    }
    render();
  });

  // Row selection delegates to the same checkbox path, including pending-edit guards.
  document.addEventListener('click', event => {
    const row = event.target.closest('[data-order-row]');
    if (!row || event.target.closest('button, input, select, a')) return;
    if (window.getSelection()?.toString()) return;
    row.querySelector('[data-order-check]')?.click();
  });

  initScrollbar($('order-rows'));

  function updateRegistryDateHeading() {
    const heading = document.querySelector('.rental-dates-heading');
    heading.textContent = $('workspace').classList.contains('panel-closed') && $('registry').clientWidth >= 1100 ? 'Pickup' : 'Dates';
  }
  new ResizeObserver(updateRegistryDateHeading).observe($('registry'));
  new MutationObserver(updateRegistryDateHeading).observe($('workspace'), { attributes: true, attributeFilter: ['class'] });
}
