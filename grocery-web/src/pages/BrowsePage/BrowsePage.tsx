import { useState } from 'react'
import { Button, Form, InputGroup, Spinner, Alert } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { useSkuLookup } from '../../hooks/useSkuLookup'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import './BrowsePage.css'

export default function BrowsePage() {
  const { t } = useLanguage()
  const [sku, setSku] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const { lookup, isLooking, error, clearError } = useSkuLookup()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void lookup(sku)
  }

  return (
    <div className="browse-page">
      <p className="text-muted text-center mb-4">{t('browsePage.scanOrEnterBarcode')}</p>

      {/* Scanning is the primary action, so it gets the primary affordance
          rather than an icon button tucked inside the search field. */}
      <Button
        variant="primary"
        size="lg"
        className="browse-page__scan"
        onClick={() => {
          clearError()
          setShowScanner(true)
        }}
        disabled={isLooking}
      >
        <span className="browse-page__scan-icon" aria-hidden="true">
          📷
        </span>
        {t('browsePage.scanBarcode')}
      </Button>

      <div className="browse-page__divider">
        <span>{t('browsePage.orEnterManually')}</span>
      </div>

      {/* A real <form> so the phone keyboard's Go/Search key submits. */}
      <Form onSubmit={handleSubmit}>
        <InputGroup>
          <Form.Control
            value={sku}
            onChange={(e) => {
              setSku(e.target.value)
              clearError()
            }}
            placeholder={t('browsePage.findBySku')}
            aria-label={t('browsePage.findBySku')}
            // Barcodes are numeric: open the numeric keypad, and keep the
            // browser from offering autocomplete suggestions over it.
            inputMode="numeric"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isLooking}
          />
          <Button type="submit" variant="outline-primary" disabled={isLooking || !sku.trim()}>
            {isLooking ? <Spinner animation="border" size="sm" /> : t('browsePage.findBySkuButton')}
          </Button>
        </InputGroup>
      </Form>

      {error && (
        <Alert variant="danger" className="mt-3" dismissible onClose={clearError}>
          {error}
        </Alert>
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(value) => {
          setSku(value)
          void lookup(value)
        }}
        onClose={() => setShowScanner(false)}
      />
    </div>
  )
}
