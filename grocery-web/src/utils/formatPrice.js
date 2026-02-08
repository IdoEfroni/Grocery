/**
 * Format a price for display in Israeli Shekel (ILS).
 * @param {number|string|null|undefined} price
 * @returns {string} e.g. "₪26.19"
 */
export function formatPrice(price) {
  const num = Number(price);
  if (Number.isNaN(num)) return '₪0.00';
  return `₪${num.toFixed(2)}`;
}
