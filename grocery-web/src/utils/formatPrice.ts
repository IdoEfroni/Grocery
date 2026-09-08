/**
 * Format a price in Israeli Shekel.
 *
 * Uses Intl rather than a hardcoded '₪' prefix so the symbol lands on the
 * correct side of the number in RTL, and digits/grouping follow the locale.
 */
const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(locale: string): Intl.NumberFormat {
  let formatter = formatters.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formatters.set(locale, formatter)
  }
  return formatter
}

export function formatPrice(
  price: number | string | null | undefined,
  locale = 'he-IL',
): string {
  const num = Number(price)
  return formatterFor(locale).format(Number.isNaN(num) ? 0 : num)
}
