import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, InputGroup } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { useSkuLookup } from '../../hooks/useSkuLookup'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import Icon from '../../components/Icon/Icon'
import './BrowsePage.css'

export default function BrowsePage() {
  const { t } = useLanguage()
  const [sku, setSku] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const { lookup } = useSkuLookup()

  return (
    <div className="browse-page">
      <p className="browse-page__lede">{t('browsePage.scanOrEnterBarcode')}</p>

      {/* Checking a price is what this app is mostly used for, so scanning is
          the primary affordance rather than an icon inside a search field. */}
      <Button
        variant="primary"
        size="lg"
        className="browse-page__scan"
        onClick={() => setShowScanner(true)}
      >
        <Icon name="barcode" className="browse-page__scan-icon" />
        {t('browsePage.scanForPrice')}
      </Button>

      <div className="browse-page__divider">
        <span>{t('browsePage.orEnterManually')}</span>
      </div>

      {/* A real <form> so the phone keyboard's Go key submits. */}
      <Form
        onSubmit={(e) => {
          e.preventDefault()
          lookup(sku)
        }}
      >
        <InputGroup>
          <Form.Control
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder={t('browsePage.findBySku')}
            aria-label={t('browsePage.findBySku')}
            // Barcodes are numeric: open the numeric keypad and keep
            // autocomplete from covering it.
            inputMode="numeric"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button type="submit" variant="outline-primary" disabled={!sku.trim()}>
            {t('browsePage.findBySkuButton')}
          </Button>
        </InputGroup>
      </Form>

      {/* Not every item has a readable barcode -- loose produce, worn labels --
          so searching by name has to be reachable from the main screen. */}
      <p className="browse-page__alt">
        {t('browsePage.noBarcodeQuestion')}{' '}
        <Link to="/view">{t('browsePage.searchByName')}</Link>
      </p>

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(value) => lookup(value)}
        onClose={() => setShowScanner(false)}
      />
    </div>
  )
}
