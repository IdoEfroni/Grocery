import { useEffect, useRef, useState } from 'react'
import { Modal, Button, Spinner, Alert } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'

export interface CameraCaptureProps {
  isOpen: boolean
  onCapture: (file: File, objectUrl: string) => void
  onClose: () => void
}

/**
 * Camera modal for attaching a product photo.
 *
 * Shares the lifecycle discipline of `useBarcodeScanner`: a generation ref
 * invalidates work that resolves after teardown. The previous version guarded
 * with state (`hasStream` / `isStarting`), which React 19 StrictMode defeats --
 * it runs effect, cleanup and effect again synchronously in one commit, so the
 * second run still saw the pre-cleanup values, called getUserMedia twice, and
 * overwrote the first stream without stopping it. That left the camera
 * indicator lit until a page reload.
 */
export default function CameraCapture({ isOpen, onCapture, onClose }: CameraCaptureProps) {
  const { t } = useLanguage()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generationRef = useRef(0)

  const [isStarting, setIsStarting] = useState(false)
  const [hasStream, setHasStream] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      generationRef.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setHasStream(false)
      setIsStarting(false)
      setError(null)
      return
    }

    const generation = ++generationRef.current
    const isStale = () => generation !== generationRef.current

    setIsStarting(true)
    setError(null)

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(t('browsePage.requiresHttps'))
        setIsStarting(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            // Without a hint the browser picks its default, commonly 640x480 --
            // a poor product photo. Ask for something worth storing.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })

        // The modal may have closed while the permission prompt was open.
        if (isStale()) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {
            /* Autoplay rejection is recoverable. */
          })
        }
        if (isStale()) return
        setHasStream(true)
      } catch {
        if (isStale()) return
        setError(t('createPage.cameraError'))
      } finally {
        if (!isStale()) setIsStarting(false)
      }
    }

    void start()

    return () => {
      generationRef.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [isOpen, t])

  const handleCapture = () => {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const objectUrl = URL.createObjectURL(blob)
        const file = new File([blob], `camera-${Date.now()}.jpg`, {
          type: blob.type || 'image/jpeg',
        })
        // Ownership of objectUrl passes to the caller, which revokes it.
        onCapture(file, objectUrl)
        onClose()
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <Modal show={isOpen} onHide={onClose} centered size="lg" fullscreen="md-down" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {t('createPage.cameraCaptureTitle')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="ratio ratio-4x3 bg-black rounded overflow-hidden mb-3 position-relative">
          {/* A live camera preview carries no audio and nothing to caption. */}
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            playsInline
            muted
          />
          {isStarting && (
            <div className="d-flex flex-column align-items-center justify-content-center" role="status">
              <Spinner animation="border" variant="light" />
              <p className="mb-0 mt-2 small">{t('createPage.startingCamera')}</p>
            </div>
          )}
        </div>

        <div className="d-flex justify-content-center gap-3">
          <Button variant="light" onClick={handleCapture} disabled={!hasStream}>
            {t('createPage.capturePhoto')}
          </Button>
          <Button variant="outline-light" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  )
}
