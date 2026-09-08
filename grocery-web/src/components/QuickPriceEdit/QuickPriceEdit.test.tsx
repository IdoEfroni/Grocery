import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '../../contexts/LanguageContext'
import QuickPriceEdit from './QuickPriceEdit'
import * as products from '../../api/products'

const PRODUCT: products.Product = {
  id: 'abc-123',
  name: 'Milk 1L',
  description: 'Tnuva 3%',
  price: 6.9,
  sku: '7290000066318',
  createdAt: '',
  updatedAt: '',
}

function setup(onSaved = vi.fn()) {
  render(
    <LanguageProvider>
      <QuickPriceEdit product={PRODUCT} isOpen onClose={vi.fn()} onSaved={onSaved} />
    </LanguageProvider>,
  )
  return { onSaved }
}

describe('QuickPriceEdit', () => {
  beforeEach(() => {
    localStorage.setItem('grocery-language', 'en')
  })

  it('prefills the current price', async () => {
    setup()
    const input = await screen.findByLabelText(/new price/i)
    expect(input).toHaveValue(6.9)
  })

  it('sends the new price while preserving the other fields', async () => {
    const update = vi.spyOn(products, 'updateProduct').mockResolvedValue({ ...PRODUCT, price: 7.5 })
    const { onSaved } = setup()

    const input = await screen.findByLabelText(/new price/i)
    await userEvent.clear(input)
    await userEvent.type(input, '7.5')
    await userEvent.click(screen.getByRole('button', { name: /save price/i }))

    await waitFor(() => expect(update).toHaveBeenCalled())

    // The API replaces the whole product on update, so name/sku/description
    // must be sent back unchanged or a price edit would wipe them.
    const [id, dto] = update.mock.calls[0]
    expect(id).toBe('abc-123')
    expect(dto).toMatchObject({
      name: 'Milk 1L',
      sku: '7290000066318',
      description: 'Tnuva 3%',
      price: 7.5,
    })
    // No photo fields: the API treats their absence as "leave the photo alone",
    // whereas sending empties would be a change.
    expect(dto.photoFile).toBeUndefined()
    expect(dto.photoUrl).toBeUndefined()

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...PRODUCT, price: 7.5 }))
  })

  it('rejects a negative price without calling the API', async () => {
    const update = vi.spyOn(products, 'updateProduct')
    setup()

    const input = await screen.findByLabelText(/new price/i)
    // Set directly rather than typing: a number input drops the leading "-"
    // while it is the only character, so character-by-character typing never
    // produces a negative value. The guard is still worth asserting -- it is
    // the backstop behind min={0}.
    fireEvent.change(input, { target: { value: '-3' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByText(/must be a number/i)).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('disables saving until the price actually changes', async () => {
    setup()
    await screen.findByLabelText(/new price/i)
    // Guards against a stray tap firing a pointless write during a price round.
    expect(screen.getByRole('button', { name: /save price/i })).toBeDisabled()
  })
})
