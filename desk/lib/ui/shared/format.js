const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
export const money = value => currencyFormatter.format(value);

export function remainingTime(expires, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
