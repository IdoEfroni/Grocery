import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from '../../contexts/LanguageContext'
import LookupPage from './LookupPage'
import { ApiError } from '../../api/http'
import * as products from '../../api/products'

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
    vi.spyOn(products, 'comparePrices').mockResolvedValue({
      productName: '',
      description: '',
      averagePrice: 'N/A',
    })

    renderAt('7290000012345')
    expect(await screen.findByText(/not in the system/i)).toBeInTheDocument()
  })

  it('labels an external average as NOT the store price', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue({
      productName: 'Some Milk',
      description: '',
      averagePrice: '7.20',
    })

    renderAt('7290000012345')

    // The safety property: the number is always accompanied by an explicit
    // denial that it is the store's price. An employee reading this aloud to a
    // customer is the failure mode being guarded against.
    expect(await screen.findByText(/7\.20/)).toBeInTheDocument()
    expect(screen.getByText(/NOT the store price/i)).toBeInTheDocument()
    expect(screen.getByText(/confirm with a manager/i)).toBeInTheDocument()
  })

  it('never renders an external average with the real-price styling', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))
    vi.spyOn(products, 'comparePrices').mockResolvedValue({
      productName: 'Some Milk',
      description: '',
      averagePrice: '7.20',
    })

    const { container } = renderAt('7290000012345')
    await screen.findByText(/7\.20/)

    // price-card__price is the large, authoritative treatment; it must be
    // reserved for prices that came from our own system.
    expect(container.querySelector('.price-card__price')).toBeNull()
    expect(container.querySelector('.market-hint__value')).not.toBeNull()
  })

  it('surfaces a server error rather than claiming the item is missing', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(500, 'Server Error', 'boom'))

    renderAt('7290000012345')

    await waitFor(() => expect(screen.queryByText(/not in the system/i)).not.toBeInTheDocument())
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })
})
