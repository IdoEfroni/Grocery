import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useSkuLookup } from './useSkuLookup'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

function Harness({ sku }: { sku: string }) {
  const { lookup } = useSkuLookup()
  return (
    <button type="button" onClick={() => lookup(sku)}>
      go
    </button>
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
  beforeEach(() => navigate.mockClear())

  it('routes a scanned barcode to the lookup screen', () => {
    renderAndLookup('7290000066318')
    expect(navigate).toHaveBeenCalledWith('/lookup/7290000066318')
  })

  it('trims surrounding whitespace', () => {
    renderAndLookup('  7290000066318 ')
    expect(navigate).toHaveBeenCalledWith('/lookup/7290000066318')
  })

  it('ignores an empty or whitespace-only scan', () => {
    renderAndLookup('   ')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('encodes characters that would otherwise break the URL', () => {
    // Some symbologies (CODE_128 in particular) can carry '/' and '#', which
    // would silently split the route.
    renderAndLookup('AB/12#34')
    expect(navigate).toHaveBeenCalledWith('/lookup/AB%2F12%2334')
  })
})
