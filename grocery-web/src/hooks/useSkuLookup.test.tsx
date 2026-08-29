import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useSkuLookup } from './useSkuLookup'
import { ApiError } from '../api/http'
import * as products from '../api/products'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

function Harness({ sku }: { sku: string }) {
  const { lookup, error } = useSkuLookup()
  return (
    <div>
      <button type="button" onClick={() => void lookup(sku)}>
        go
      </button>
      <span data-testid="error">{error ?? ''}</span>
    </div>
  )
}

function renderAndLookup(sku: string) {
  const utils = render(
    <MemoryRouter>
      <Harness sku={sku} />
    </MemoryRouter>,
  )
  utils.getByText('go').click()
  return utils
}

describe('useSkuLookup', () => {
  beforeEach(() => {
    navigate.mockClear()
  })

  it('navigates to the product when the SKU exists', async () => {
    vi.spyOn(products, 'getBySku').mockResolvedValue({
      id: 'abc-123',
      name: 'Milk 1L',
      description: null,
      price: 6.5,
      sku: '7290000066318',
      createdAt: '',
      updatedAt: '',
    })

    renderAndLookup('7290000066318')
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/products/abc-123'))
  })

  it('routes an unknown SKU to a prefilled create form', async () => {
    vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'Not Found', ''))

    renderAndLookup('7290000012345')
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/create', {
        state: { prefillSku: '7290000012345', autoFill: true },
      }),
    )
  })

  it('surfaces a server error instead of routing to create', async () => {
    // A 500 must not be mistaken for "product does not exist".
    vi.spyOn(products, 'getBySku').mockRejectedValue(
      new ApiError(500, 'Internal Server Error', 'boom'),
    )

    const { getByTestId } = renderAndLookup('7290000012345')
    await waitFor(() => expect(getByTestId('error')).not.toBeEmptyDOMElement())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ignores an empty or whitespace-only scan', async () => {
    const getBySku = vi.spyOn(products, 'getBySku')
    renderAndLookup('   ')
    await waitFor(() => expect(getBySku).not.toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('trims surrounding whitespace before looking up', async () => {
    const getBySku = vi.spyOn(products, 'getBySku').mockRejectedValue(new ApiError(404, 'x', ''))
    renderAndLookup('  7290000066318 ')
    await waitFor(() => expect(getBySku).toHaveBeenCalledWith('7290000066318', expect.anything()))
  })
})
