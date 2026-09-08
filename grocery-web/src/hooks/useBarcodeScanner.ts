import { useCallback, useEffect, useRef, useState } from 'react'
// Self-hosted WASM. Fetching this from a CDN at runtime would make scanning --
// the app's core function -- depend on internet access from the shop floor.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export type BarcodeFormat =
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'code_128'
  | 'code_39'
  | 'itf'
  | 'databar'
  | 'databar_expanded'

/**
 * Linear retail symbologies only. Deliberately excludes QR and the other 2D
 * matrix formats: matrix detection is the expensive part of a decode pass, and
 * a grocery product will never carry one as its SKU.
 */
export const RETAIL_FORMATS: BarcodeFormat[] = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'itf',
  'code_39',
  'databar',
  'databar_expanded',
]

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error'

export type ScannerErrorKind =
  | 'insecure-context'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-in-use'
  | 'unsupported'
  | 'unknown'

export interface ScannerError {
  kind: ScannerErrorKind
  detail?: string
}

export interface CameraOption {
  deviceId: string
  label: string
}

/** Fraction of the video frame that is decoded, matching the on-screen guide. */
export const ROI = { width: 0.92, height: 0.42 }

interface DetectedBarcode {
  rawValue: string
  format: string
}

interface Detector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface NativeDetectorCtor {
  new (options?: { formats?: string[] }): Detector
  getSupportedFormats?: () => Promise<readonly string[]>
}

/**
 * Resolve a barcode detector, preferring the browser's native implementation.
 *
 * Android Chrome ships a hardware-accelerated `BarcodeDetector`; using it means
 * the ~1MB WASM chunk is never even downloaded there. WebKit still does not
 * implement the Shape Detection API, so every iOS browser takes the WASM path.
 */
async function loadDetector(
  formats: BarcodeFormat[],
): Promise<{ detector: Detector; engine: 'native' | 'wasm' }> {
  const Native = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor })
    .BarcodeDetector

  if (Native?.getSupportedFormats) {
    try {
      const supported = await Native.getSupportedFormats()
      // Only trust the native path if it covers the formats we actually need --
      // notably EAN-13. It does not support the DataBar family, so those are
      // silently dropped rather than failing construction.
      const usable = formats.filter((f) => supported.includes(f))
      if (usable.includes('ean_13')) {
        return { detector: new Native({ formats: usable }), engine: 'native' }
      }
    } catch {
      // Fall through to WASM.
    }
  }

  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
  })
  return {
    detector: new BarcodeDetector({ formats: formats as never }) as Detector,
    engine: 'wasm',
  }
}

/**
 * Score a camera by how suitable it is for scanning a barcode held ~20cm away.
 * Higher is better; negative means unusable.
 *
 * This matters more than it sounds: on multi-lens Android phones a bare
 * `facingMode: 'environment'` request regularly resolves to the ultrawide,
 * which physically cannot focus at that distance. That single detail is a
 * common cause of "it scans on iPhone but not on Android".
 */
function scoreCamera(label: string): number {
  const l = label.toLowerCase()
  if (/depth|mono|infrared|ir\b/.test(l)) return -1
  if (/front|user|facetime/.test(l)) return -1
  if (/ultra/.test(l)) return -1
  if (/telephoto|tele\b/.test(l)) return 0
  // iOS names the plain rear lens exactly "Back Camera"; the multi-lens virtual
  // devices are "Back Dual Wide Camera", "Back Triple Camera", etc. The plain
  // one autofocuses closest.
  if (/^back camera$/.test(l)) return 10
  if (/back|rear|environment/.test(l)) return 5
  return 1
}

function classifyError(err: unknown): ScannerError {
  const name = (err as { name?: string } | undefined)?.name ?? ''
  const message = err instanceof Error ? err.message : String(err ?? '')

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { kind: 'permission-denied', detail: message }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { kind: 'no-camera', detail: message }
    case 'NotReadableError':
    case 'AbortError':
      return { kind: 'camera-in-use', detail: message }
    default:
      return { kind: 'unknown', detail: message }
  }
}

/**
 * Decode a barcode from a still image, at the image's full resolution.
 *
 * Paired with `capture="environment"` on a file input this is often the most
 * reliable path of all on a phone: the native camera app brings real autofocus,
 * tap-to-focus and full sensor resolution, and we decode the result here rather
 * than a downscaled preview frame.
 */
