import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Button, Spinner, Form } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  ROI,
  detectBarcodeFromImageFile,
  useBarcodeScanner,
  type ScannerError,
} from '../../hooks/useBarcodeScanner'
import './BarcodeScanner.css'

export interface BarcodeScannerProps {
  isOpen: boolean
  onScan: (value: string) => void
  onClose: () => void
}

/** Maps a scanner error to a translation key plus whether retrying can help. */
function errorContent(error: ScannerError): { key: string; retryable: boolean } {
  switch (error.kind) {
    case 'insecure-context':
      return { key: 'browsePage.requiresHttps', retryable: false }
    case 'permission-denied':
      return { key: 'browsePage.cameraPermissionDenied', retryable: true }
    case 'no-camera':
      return { key: 'browsePage.cameraNotFound', retryable: false }
    case 'camera-in-use':
      return { key: 'browsePage.cameraInUse', retryable: true }
    default:
      return { key: 'browsePage.cameraError', retryable: true }
  }
}

export default function BarcodeScanner({ isOpen, onScan, onClose }: BarcodeScannerProps) {
  const { t } = useLanguage()
  const [aspect, setAspect] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleScan = useCallback(
    (value: string) => {
      // Short haptic + the sheet closing are the only success feedback a user
      // gets while holding a phone at arm's length in a noisy shop.
      navigator.vibrate?.(60)
      onScan(value)
      onClose()
    },
    [onScan, onClose],
  )

  const {
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
  } = useBarcodeScanner({ active: isOpen, onScan: handleScan })

  useEffect(() => {
    if (!isOpen) {
      setAspect(null)
      setUploadError(null)
      setUploadBusy(false)
    }
  }, [isOpen])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadBusy(true)
    setUploadError(null)
    try {
      const value = await detectBarcodeFromImageFile(file)
      if (value) {
        handleScan(value)
      } else {
        setUploadError(t('browsePage.noBarcodeFound'))
      }
    } catch {
      setUploadError(t('browsePage.noBarcodeFound'))
    } finally {
      setUploadBusy(false)
    }
  }

  const rearCameras = cameras.filter((c) => !/front|user|facetime/i.test(c.label))
  const errorInfo = error ? errorContent(error) : null

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      fullscreen="md-down"
      size="lg"
      backdrop="static"
      contentClassName="barcode-scanner"
    >
      <Modal.Header className="barcode-scanner__header">
        <Modal.Title as="h2" className="barcode-scanner__title">
          {t('browsePage.scanBarcode')}
        </Modal.Title>
        <Button
          variant="outline-light"
          className="barcode-scanner__close"
          aria-label={t('common.close')}
          onClick={onClose}
        >
          ✕
        </Button>
      </Modal.Header>

      <Modal.Body className="barcode-scanner__body">
        <div className="barcode-scanner__stage">
          {/* The wrapper takes the video's own aspect ratio so the video fills
              it exactly. That keeps the aiming band a true 1:1 preview of the
              region actually being decoded. */}
          <div
            className="barcode-scanner__viewport"
            style={aspect ? { aspectRatio: String(aspect) } : undefined}
          >
            <video
              ref={videoRef}
              className="barcode-scanner__video"
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
              }}
            />
            <div
              className="barcode-scanner__reticle"
              style={{ width: `${ROI.width * 100}%`, height: `${ROI.height * 100}%` }}
              aria-hidden="true"
            >
              <span className="barcode-scanner__laser" />
            </div>
          </div>

          {status === 'starting' && (
            <div className="barcode-scanner__overlay" role="status">
              <Spinner animation="border" variant="light" />
              <p className="mb-0 mt-3">{t('browsePage.startingCamera')}</p>
            </div>
          )}

          {status === 'error' && errorInfo && (
            <div className="barcode-scanner__overlay barcode-scanner__overlay--error" role="alert">
              <p className="fw-semibold mb-2">{t(errorInfo.key)}</p>
              {error?.kind === 'permission-denied' && (
                <p className="small text-white-50 mb-3">{t('browsePage.cameraPermissionHelp')}</p>
              )}
              {errorInfo.retryable && (
                <Button variant="light" onClick={retry}>
                  {t('browsePage.tryAgain')}
                </Button>
              )}
            </div>
          )}
        </div>

        <p className="barcode-scanner__hint">{t('browsePage.pointAtBarcode')}</p>

        <div className="barcode-scanner__controls">
          {torchSupported && (
            <Button
              variant={torchOn ? 'warning' : 'outline-light'}
              className="barcode-scanner__control"
              onClick={toggleTorch}
              aria-pressed={torchOn}
            >
              <span aria-hidden="true">🔦</span> {t('browsePage.torch')}
            </Button>
          )}

          <Button
            variant="outline-light"
            className="barcode-scanner__control"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadBusy}
          >
            {uploadBusy ? (
              <>
                <Spinner animation="border" size="sm" /> {t('browsePage.scanning')}
              </>
            ) : (
              <>
                <span aria-hidden="true">📸</span> {t('browsePage.takePhotoInstead')}
              </>
            )}
          </Button>
        </div>

        {rearCameras.length > 1 && (
          <Form.Group className="barcode-scanner__cameras">
            <Form.Label htmlFor="barcode-scanner-camera" className="visually-hidden">
              {t('browsePage.switchCamera')}
            </Form.Label>
            <Form.Select
              id="barcode-scanner-camera"
              value={activeCameraId ?? ''}
              onChange={(e) => selectCamera(e.target.value)}
            >
              {rearCameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}

        {uploadError && (
          <div className="alert alert-warning mt-3 mb-0" role="alert">
            {uploadError}
          </div>
        )}

        {/* `capture="environment"` opens the native camera app, which gives real
            autofocus and full sensor resolution -- the best fallback when the
            live preview struggles with a damaged or glossy barcode. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="d-none"
          onChange={handleFileChange}
        />

        {import.meta.env.DEV && engine && (
          <p className="barcode-scanner__debug">engine: {engine}</p>
        )}
      </Modal.Body>
    </Modal>
  )
}
