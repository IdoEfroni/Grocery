import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../contexts/LanguageContext'
import { CartProvider } from '../../contexts/CartContext'
import CartPage from './CartPage'
import { ApiError } from '../../api/http'
import * as products from '../../api/products'
import { compareResponse } from '../../api/products.testFactory'

// Drive the scan directly: the camera itself is covered by the scanner's own
// tests, and what matters here is what the till does with a barcode.
let emitScan: ((sku: string) => void) | null = null
vi.mock('../../components/BarcodeScanner/BarcodeScanner', () => ({
  default: ({ isOpen, onScan }: { isOpen: boolean; onScan: (v: string) => void }) => {
    emitScan = onScan
    return isOpen ? <div data-testid="scanner-open" /> : null
  },
}))

const PRODUCT: products.Product = {
  id: 'abc-123',
  name: 'Milk 1L',
  description: null,
  price: 6.9,
  sku: '7290000066318',
  createdAt: '',
  updatedAt: '',
}

function setup() {
  return render(
    <LanguageProvider>
      <CartProvider>
        <MemoryRouter>
          <CartPage />
        </MemoryRouter>
      </CartProvider>
    </LanguageProvider>,
  )
}

describe('CartPage', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('grocery-language', 'en')
    emitScan = null
  })

  it('scanning a known product asks for a quantity at its catalogue price', async () => {
    vi.spyOn(products, 'getBySku').mockResolvedValue(PRODUCT)
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290000066318')

    expect(await screen.findByText('Milk 1L')).toBeInTheDocument()
    expect(screen.getByLabelText(/^price/i)).toHaveValue(6.9)
    expect(screen.getByLabelText(/^quantity$/i)).toHaveValue(1)
  })

  it('adds the scanned product to the bill', async () => {
    vi.spyOn(products, 'getBySku').mockResolvedValue(PRODUCT)
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290000066318')
    await screen.findByText('Milk 1L')

    const qty = screen.getByLabelText(/^quantity$/i)
    await userEvent.clear(qty)
    await userEvent.type(qty, '3')
    await userEvent.click(screen.getByRole('button', { name: /add to bill/i }))

    // 3 x 6.90 = 20.70, shown on the line and again in the summary -- the two
    // agreeing is the point, so both matches are expected.
    await waitFor(() => expect(screen.getAllByText(/20\.70/).length).toBeGreaterThanOrEqual(2))
  })

  it('an unknown barcode asks for a price and suggests one from the web', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({ productName: 'Bulgarian Cheese', typicalPrice: '21.27' }),
    )
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290011499129')

    expect(await screen.findByText(/not in the system/i)).toBeInTheDocument()
    // The suggestion is filled in behind the form, so there is a figure to
    // accept rather than invent while a customer waits.
    await waitFor(() => expect(screen.getByLabelText(/price to charge/i)).toHaveValue(21.27))
    expect(screen.getByLabelText(/^name/i)).toHaveValue('Bulgarian Cheese')
  })

  it('labels the suggestion as external, not the shop price', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({ productName: 'X', typicalPrice: '21.27' }),
    )
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290011499129')

    expect(await screen.findByText(/not your shop price/i)).toBeInTheDocument()
  })

  it('flags unregistered items and keeps the reminder on screen', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({ productName: 'Cheese', typicalPrice: '21.27' }),
    )
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290011499129')
    await waitFor(() => expect(screen.getByLabelText(/price to charge/i)).toHaveValue(21.27))
    await userEvent.click(screen.getByRole('button', { name: /add to bill/i }))

    expect(await screen.findByText(/1 item\(s\) not in the system/i)).toBeInTheDocument()
    expect(screen.getByText(/add missing products/i)).toBeInTheDocument()
  })

  it('still lets a price be set when no suggestion is found', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockRejectedValue(new Error('scrape failed'))
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('999')

    // A failed lookup must not block the sale.
    expect(await screen.findByText(/no suggestion found/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/price to charge/i)).toBeEnabled()
  })

  it('reports a server error instead of treating it as a new product', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(500, 'Server Error', 'boom'))
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290000066318')

    expect(await screen.findByText(/500/)).toBeInTheDocument()
    expect(screen.queryByText(/not in the system/i)).not.toBeInTheDocument()
  })

  it('produces a receipt that totals the basket', async () => {
    vi.spyOn(products, 'getBySku').mockResolvedValue(PRODUCT)
    setup()

    await userEvent.click(screen.getByRole('button', { name: /scan an item/i }))
    emitScan!('7290000066318')
    await screen.findByText('Milk 1L')
    await userEvent.click(screen.getByRole('button', { name: /add to bill/i }))

    await userEvent.click(await screen.findByRole('button', { name: /finish bill/i }))

    const receipt = await screen.findByRole('dialog')
    expect(receipt).toHaveTextContent(/6\.90/)
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
  })
})
