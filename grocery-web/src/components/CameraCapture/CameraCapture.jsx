import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Full-screen-ish camera modal.
 *
 * Props:
 * - isOpen: whether to show the modal.
 * - onCapture(file, objectUrl): called when user captures an image.
 * - onClose(): called when modal should close.
 */
export default function CameraCapture({ isOpen, onCapture, onClose }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStream, setHasStream] = useState(false);

  async function startCamera() {
    if (!isOpen || hasStream || isStarting) return;
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setHasStream(true);
    } catch (err) {
      alert(t('createPage.cameraError'));
      handleClose();
    } finally {
      setIsStarting(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setHasStream(false);
  }

  function handleClose() {
    stopCamera();
    onClose?.();
  }

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function handleCapture() {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
        onCapture?.(file, objectUrl);
        handleClose(); // close camera after capture
      },
      'image/jpeg',
      0.9
    );
  }

  if (!isOpen) return null;

  return (
    <Modal show={isOpen} onHide={handleClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{t('createPage.cameraCaptureTitle')}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-light">
        <div className="mb-2 small">
          {isStarting && t('createPage.startingCamera')}
        </div>
        <div className="ratio ratio-4x3 bg-black rounded overflow-hidden mb-3">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            playsInline
            muted
          />
        </div>
        <div className="d-flex justify-content-center gap-3">
          <Button
            variant="light"
            onClick={handleCapture}
            disabled={!hasStream}
          >
            {t('createPage.capturePhoto')}
          </Button>
          <Button variant="outline-light" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}


