import { useEffect, useRef, useState, useId } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal, Button } from 'react-bootstrap';
import { useLanguage } from '../../contexts/LanguageContext';

export default function BarcodeScanner({ isOpen, onScan, onClose }) {
  const instanceId = useId().replace(/:/g, '-');
  const scannerContainerId = `barcode-scanner-container-${instanceId}`;
  const { t } = useLanguage();
  const html5QrcodeRef = useRef(null);
  const [mode, setMode] = useState('choose'); // 'choose' | 'camera' | 'upload'
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // { decodedText } or { error }
  const [isUploadScanning, setIsUploadScanning] = useState(false);
  const fileInputRef = useRef(null);
  const tRef = useRef(t);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopScanner = () => {
    if (html5QrcodeRef.current) {
      html5QrcodeRef.current.stop().catch((err) => {
        console.error('Error stopping scanner:', err);
      });
      html5QrcodeRef.current.clear().catch((err) => {
        console.error('Error clearing scanner:', err);
      });
      html5QrcodeRef.current = null;
    }
  };

  const stopScannerAsync = () => {
    const scanner = html5QrcodeRef.current;
    if (!scanner) return Promise.resolve();
    html5QrcodeRef.current = null;
    return Promise.resolve(scanner.stop())
      .catch((err) => console.error('Error stopping scanner:', err))
      .then(() => Promise.resolve(scanner.clear()))
      .catch((err) => console.error('Error clearing scanner:', err));
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setError(null);
      setIsScanning(false);
      setMode('choose');
      setUploadResult(null);
      setIsUploadScanning(false);
      return;
    }
  }, [isOpen]);

  // Camera mode: start camera when mode === 'camera'
  useEffect(() => {
    if (!isOpen || mode !== 'camera') return;

    const element = document.getElementById(scannerContainerId);
    if (!element) {
      setError(tRef.current('browsePage.cameraError'));
      return;
    }

    let mounted = true;
    const html5Qrcode = new Html5Qrcode(scannerContainerId);
    html5QrcodeRef.current = html5Qrcode;

    const cameraConfig = { facingMode: 'environment' };
    // Barcode-style viewfinder: wider rectangle (like reference site)
    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const height = Math.floor(minEdge * 0.6);
        const width = Math.floor(Math.min(viewfinderWidth * 0.9, height * 2.2));
        return { width, height };
      },
      aspectRatio: 1.0,
    };

    html5Qrcode
      .start(
        cameraConfig,
        config,
        (decodedText) => {
          if (!mounted) return;
          const text = decodedText;
          stopScannerAsync().then(() => {
            onScanRef.current?.(text);
            onCloseRef.current?.();
          });
        },
        (errorMessage) => {
          if (!mounted) return;
          if (
            errorMessage.includes('Permission') ||
            errorMessage.includes('NotAllowedError') ||
            errorMessage.toLowerCase().includes('permission')
          ) {
            setError(tRef.current('browsePage.cameraPermissionDenied'));
            setIsScanning(false);
          } else if (
            errorMessage.includes('NotFoundError') ||
            errorMessage.includes('DevicesNotFoundError') ||
            errorMessage.includes('No camera found')
          ) {
            setError(tRef.current('browsePage.cameraNotFound'));
            setIsScanning(false);
          } else if (
            errorMessage.includes('NotReadableError') ||
            errorMessage.includes('in use')
          ) {
            setError(tRef.current('browsePage.cameraInUse'));
            setIsScanning(false);
          }
        }
      )
      .then(() => {
        if (mounted) {
          setIsScanning(true);
          setError(null);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('Error initializing scanner:', err);
        setIsScanning(false);
        if (
          err.message &&
          (err.message.includes('Permission') || err.message.includes('NotAllowedError'))
        ) {
          setError(tRef.current('browsePage.cameraPermissionDenied'));
        } else if (err.message && err.message.includes('NotFoundError')) {
          setError(tRef.current('browsePage.cameraNotFound'));
        } else {
          setError(tRef.current('browsePage.cameraError'));
        }
      });

    return () => {
      mounted = false;
      stopScanner();
    };
  }, [isOpen, mode]);

  const handleBackToChoose = () => {
    stopScanner();
    setMode('choose');
    setError(null);
    setIsScanning(false);
    setUploadResult(null);
    setIsUploadScanning(false);
  };

  const handleOpenCamera = () => {
    setMode('camera');
    setError(null);
    setUploadResult(null);
  };

  const handleSwitchToUpload = () => {
    setMode('upload');
    setError(null);
    setUploadResult(null);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadResult(null);
    setIsUploadScanning(true);
    try {
      const html5Qrcode = new Html5Qrcode(scannerContainerId);
      html5QrcodeRef.current = html5Qrcode;
      const decodedText = await html5Qrcode.scanFile(file, false);
      html5Qrcode.clear();
      html5QrcodeRef.current = null;
      setUploadResult({ decodedText });
    } catch (err) {
      setUploadResult({ error: tRef.current('browsePage.noBarcodeFound') });
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.clear();
        html5QrcodeRef.current = null;
      }
    } finally {
      setIsUploadScanning(false);
    }
  };

  const handleUseScannedResult = () => {
    if (uploadResult?.decodedText) {
      onScan(uploadResult.decodedText);
      onClose();
    }
  };

  const handleResetUpload = () => {
    setUploadResult(null);
    fileInputRef.current?.click();
  };

  if (!isOpen) return null;

  return (
    <Modal show={isOpen} onHide={onClose} centered size="lg" backdrop="static" className="barcode-scanner-modal">
      <Modal.Header className="bg-dark text-light border-secondary">
        <Modal.Title className="d-flex align-items-center">
          <span className="me-2">📷</span>
          {t('browsePage.scanBarcode')}
        </Modal.Title>
        <Button variant="outline-light" size="sm" aria-label={t('common.close')} onClick={onClose}>
          ✕
        </Button>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light p-0">
        {mode === 'choose' && (
          <div className="p-4">
            <h6 className="text-muted text-uppercase small mb-3">{t('browsePage.chooseOption')}</h6>
            <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center">
              <Button
                variant="outline-primary"
                size="lg"
                className="d-flex align-items-center justify-content-center gap-2"
                onClick={handleOpenCamera}
              >
                <span>📷</span>
                {t('browsePage.openCamera')}
              </Button>
              <Button
                variant="outline-primary"
                size="lg"
                className="d-flex align-items-center justify-content-center gap-2"
                onClick={handleSwitchToUpload}
              >
                <span>🖼️</span>
                {t('browsePage.uploadImage')}
              </Button>
            </div>
          </div>
        )}

        {mode === 'camera' && (
          <div className="p-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <Button variant="outline-secondary" size="sm" onClick={handleBackToChoose}>
                ← {t('browsePage.closePreview')}
              </Button>
            </div>
            {!isScanning && !error && (
              <div className="alert alert-warning py-2 mb-2" role="status">
                {t('browsePage.startingCamera')}
              </div>
            )}
            {error && (
              <div className="alert alert-danger py-2 mb-2">
                <div>{error}</div>
                <small className="d-block mt-1">{t('browsePage.cameraPermissionHelp')}</small>
              </div>
            )}
            <div className="rounded overflow-hidden bg-black position-relative" style={{ minHeight: 280 }}>
              <div id={scannerContainerId} style={{ width: '100%', minHeight: 280 }} />
            </div>
          </div>
        )}

        {mode === 'upload' && (
          <div className="p-4">
            {/* Hidden container for file scan (html5-qrcode needs a target element) */}
            <div id={scannerContainerId} className="position-absolute" style={{ left: -9999, width: 1, height: 1 }} aria-hidden="true" />
            <Button variant="outline-secondary" size="sm" className="mb-3" onClick={handleBackToChoose}>
              ← {t('browsePage.closePreview')}
            </Button>
            <div className="border border-secondary rounded p-4 text-center mb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="d-none"
                onChange={handleFileChange}
              />
              <Button
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadScanning}
              >
                {isUploadScanning ? t('browsePage.scanning') : t('browsePage.browseUploadFile')}
              </Button>
            </div>
            {uploadResult?.decodedText && (
              <div className="mb-3">
                <h6 className="text-muted small">{t('browsePage.scannedOutput')}</h6>
                <p className="mb-2 fs-5">{uploadResult.decodedText}</p>
                <div className="d-flex gap-2">
                  <Button variant="success" onClick={handleUseScannedResult}>
                    {t('browsePage.useScannedResult')}
                  </Button>
                  <Button variant="outline-secondary" onClick={handleResetUpload}>
                    {t('common.reset')}
                  </Button>
                </div>
              </div>
            )}
            {uploadResult?.error && (
              <div className="alert alert-warning">
                {uploadResult.error}
                <Button variant="outline-warning" size="sm" className="mt-2" onClick={handleResetUpload}>
                  {t('browsePage.browseUploadFile')}
                </Button>
              </div>
            )}
            {!uploadResult && !isUploadScanning && (
              <p className="text-muted small mb-0">{t('browsePage.scanOrBrowsePreview')}</p>
            )}
          </div>
        )}

        <div className="p-3 bg-secondary bg-opacity-25 small text-muted text-center">
          *{t('browsePage.privacyProtected')}
        </div>
      </Modal.Body>
    </Modal>
  );
}
