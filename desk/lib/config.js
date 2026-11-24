// Shared application timing and supported prototype statuses.
export const AUTOSAVE_DELAY_MS = 300;
export const HOLD_DURATION_MS = 24 * 60 * 60 * 1000;
export const EXPIRY_CHECK_MS = 1000;
export const ORDER_STATUSES = Object.freeze(['Draft', 'Awaiting Payment', 'Warehouse Picking', 'Ready for Pickup', 'On Rent', 'Return Inspection', 'Settlement Required', 'Closed', 'Canceled']);
