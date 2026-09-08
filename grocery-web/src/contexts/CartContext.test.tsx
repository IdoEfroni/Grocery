import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CartProvider, useCart, type CartLine } from './CartContext'
import { fromAgorot } from '../utils/money'

let api: ReturnType<typeof useCart>

function Harness() {
  api = useCart()
  return <span data-testid="total">{fromAgorot(api.totals.totalAgorot)}</span>
}

const setup = () =>
  render(
    <CartProvider>
      <Harness />
    </CartProvider>,
  )

const line = (over: Partial<Omit<CartLine, 'id'>> = {}): Omit<CartLine, 'id'> => ({
  sku: '7290000066318',
  name: 'Milk 1L',
  unitPrice: 6.9,
  quantity: 1,
  discount: { kind: 'none' },
  source: 'catalog',
  ...over,
})

describe('CartContext', () => {
  beforeEach(() => localStorage.clear())

  it('adds lines and totals them', () => {
    setup()
    act(() => {
      api.addLine(line())
      api.addLine(line({ sku: '2', name: 'Bread', unitPrice: 12.5, quantity: 2 }))
    })
    expect(screen.getByTestId('total')).toHaveTextContent('31.9')
  })

  it('keeps the same product as separate lines', () => {
    // Two of the same item can be rung up separately -- one discounted, one
    // not -- so scanning twice must not silently merge them.
    setup()
    act(() => {
      api.addLine(line())
      api.addLine(line())
    })
    expect(api.lines).toHaveLength(2)
    expect(api.lines[0].id).not.toBe(api.lines[1].id)
  })

  it('counts items not in the system, for the banner', () => {
    setup()
    act(() => {
      api.addLine(line())
      api.addLine(line({ sku: '999', source: 'manual' }))
      api.addLine(line({ sku: '998', source: 'manual' }))
    })
    expect(api.unregisteredCount).toBe(2)
  })

  it('applies a per-line discount', () => {
    setup()
    act(() => api.addLine(line({ unitPrice: 6, quantity: 1 })))
    act(() => api.setDiscount(api.lines[0].id, { kind: 'amount', value: 1 }))
    expect(screen.getByTestId('total')).toHaveTextContent('5')
  })

  it('never lets a quantity go negative', () => {
    setup()
    act(() => api.addLine(line()))
    act(() => api.setQuantity(api.lines[0].id, -5))
    expect(api.lines[0].quantity).toBe(0)
  })

  it('removes a line', () => {
    setup()
    act(() => api.addLine(line()))
    act(() => api.removeLine(api.lines[0].id))
    expect(api.lines).toHaveLength(0)
  })

  it('survives a reload mid-transaction', () => {
    // The phone locking or the browser reloading in front of a customer must
    // not cost a half-scanned basket.
    setup()
    act(() => api.addLine(line({ unitPrice: 6.9, quantity: 2 })))

    const reopened = render(
      <CartProvider>
        <Harness />
      </CartProvider>,
    )
    expect(reopened.getAllByTestId('total')[1]).toHaveTextContent('13.8')
  })

  it('starts empty rather than throwing on corrupt stored data', () => {
    localStorage.setItem('grocery-cart', '{ not json')
    setup()
    expect(api.lines).toHaveLength(0)
  })

  it('discards stored lines that no longer match the shape', () => {
    localStorage.setItem('grocery-cart', JSON.stringify([{ id: 'x' }, null, 42]))
    setup()
    expect(api.lines).toHaveLength(0)
  })

  it('clears the cart', () => {
    setup()
    act(() => api.addLine(line()))
    act(() => api.clear())
    expect(api.lines).toHaveLength(0)
    expect(api.totals.totalAgorot).toBe(0)
  })
})
