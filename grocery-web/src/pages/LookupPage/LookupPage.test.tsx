import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from '../../contexts/LanguageContext'
import LookupPage from './LookupPage'
import { ApiError } from '../../api/http'
import * as products from '../../api/products'
import { compareResponse, priceOffer } from '../../api/products.testFactory'

const PRODUCT: products.Product = {
  id: 'abc-123',
  name: 'Milk 1L',
  description: null,
  price: 6.9,
  sku: '7290000066318',
  createdAt: '',
  updatedAt: '',
}

function renderAt(sku: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/lookup/${sku}`]}>
        <Routes>
          <Route path="/lookup/:sku" element={<LookupPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('LookupPage', () => {
  beforeEach(() => {
    localStorage.setItem('grocery-language', 'en')
  })

  it('shows the store price for a known barcode', async () => {
    vi.spyOn(products, 'getBySku').mockResolvedValue(PRODUCT)

    renderAt('7290000066318')

    expect(await screen.findByText('Milk 1L')).toBeInTheDocument()
    expect(screen.getByText(/6\.90/)).toBeInTheDocument()
  })

  it('does not consult the external service when the item has a real price', async () => {
    vi.spyOn(products, 'getBySku').mockResolvedValue(PRODUCT)
    const compare = vi.spyOn(products, 'comparePrices')

    renderAt('7290000066318')
    await screen.findByText('Milk 1L')

    // A slow external scrape is pointless -- and misleading -- when the store
    // price is known.
    expect(compare).not.toHaveBeenCalled()
  })

  it('reports an unknown barcode as not in the system', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(compareResponse())

    renderAt('7290000012345')
    expect(await screen.findByText(/not in the system/i)).toBeInTheDocument()
  })

  it('labels an external reference as NOT the store price', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({ productName: 'Some Milk', typicalPrice: '7.20', resultCount: 84 }),
    )

    renderAt('7290000012345')

    // The safety property: the number is always accompanied by an explicit
    // denial that it is the store's price. An employee reading this aloud to a
    // customer is the failure mode being guarded against.
    expect(await screen.findByText(/7\.20/)).toBeInTheDocument()
    expect(screen.getByText(/NOT the store price/i)).toBeInTheDocument()
    expect(screen.getByText(/confirm with a manager/i)).toBeInTheDocument()
  })

  it('never renders an external reference with the real-price styling', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({ productName: 'Some Milk', typicalPrice: '7.20', resultCount: 84 }),
    )

    const { container } = renderAt('7290000012345')
    await screen.findByText(/7\.20/)

    // price-card__price is the large, authoritative treatment; it must be
    // reserved for prices that came from our own system.
    expect(container.querySelector('.price-card__price')).toBeNull()
    expect(container.querySelector('.market-hint__value')).not.toBeNull()
  })

  it('states the quantity a bulk deal requires', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({
        typicalPrice: '6.90',
        resultCount: 84,
        bestBulk: priceOffer({ price: '3.00', chain: 'Osher Ad', requiredQuantity: 10 }),
      }),
    )

    renderAt('7290000012345')

    // "₪3.00" on its own would be read as what one costs. It is not -- it needs
    // ten of them -- so the quantity has to travel with the number.
    expect(await screen.findByText(/3\.00/)).toBeInTheDocument()
    expect(screen.getByText(/buying 10/i)).toBeInTheDocument()
  })

  it('shows the dearest real shelf price alongside the cheapest', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({
        typicalPrice: '5.90',
        resultCount: 84,
        bestSingleUnit: priceOffer({ price: '3.00', chain: 'Carrefour' }),
        highestRealPrice: priceOffer({ price: '7.90', chain: 'Super Yuda' }),
      }),
    )

    renderAt('7290000012345')

    expect(await screen.findByText(/dearest real shelf price/i)).toBeInTheDocument()
    expect(screen.getByText(/7\.90/)).toBeInTheDocument()
  })

  it('hides the dearest price when it matches the cheapest', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({
        typicalPrice: '5.00',
        resultCount: 12,
        bestSingleUnit: priceOffer({ price: '5.00', chain: 'A' }),
        highestRealPrice: priceOffer({ price: '5.00', chain: 'B' }),
      }),
    )

    renderAt('7290000012345')
    await screen.findByText(/5\.00/)

    // Every shop charges the same -- a "range" of one number is noise.
    expect(screen.queryByText(/dearest real shelf price/i)).not.toBeInTheDocument()
  })

  it('says when a listing was left out for inflating its shelf price', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(
      compareResponse({
        typicalPrice: '6.90',
        resultCount: 84,
        inflatedOffers: [priceOffer({ price: '3.00', chain: 'yellow' })],
      }),
    )

    renderAt('7290000012345')

    expect(await screen.findByText(/high shelf price with a standing discount/i)).toBeInTheDocument()
  })

  it('distinguishes a blocked scrape from a barcode nobody sells', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue(compareResponse({ degraded: true }))

    renderAt('7290000012345')

    // Worth retrying, unlike "no such product" -- so it must not say the latter.
    expect(await screen.findByText(/not responding right now/i)).toBeInTheDocument()
    expect(screen.queryByText(/no external price reference was found/i)).not.toBeInTheDocument()
  })

  it('surfaces a server error rather than claiming the item is missing', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(500, 'Server Error', 'boom'))

    renderAt('7290000012345')

    await waitFor(() => expect(screen.queryByText(/not in the system/i)).not.toBeInTheDocument())
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })
})
