import { $, escape } from '../shared/dom.js';
export function renderBatchPreview({ targets, allDraft, hidden, manager, discount, managerValue, discountValue }) {
  if (!targets.length) return;
  const archived = targets.some(order => order.archived);
  $('batch-active').hidden = !archived;
  $('batch-manager-enabled').disabled = archived;
  $('batch-discount-enabled').disabled = !allDraft;
  $('batch-drafts').hidden = allDraft;
  $('batch-discount-note').textContent = archived ? 'Remove archived orders to edit this selection.' : allDraft ? '' : 'Discount changes require every selected order to be Draft.';
  $('batch-title').textContent = `${targets.length} orders selected${hidden ? ` · ${hidden} hidden by filters` : ''}`;
  $('batch-orders').innerHTML = targets.map(order => `<p>#${escape(order.id)} · ${escape(order.project)} · ${escape(order.status)}</p>`).join('');
  const batchDirty = manager || discount;
  $('batch-apply').disabled = !batchDirty;
  $('batch-apply').textContent = `Apply to ${targets.length} orders${hidden ? ` (${hidden} hidden)` : ''}`;
  $('batch-preview').innerHTML = !batchDirty ? 'Enable a field to preview changes.' : targets.map(order => `<p><strong>#${escape(order.id)} · ${escape(order.project)}</strong>${manager ? `Manager: ${escape(order.manager || 'Unassigned')} → ${escape(managerValue || 'Unassigned')}<br>` : ''}${discount ? `Discount: ${order.discount}% → ${escape(discountValue)}%` : ''}</p>`).join('');
  return batchDirty;
}
