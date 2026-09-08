/**
 * Money arithmetic for the till.
 *
 * Everything is computed in agorot (integer hundredths) rather than shekels,
 * because binary floating point cannot represent most decimal fractions: in
 * plain JS `0.1 + 0.2` is `0.30000000000000004`, and `6 * 1.15` is
 * `6.8999999999999995`. Summed across a basket that drifts, and a customer is
 * charged the wrong amount.
 *
 * Rounding is half-up, which is what a person doing this on paper expects and
 * what a printed receipt should agree with.
 */

/** Shekels -> integer agorot. */
export function toAgorot(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  // The epsilon nudge corrects values that are a hair below the true decimal,
  // e.g. 4.605 arriving as 4.604999999999999, which would otherwise round down.
  return Math.round((amount + Number.EPSILON) * 100)
}

/** Integer agorot -> shekels, safe to display or send to the API. */
export function fromAgorot(agorot: number): number {
  return Math.round(agorot) / 100
}

export type Discount =
  | { kind: 'none' }
  | { kind: 'percent'; value: number }
  | { kind: 'amount'; value: number }

export const NO_DISCOUNT: Discount = { kind: 'none' }

/**
 * A line's value before any discount.
 * Quantity may be fractional for loose goods sold by weight.
 */
export function lineSubtotalAgorot(unitPrice: number, quantity: number): number {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
  return Math.round(toAgorot(unitPrice) * qty)
}

/**
 * How much a discount takes off a line.
 *
 * Both kinds apply to the line total, not per unit. That is the reading that
 * matches how the amount is entered -- "take a shekel off this" means off what
 * the line comes to -- and the UI shows the arithmetic so there is nothing to
 * infer. Never exceeds the subtotal: a discount cannot make a line negative.
 */
export function discountAmountAgorot(subtotalAgorot: number, discount: Discount): number {
  if (subtotalAgorot <= 0) return 0

  switch (discount.kind) {
    case 'percent': {
      const pct = Math.min(Math.max(discount.value, 0), 100)
      return Math.min(Math.round((subtotalAgorot * pct) / 100), subtotalAgorot)
    }
    case 'amount':
      return Math.min(Math.max(toAgorot(discount.value), 0), subtotalAgorot)
    default:
      return 0
  }
}

export function lineTotalAgorot(
  unitPrice: number,
  quantity: number,
  discount: Discount = NO_DISCOUNT,
): number {
  const subtotal = lineSubtotalAgorot(unitPrice, quantity)
  return subtotal - discountAmountAgorot(subtotal, discount)
}

export interface Totals {
  subtotalAgorot: number
  discountAgorot: number
  totalAgorot: number
}

export function sumTotals(
  lines: { unitPrice: number; quantity: number; discount: Discount }[],
): Totals {
  // Each line is rounded before summing, so the printed lines always add up to
  // the printed total. Summing exact values and rounding once at the end can
  // leave a receipt whose column does not tally.
  let subtotalAgorot = 0
  let discountAgorot = 0

  for (const line of lines) {
    const subtotal = lineSubtotalAgorot(line.unitPrice, line.quantity)
    subtotalAgorot += subtotal
    discountAgorot += discountAmountAgorot(subtotal, line.discount)
  }

  return {
    subtotalAgorot,
    discountAgorot,
    totalAgorot: subtotalAgorot - discountAgorot,
  }
}

/** Describes a discount for the UI, e.g. "10%" or "₪1.50". */
export function formatDiscount(discount: Discount): string | null {
  switch (discount.kind) {
    case 'percent':
      return `${discount.value}%`
    case 'amount':
      return `₪${fromAgorot(toAgorot(discount.value)).toFixed(2)}`
    default:
      return null
  }
}
