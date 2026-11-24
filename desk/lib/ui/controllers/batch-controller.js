import { $ } from '../shared/dom.js';
import { selectedOrders } from '../../state/order-selectors.js';
import { renderBatchPreview } from '../views/batch-view.js';

export function createBatchController({ state, batchIds, render, renderRegistry, setPanel, persist, showMessage, closeCalendar }) {
  const workspace = $('workspace');
  let batchDirty = false;
  let selectedAllFromHeader = false;

  function selectedBatchOrders() { return selectedOrders(state.orders, batchIds); }
  function confirmBatchDiscard() { return !batchDirty || confirm('Discard the pending batch changes? Cancel to keep editing.'); }
  function leaveBatch() {
    if (!confirmBatchDiscard()) return false;
    batchIds.clear(); batchDirty = false; selectedAllFromHeader = false;
    $('batch-editor').hidden = true; $('editor').hidden = false;
    $('workspace').classList.remove('batch-mode'); renderRegistry();
    return true;
  }
  function openBatch() {
    if (batchIds.size === 1) {
      persist(); state.select([...batchIds][0]); batchDirty = false;
      $('batch-editor').hidden = true; $('editor').hidden = false;
      workspace.classList.remove('batch-mode', 'panel-closed');
      closeCalendar();
      showMessage(''); render(); return;
    }
    $('batch-editor').hidden = !batchIds.size;
    $('editor').hidden = Boolean(batchIds.size);
    $('workspace').classList.toggle('batch-mode', Boolean(batchIds.size));
    $('workspace').classList.remove('panel-closed');
    batchDirty = false;
    for (const field of ['manager', 'discount']) {
      const values = selectedBatchOrders().map(order => field === 'manager' ? order.manager || '' : order.discount);
      const same = values.every(value => value === values[0]);
      $(`batch-${field}-enabled`).checked = false;
      $(`batch-${field}`).disabled = true;
      $(`batch-${field}`).value = same ? values[0] ?? '' : '';
      $(`batch-${field}`).placeholder = same ? '' : 'Mixed values';
    }
    $('batch-error').textContent = '';
    renderRegistry(); updateBatchPreview();
  }
  function updateBatchPreview() {
    const targets = selectedBatchOrders();
    const allDraft = targets.every(order => order.status === 'Draft' && !order.archived);
    const visibleIds = new Set([...document.querySelectorAll('[data-order-check]')].map(input => input.dataset.orderCheck));
    batchDirty = Boolean(renderBatchPreview({
      targets, allDraft, hidden: targets.filter(order => !visibleIds.has(order.id)).length,
      manager: $('batch-manager-enabled').checked,
      discount: allDraft && $('batch-discount-enabled').checked,
      managerValue: $('batch-manager').value.trim(), discountValue: $('batch-discount').value,
    }));
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-order-check], #select-orders')) {
      if (!confirmBatchDiscard()) { renderRegistry(); return; }
      selectedAllFromHeader = input.id === 'select-orders' && input.checked;
      const ids = input.id === 'select-orders' ? [...document.querySelectorAll('[data-order-check]')].map(el => el.dataset.orderCheck) : [input.dataset.orderCheck];
      for (const id of ids) { if (input.checked) batchIds.add(id); else batchIds.delete(id); }
      if (batchIds.size) openBatch(); else { leaveBatchWithoutPrompt(); setPanel(false); renderRegistry(); }
    }
    if (input.id === 'batch-manager-enabled' || input.id === 'batch-discount-enabled') {
      $(input.id.replace('-enabled', '')).disabled = !input.checked; updateBatchPreview();
    }
  });
  function leaveBatchWithoutPrompt() { batchDirty = false; leaveBatch(); render(); }
  document.addEventListener('input', event => { if (['batch-manager', 'batch-discount'].includes(event.target.id)) updateBatchPreview(); });
  document.addEventListener('click', async event => {
    const action = event.target.closest('[data-batch]')?.dataset.batch;
    if (action === 'clear') { if (leaveBatch()) render(); }
    if (action === 'drafts' && confirmBatchDiscard()) {
      selectedAllFromHeader = false;
      for (const order of selectedBatchOrders()) if (order.status !== 'Draft' || order.archived) batchIds.delete(order.id);
      if (batchIds.size) openBatch(); else leaveBatchWithoutPrompt();
    }
    if (action === 'active' && confirmBatchDiscard()) {
      selectedAllFromHeader = false;
      for (const order of selectedBatchOrders()) if (order.archived) batchIds.delete(order.id);
      if (batchIds.size) openBatch(); else leaveBatchWithoutPrompt();
    }
    if (action !== 'apply') return;
    const targets = selectedBatchOrders();
    const changes = {};
    if ($('batch-manager-enabled').checked) changes.manager = $('batch-manager').value.trim();
    if ($('batch-discount-enabled').checked) {
      const value = Number($('batch-discount').value);
      if (targets.some(order => order.status !== 'Draft' || order.archived) || $('batch-discount').value === '' || !Number.isFinite(value) || value < 0 || value > 100) {
        $('batch-error').textContent = 'Choose a discount from 0 to 100, with only Draft orders selected.'; return;
      }
      changes.discount = value;
    }
    if (!targets.length || !Object.keys(changes).length) return;
    // Flush pending individual edits first, then save the entire batch in one write.
    workspace.inert = true;
    try { if (!await persist()) throw new Error('Save failed'); await state.commitBatch(new Set(batchIds), changes); }
    catch { $('batch-error').textContent = 'Changes could not be saved. Keep this panel open and retry.'; return; }
    finally { workspace.inert = false; }
    const count = targets.length; leaveBatchWithoutPrompt();
    showMessage(`Updated ${count} orders. Saved.`);
  });

  return { leave: leaveBatch, preview: updateBatchPreview, isHeaderSelected: () => selectedAllFromHeader };
}
