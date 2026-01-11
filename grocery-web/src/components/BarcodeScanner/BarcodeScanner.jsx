import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useLanguage } from '../../contexts/LanguageContext';

export default function BarcodeScanner({ isOpen, onScan, onClose }) {
  const { t } = useLanguage();
  const scannerIdRef = useRef(`scanner-${Math.random().toString(36).substring(7)}`);
  const html5QrcodeRef = useRef(null);
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Store translation function refs to avoid dependency issues
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Cleanup function
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

  useEffect(() => {
    if (!isOpen) {
      // Clean up scanner when closed
      stopScanner();
      setError(null);
      setIsScanning(false);
      return;
    }

    // Initialize scanner when opened
    if (!html5QrcodeRef.current && !isScanning) {
      // Wait a bit to ensure DOM is ready, especially on mobile
      const initTimeout = setTimeout(async () => {
        // Check if element exists
        const element = document.getElementById(scannerIdRef.current);
        if (!element) {
          console.error('Scanner container element not found');
          setError(tRef.current('browsePage.cameraError'));
          return;
        }

        try {
          const html5Qrcode = new Html5Qrcode(scannerIdRef.current);
          html5QrcodeRef.current = html5Qrcode;

          // Camera configuration - prefer back camera for barcode scanning
          // Try environment (back camera) first, fallback to any available camera
          const cameraConfig = { facingMode: "environment" };

          const config = {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // Responsive qrbox size
              const minEdgePercentage = 0.7;
              const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
              return {
                width: qrboxSize,
                height: qrboxSize
              };
            },
            aspectRatio: 1.0,
          };

          setIsScanning(true);
          setError(null);

          await html5Qrcode.start(
            cameraConfig,
            config,
            (decodedText, decodedResult) => {
              // Successfully scanned
              onScan(decodedText);
              stopScanner();
              onClose();
            },
            (errorMessage) => {
              // Scanning error (ignore, scanner will keep trying)
              // Only show error if it's a permission or access issue
              if (errorMessage.includes('Permission') || 
                  errorMessage.includes('NotAllowedError') ||
                  errorMessage.includes('Permission denied') ||
                  errorMessage.toLowerCase().includes('permission')) {
                setError(tRef.current('browsePage.cameraPermissionDenied'));
                setIsScanning(false);
              } else if (errorMessage.includes('NotFoundError') || 
                         errorMessage.includes('DevicesNotFoundError') ||
                         errorMessage.includes('No camera found')) {
                setError(tRef.current('browsePage.cameraNotFound'));
                setIsScanning(false);
              } else if (errorMessage.includes('NotReadableError') ||
                         errorMessage.includes('in use')) {
                setError(tRef.current('browsePage.cameraInUse'));
                setIsScanning(false);
              }
              // Other errors (like "No QR code found") are normal and should be ignored
            }
          );
        } catch (err) {
          console.error('Error initializing scanner:', err);
          setIsScanning(false);
          if (err.message && (
            err.message.includes('Permission') || 
            err.message.includes('NotAllowedError')
          )) {
            setError(tRef.current('browsePage.cameraPermissionDenied'));
          } else if (err.message && err.message.includes('NotFoundError')) {
            setError(tRef.current('browsePage.cameraNotFound'));
          } else {
            setError(tRef.current('browsePage.cameraError'));
          }
        }
      }, 100); // Small delay to ensure DOM is ready

      // Cleanup timeout and scanner on unmount
      return () => {
        clearTimeout(initTimeout);
        stopScanner();
      };
    }
  }, [isOpen, onScan, onClose, isScanning]);

  if (!isOpen) {
    return null;
  }

  const modalBackdropStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1000,
  };

  const modalCardStyle = {
    background: '#222',
    color: '#fff',
    padding: 16,
    borderRadius: 8,
    maxWidth: '90%',
    width: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  };

  const scannerContainerStyle = {
    width: '100%',
    minHeight: '300px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  };

  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t('browsePage.scanBarcode')}</h3>
          <button
            onClick={onClose}
            style={{
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            {t('common.close')}
          </button>
        </div>
        {!isScanning && !error && (
          <div style={{ color: '#ffd93d', marginBottom: 16, padding: 12, background: '#3a3a1f', borderRadius: 4 }}>
            {t('browsePage.startingCamera')}
          </div>
        )}
        {error && (
          <div style={{ color: '#ff6b6b', marginBottom: 16, padding: 12, background: '#3a1f1f', borderRadius: 4 }}>
            <div style={{ marginBottom: 8 }}>{error}</div>
            <div style={{ fontSize: '0.9em', marginTop: 8 }}>
              {t('browsePage.cameraPermissionHelp')}
            </div>
          </div>
        )}
        <div style={scannerContainerStyle}>
          <div id={scannerIdRef.current} style={{ width: '100%', minHeight: '300px' }} />
        </div>
      </div>
    </div>
  );
}