export async function detectBarcodeFromImageFile(
  file: File,
  formats: BarcodeFormat[] = RETAIL_FORMATS,
): Promise<{ value: string; format: string } | null> {
  const { detector } = await loadDetector(formats)
  const bitmap = await createImageBitmap(file)
  try {
    const results = await detector.detect(bitmap)
    const hit = results.find((r) => r.rawValue?.trim())
    return hit ? { value: hit.rawValue.trim(), format: hit.format } : null
  } finally {
    bitmap.close()
  }
}

export interface UseBarcodeScannerOptions {
  /** Start the camera when true; fully release it when false. */
  active: boolean
  /** Called once per accepted decode, with the symbology that produced it. */
  onScan: (value: string, format: string) => void
  formats?: BarcodeFormat[]
  /** Minimum ms between decode attempts. Frames arrive faster than we need. */
  decodeIntervalMs?: number
}

export interface UseBarcodeScannerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: ScannerStatus
  error: ScannerError | null
  engine: 'native' | 'wasm' | null
  cameras: CameraOption[]
  activeCameraId: string | null
  selectCamera: (deviceId: string) => void
  torchSupported: boolean
  torchOn: boolean
  toggleTorch: () => void
  retry: () => void
  /** Restart decoding after a hit, without restarting the camera. */
  resume: () => void
}

