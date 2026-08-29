import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useEffect } from 'react'
import { useBarcodeScanner } from './useBarcodeScanner'

/** A track that records whether it was stopped, so leaks are observable. */
function createTrack() {
  return {
    stopped: false,
    label: 'Back Camera',
    kind: 'video',
    stop() {
      this.stopped = true
    },
    getSettings: () => ({ deviceId: 'cam-1' }),
    getCapabilities: () => ({ torch: false, focusMode: ['continuous'] }),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  }
}

let tracks: ReturnType<typeof createTrack>[] = []

function createStream() {
  const track = createTrack()
  tracks.push(track)
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
}

let detectResult: { rawValue: string; format: string }[] = []

class FakeBarcodeDetector {
  static getSupportedFormats = vi.fn().mockResolvedValue(['ean_13', 'ean_8', 'upc_a', 'code_128'])
  detect = vi.fn(async () => detectResult)
}

function Harness({ active, onScan }: { active: boolean; onScan: (v: string) => void }) {
  const { videoRef, status } = useBarcodeScanner({ active, onScan })

  // jsdom videos never report dimensions or readyState on their own.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true })
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true })
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
  })

  return (
    <div>
      <span data-testid="status">{status}</span>
      {active && <video ref={videoRef} />}
    </div>
  )
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    tracks = []
    detectResult = []

    vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector)
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => createStream()),
        enumerateDevices: vi.fn(async () => [
          { kind: 'videoinput', deviceId: 'cam-1', label: 'Back Camera' },
        ]),
      },
    })

    // requestVideoFrameCallback is absent in jsdom; the hook falls back to rAF.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number
    })

    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({ drawImage: vi.fn() }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts the camera and reaches scanning state', async () => {
    const { getByTestId } = render(<Harness active onScan={vi.fn()} />)
    await waitFor(() => expect(getByTestId('status')).toHaveTextContent('scanning'))
  })

  it('reports insecure context distinctly rather than as a camera error', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const { getByTestId } = render(<Harness active onScan={vi.fn()} />)
    await waitFor(() => expect(getByTestId('status')).toHaveTextContent('error'))
  })

  it('stops every camera track when deactivated', async () => {
    const { getByTestId, rerender } = render(<Harness active onScan={vi.fn()} />)
    await waitFor(() => expect(getByTestId('status')).toHaveTextContent('scanning'))

    rerender(<Harness active={false} onScan={vi.fn()} />)

    await waitFor(() => {
      expect(tracks.length).toBeGreaterThan(0)
      expect(tracks.every((t) => t.stopped)).toBe(true)
    })
  })

  it('releases the stream when closed before getUserMedia resolves', async () => {
    // The leak that left the camera indicator lit: the modal is dismissed while
    // the permission prompt is still open, then permission is granted.
    let release: ((stream: MediaStream) => void) | undefined
    const pending = new Promise<MediaStream>((resolve) => {
      release = resolve
    })
    navigator.mediaDevices.getUserMedia = vi.fn(() => pending)

    const { rerender } = render(<Harness active onScan={vi.fn()} />)
    rerender(<Harness active={false} onScan={vi.fn()} />)

    await act(async () => {
      release!(createStream())
      await pending
    })

    await waitFor(() => expect(tracks.every((t) => t.stopped)).toBe(true))
  })

  it('scans, closes, and scans again on reopen', async () => {
    // The regression in the previous implementation: stopScanner() threw on
    // close, so the second open never worked.
    const onScan = vi.fn()
    detectResult = [{ rawValue: '7290000066318', format: 'ean_13' }]

    const { getByTestId, rerender } = render(<Harness active onScan={onScan} />)
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('7290000066318'))

    rerender(<Harness active={false} onScan={onScan} />)
    await waitFor(() => expect(getByTestId('status')).toHaveTextContent('idle'))

    onScan.mockClear()
    detectResult = [{ rawValue: '7290000012345', format: 'ean_13' }]

    rerender(<Harness active onScan={onScan} />)
    await waitFor(() => expect(getByTestId('status')).toHaveTextContent('scanning'))
    await waitFor(() => expect(onScan).toHaveBeenCalledWith('7290000012345'))
  })

  it('reports a scan only once per activation', async () => {
    const onScan = vi.fn()
    detectResult = [{ rawValue: '7290000066318', format: 'ean_13' }]

    render(<Harness active onScan={onScan} />)
    await waitFor(() => expect(onScan).toHaveBeenCalled())

    // Let several more frames elapse; the hook must not re-report.
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(onScan).toHaveBeenCalledTimes(1)
  })
})
