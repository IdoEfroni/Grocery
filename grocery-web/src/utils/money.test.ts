import { describe, it, expect } from 'vitest'
import {
  discountAmountAgorot,
  formatDiscount,
  fromAgorot,
  lineSubtotalAgorot,
  lineTotalAgorot,
  sumTotals,
  toAgorot,
  type Discount,
} from './money'

describe('money conversion', () => {
  it('survives the classic float traps', () => {
    // Plain arithmetic gives 0.30000000000000004 and 6.8999999999999995.
    expect(fromAgorot(toAgorot(0.1) + toAgorot(0.2))).toBe(0.3)
    expect(fromAgorot(toAgorot(6) * 1.15)).toBeCloseTo(6.9, 2)
  })

  it('rounds half up, the way a person would on paper', () => {
    expect(toAgorot(4.605)).toBe(461)
    expect(toAgorot(0.005)).toBe(1)
  })

  it('treats rubbish input as zero rather than NaN', () => {
    expect(toAgorot(Number.NaN)).toBe(0)
    expect(toAgorot(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('line arithmetic', () => {
  it('multiplies price by quantity', () => {
    expect(lineSubtotalAgorot(6, 3)).toBe(1800)
  })

  it('handles goods sold by weight', () => {
    // 1.35 kg of something at 12.90/kg
    expect(lineSubtotalAgorot(12.9, 1.35)).toBe(1742)
  })

  it('treats a missing or negative quantity as zero', () => {
    expect(lineSubtotalAgorot(6, 0)).toBe(0)
    expect(lineSubtotalAgorot(6, -2)).toBe(0)
  })
})

describe('discounts', () => {
  it('takes a fixed amount off the line', () => {
    // The shopkeeper's example: 6 shekels, knock one off, pay 5.
    expect(fromAgorot(lineTotalAgorot(6, 1, { kind: 'amount', value: 1 }))).toBe(5)
  })

  it('takes a percentage off the line total', () => {
    expect(fromAgorot(lineTotalAgorot(10, 2, { kind: 'percent', value: 10 }))).toBe(18)
  })

  it('never makes a line negative', () => {
    // Someone types 100 into the shekels-off box on a 6 shekel item.
    expect(lineTotalAgorot(6, 1, { kind: 'amount', value: 100 })).toBe(0)
  })

  it('clamps a percentage to 0-100', () => {
    expect(lineTotalAgorot(10, 1, { kind: 'percent', value: 150 })).toBe(0)
    expect(lineTotalAgorot(10, 1, { kind: 'percent', value: -5 })).toBe(1000)
  })

  it('ignores a discount on a zero-value line', () => {
    expect(discountAmountAgorot(0, { kind: 'percent', value: 50 })).toBe(0)
  })
})

describe('cart totals', () => {
  it('adds up a basket', () => {
    const lines = [
      { unitPrice: 6.9, quantity: 1, discount: { kind: 'none' } as Discount },
      { unitPrice: 12.5, quantity: 2, discount: { kind: 'percent', value: 10 } as Discount },
      { unitPrice: 3.3, quantity: 3, discount: { kind: 'amount', value: 1 } as Discount },
    ]
    const totals = sumTotals(lines)

    expect(fromAgorot(totals.subtotalAgorot)).toBe(6.9 + 25 + 9.9)
    expect(fromAgorot(totals.discountAgorot)).toBe(2.5 + 1)
    expect(fromAgorot(totals.totalAgorot)).toBe(38.3)
  })

  it('produces a receipt whose lines add up to its total', () => {
    // Each line is rounded before summing. Summing exact values and rounding
    // once at the end can print a column that does not tally, which is the
    // kind of thing a customer notices.
    const lines = Array.from({ length: 7 }, () => ({
      unitPrice: 0.335,
      quantity: 1,
      discount: { kind: 'none' } as Discount,
    }))
    const totals = sumTotals(lines)
    const perLine = lineTotalAgorot(0.335, 1)

    expect(totals.totalAgorot).toBe(perLine * 7)
  })

  it('handles an empty cart', () => {
    expect(sumTotals([])).toEqual({ subtotalAgorot: 0, discountAgorot: 0, totalAgorot: 0 })
  })
})

describe('formatDiscount', () => {
  it('describes each kind for the UI', () => {
    expect(formatDiscount({ kind: 'percent', value: 10 })).toBe('10%')
    expect(formatDiscount({ kind: 'amount', value: 1.5 })).toBe('₪1.50')
    expect(formatDiscount({ kind: 'none' })).toBeNull()
  })
})