export function useBarcodeScanner({
  active,
  onScan,
  formats = RETAIL_FORMATS,
  decodeIntervalMs = 80,
}: UseBarcodeScannerOptions): UseBarcodeScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [error, setError] = useState<ScannerError | null>(null)
  const [engine, setEngine] = useState<'native' | 'wasm' | null>(null)
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Preferred device and the scan callback are held in refs so that changing
  // them never restarts the camera mid-scan.
  const preferredCameraRef = useRef<string | null>(null)
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<Detector | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameHandleRef = useRef<number | null>(null)
  const rafHandleRef = useRef<number | null>(null)
  const decodingRef = useRef(false)
  const lastDecodeRef = useRef(0)
  const doneRef = useRef(false)
  // Lets resume() restart the decode loop without tearing the camera down
  // and back up, which would cost about a second per rescan.
  const scheduleRef = useRef<(() => void) | null>(null)

  /**
   * Invalidates in-flight async work. Every `await` in the start path is
   * followed by a generation check, so a `getUserMedia` promise that resolves
   * after teardown releases its stream instead of leaking it -- the exact bug
   * that left the camera indicator lit in the previous implementation.
   *
   * This is a ref, not state, because React 19 StrictMode runs
   * effect -> cleanup -> effect synchronously within a single commit; a
   * state-based guard would still read its pre-cleanup value in the second run.
   */
  const generationRef = useRef(0)

  const stopTracks = useCallback(() => {
    if (frameHandleRef.current !== null) {
      videoRef.current?.cancelVideoFrameCallback?.(frameHandleRef.current)
      frameHandleRef.current = null
    }
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current)
      rafHandleRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
    detectorRef.current = null
    decodingRef.current = false
    doneRef.current = false
    setTorchOn(false)
    setTorchSupported(false)
  }, [])

  useEffect(() => {
    if (!active) {
      generationRef.current += 1
      stopTracks()
      setStatus('idle')
      setError(null)
      setEngine(null)
      return
    }

    const generation = ++generationRef.current
    const isStale = () => generation !== generationRef.current

    setStatus('starting')
    setError(null)

    // A LAN IP over plain HTTP is not a secure context, so `mediaDevices` is
    // undefined. Reported distinctly, because telling the user to check camera
    // permissions here sends them somewhere that cannot help.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError({ kind: 'insecure-context' })
      return
    }

    let cancelled = false

    const start = async () => {
      try {
        const detectorPromise = loadDetector(formats)

        const preferred = preferredCameraRef.current
        const constraints: MediaStreamConstraints = {
          video: preferred
            ? { deviceId: { exact: preferred } }
            : {
                facingMode: { ideal: 'environment' },
                // Resolution is the single biggest lever on 1D decode success:
                // an EAN-13 is 95 modules wide and needs several pixels each.
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
          audio: false,
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (isStale() || cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream

        const track = stream.getVideoTracks()[0]

        // Device labels are empty until permission is granted, so enumerate
        // only now that we have a stream.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (isStale() || cancelled) return
          const videoInputs = devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
          setCameras(videoInputs)
          setActiveCameraId(track.getSettings().deviceId ?? null)

          // If the browser handed us a lens that focuses poorly at scanning
          // distance and a better one exists, switch to it once.
          if (!preferred && videoInputs.length > 1) {
            const current = track.getSettings().deviceId
            const best = videoInputs
              .map((c) => ({ ...c, score: scoreCamera(c.label) }))
              .filter((c) => c.score >= 0)
              .sort((a, b) => b.score - a.score)[0]
            if (best && best.deviceId !== current && scoreCamera(track.label) < best.score) {
              preferredCameraRef.current = best.deviceId
              setAttempt((n) => n + 1)
              return
            }
          }
        } catch {
          // Enumeration is a nicety; scanning works without it.
        }

        // Continuous autofocus, applied separately so that a rejection here
        // never fails the whole start path.
        try {
          const caps = track.getCapabilities?.() as MediaTrackCapabilities | undefined
          if (caps?.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
          }
          setTorchSupported(Boolean(caps?.torch))
        } catch {
          // Non-fatal.
        }

        const video = videoRef.current
        if (!video || isStale() || cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        video.muted = true
        await video.play().catch(() => {
          /* Autoplay rejection is recoverable; the frame loop still runs. */
        })
        if (isStale() || cancelled) return

        const { detector, engine: resolvedEngine } = await detectorPromise
        if (isStale() || cancelled) return
        detectorRef.current = detector
        setEngine(resolvedEngine)
        setStatus('scanning')

        scheduleFrame()
      } catch (err) {
        if (isStale() || cancelled) return
        setStatus('error')
        setError(classifyError(err))
        stopTracks()
      }
    }

    const scheduleFrame = () => {
      scheduleRef.current = scheduleFrame
      const video = videoRef.current
      if (!video || isStale()) return

      if (video.requestVideoFrameCallback) {
        frameHandleRef.current = video.requestVideoFrameCallback(() => {
          void onFrame()
        })
      } else {
        rafHandleRef.current = requestAnimationFrame(() => {
          void onFrame()
        })
      }
    }

    const onFrame = async () => {
      if (isStale() || doneRef.current) return

      const video = videoRef.current
      const detector = detectorRef.current
      if (!video || !detector || video.readyState < 2) {
        scheduleFrame()
        return
      }

      const now = performance.now()
      if (decodingRef.current || now - lastDecodeRef.current < decodeIntervalMs) {
        scheduleFrame()
        return
      }

      decodingRef.current = true
      lastDecodeRef.current = now

      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!vw || !vh) return

        // Crop to the aiming band at NATIVE resolution -- source and
        // destination rects are the same size, so no downsampling happens.
        // This is the key difference from the previous implementation, which
        // handed the decoder a ~297x198 canvas regardless of sensor output.
        const sw = Math.round(vw * ROI.width)
        const sh = Math.round(vh * ROI.height)
        const sx = Math.round((vw - sw) / 2)
        const sy = Math.round((vh - sh) / 2)

        let canvas = canvasRef.current
        if (!canvas) {
          canvas = document.createElement('canvas')
          canvasRef.current = canvas
        }
        if (canvas.width !== sw || canvas.height !== sh) {
          canvas.width = sw
          canvas.height = sh
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)

        const results = await detector.detect(canvas)
        if (isStale() || doneRef.current) return

        const hit = results.find((r) => r.rawValue?.trim())
        if (hit) {
          doneRef.current = true
          onScanRef.current(hit.rawValue.trim(), hit.format)
          return
        }
      } catch {
        // A single failed decode is normal and expected between reads.
      } finally {
        decodingRef.current = false
        if (!doneRef.current && !isStale()) scheduleFrame()
      }
    }

    void start()

    // iOS suspends the capture track when the tab is backgrounded and does not
    // always resume it, leaving a live-looking but frozen preview. Restart.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !isStale()) {
        setAttempt((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      generationRef.current += 1
      document.removeEventListener('visibilitychange', onVisibility)
      stopTracks()
    }
    // `formats` is a stable module constant by default; `attempt` is the
    // explicit restart signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attempt, decodeIntervalMs, stopTracks])

  const selectCamera = useCallback((deviceId: string) => {
    preferredCameraRef.current = deviceId
    setAttempt((n) => n + 1)
  }, [])

  const resume = useCallback(() => {
    doneRef.current = false
    scheduleRef.current?.()
  }, [])

  const retry = useCallback(() => {
    preferredCameraRef.current = null
    setAttempt((n) => n + 1)
  }, [])

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    track
      .applyConstraints({ advanced: [{ torch: next }] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false))
  }, [torchOn])

  return {
    videoRef,
    status,
    error,
    engine,
    cameras,
    activeCameraId,
    selectCamera,
    torchSupported,
    torchOn,
    toggleTorch,
    retry,
    resume,
  }
}
