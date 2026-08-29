import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from './contexts/LanguageContext'
import App from './App.jsx'

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

  it('renders the browse page with a scan action', () => {
    renderAt('/')
    expect(screen.getByRole('button', { name: /סרוק ברקוד|scan barcode/i })).toBeInTheDocument()
  })

  it('renders the create page without a disabled SKU field', () => {
    // The regression guarded here: reaching /create from the navbar used to be
    // a dead end, because the SKU input was hardcoded `disabled` and nothing
    // on the page could populate it.
    renderAt('/create')
    const sku = screen.getByLabelText(/מק"ט|sku/i)
    expect(sku).toBeInTheDocument()
    expect(sku).not.toBeDisabled()
  })

  it('renders the product list page', async () => {
    renderAt('/view')
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('sets the document language and direction from the provider', async () => {
    renderAt('/')
    // Hebrew is the default, and native dialogs and select pickers inherit
    // direction from <html>, not from an inner div.
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('he')
      expect(document.documentElement.dir).toBe('rtl')
    })
  })
})
