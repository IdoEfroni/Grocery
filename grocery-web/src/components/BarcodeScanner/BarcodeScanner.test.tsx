import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '../../contexts/LanguageContext'
import BarcodeScanner from './BarcodeScanner'

const scanned = vi.fn()
const resume = vi.fn()
let onScanCb: ((v: string, f: string) => void) | null = null

vi.mock('../../hooks/useBarcodeScanner', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useBarcodeScanner')>(
    '../../hooks/useBarcodeScanner',
  )
  return {
    ...actual,
    useBarcodeScanner: (opts: { onScan: (v: string, f: string) => void }) => {
      onScanCb = opts.onScan
      return {
        videoRef: { current: null },
        status: 'scanning',
        error: null,
        engine: 'wasm',
        cameras: [],
        activeCameraId: null,
        selectCamera: vi.fn(),
        torchSupported: false,
        torchOn: false,
        toggleTorch: vi.fn(),
        retry: vi.fn(),
        resume,
      }
    },
  }
})

function setup() {
  render(
    <LanguageProvider>
      <BarcodeScanner isOpen onScan={scanned} onClose={vi.fn()} />
    </LanguageProvider>,
  )
}

describe('BarcodeScanner confirmation step', () => {
  beforeEach(() => {
    localStorage.setItem('grocery-language', 'en')
    scanned.mockClear()
    resume.mockClear()
    onScanCb = null
  })

  it('does not act on a decode until it is confirmed', async () => {
    setup()
    await waitFor(() => expect(onScanCb).toBeTruthy())

    onScanCb!('7290000066318', 'ean_13')

    // The decoded value is shown for checking; nothing is committed yet.
    expect(await screen.findByText(/729 000 006 631 8/)).toBeInTheDocument()
    expect(scanned).not.toHaveBeenCalled()
  })

  it('commits the barcode only when the user confirms', async () => {
    setup()
    await waitFor(() => expect(onScanCb).toBeTruthy())
    onScanCb!('7290000066318', 'ean_13')

    await userEvent.click(await screen.findByRole('button', { name: /use this barcode/i }))
    expect(scanned).toHaveBeenCalledWith('7290000066318')
  })

  it('discards a suspect read and resumes scanning', async () => {
    setup()
    await waitFor(() => expect(onScanCb).toBeTruthy())
    onScanCb!('7290000066318', 'ean_13')

    await userEvent.click(await screen.findByRole('button', { name: /scan again/i }))

    expect(scanned).not.toHaveBeenCalled()
    expect(resume).toHaveBeenCalled()
    expect(screen.queryByText(/729 000 006 631 8/)).not.toBeInTheDocument()
  })

  it('flags symbologies that carry no check digit', async () => {
    setup()
    await waitFor(() => expect(onScanCb).toBeTruthy())
    // ITF has no check digit, so a corrupt read can decode "successfully".
    onScanCb!('12345678', 'itf')

    expect(await screen.findByText(/no check digit/i)).toBeInTheDocument()
  })

  it('does not flag EAN, which the decoder checksum-verifies', async () => {
    setup()
    await waitFor(() => expect(onScanCb).toBeTruthy())
    onScanCb!('7290000066318', 'ean_13')

    await screen.findByText(/EAN-13/)
    expect(screen.queryByText(/no check digit/i)).not.toBeInTheDocument()
  })
})
