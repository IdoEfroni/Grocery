import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import App from './App.jsx'
import * as products from './api/products'

const PRODUCT: products.Product = {
  id: 'abc-123',
  name: 'Milk 1L',
  description: null,
  price: 6.9,
  sku: '7290000066318',
  createdAt: '',
  updatedAt: '',
}

function renderAt(path: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('App', () => {
  beforeEach(() => {
    // Pin the language so assertions do not depend on the Hebrew default.
    localStorage.setItem('grocery-language', 'en')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  it('offers scanning as the primary action on the home screen', () => {
    renderAt('/')
    expect(screen.getByRole('button', { name: /scan for a price/i })).toBeInTheDocument()
  })

  it('offers a name search for items without a usable barcode', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: /search by name/i })).toBeInTheDocument()
  })

  it('renders the create page with an editable SKU field', () => {
    // Regression: /create reached from the navbar used to be a dead end, with
    // the SKU input hardcoded disabled and nothing able to populate it.
    renderAt('/create')
    const sku = screen.getByLabelText(/sku/i)
    expect(sku).toBeInTheDocument()
    expect(sku).not.toBeDisabled()
  })

  it('shows a product as a read-only price view, not an edit form', async () => {
    vi.spyOn(products, 'getProductById').mockResolvedValue(PRODUCT)

    renderAt('/products/abc-123')

    expect(await screen.findByText('Milk 1L')).toBeInTheDocument()
    expect(screen.getByText(/6\.90/)).toBeInTheDocument()
    // The safety property: someone checking a price cannot delete the product
    // or edit a field by accident.
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit product/i })).toBeInTheDocument()
  })

  it('exposes the edit form on its own route', async () => {
    vi.spyOn(products, 'getProductById').mockResolvedValue(PRODUCT)

    renderAt('/products/abc-123/edit')

    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('sets the document language and direction from the provider', async () => {
    localStorage.setItem('grocery-language', 'he')
    renderAt('/')
    // Native dialogs, select pickers and validation bubbles inherit direction
    // from <html>, not from an inner div.
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('he')
      expect(document.documentElement.dir).toBe('rtl')
    })
  })
})
