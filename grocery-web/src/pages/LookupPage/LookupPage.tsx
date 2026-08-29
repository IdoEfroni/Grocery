import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { ApiError } from '../../api/http'
import { comparePrices, getBySku, type Product } from '../../api/products'
import { COMPARE_RESULT_COUNT, SHOPPING_CITY } from '../../config'
import ProductPriceCard from '../../components/ProductPriceCard/ProductPriceCard'
import MarketPriceHint from '../../components/MarketPriceHint/MarketPriceHint'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import './LookupPage.css'

type State =
  | { status: 'loading' }
  | { status: 'found'; product: Product }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

/**
 * Price lookup for a scanned or typed barcode -- the app's primary screen.
 *
 * Owns both outcomes so the employee never has to interpret a routing decision:
 * a known item shows its price, an unknown one explains that it is not in the
 * system and offers an external reference plus a way to add it.
 */
export default function LookupPage() {
  const { sku = '' } = useParams<{ sku: string }>()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [state, setState] = useState<State>({ status: 'loading' })
  const [showScanner, setShowScanner] = useState(false)

  const [marketLoading, setMarketLoading] = useState(false)
  const [marketPrice, setMarketPrice] = useState<string | null>(null)
  const [marketName, setMarketName] = useState<string | null>(null)

  useEffect(() => {
    if (!sku) return
    const controller = new AbortController()

    setState({ status: 'loading' })
    setMarketPrice(null)
    setMarketName(null)

    getBySku(sku, { signal: controller.signal })
      .then((product) => {
        if (!controller.signal.aborted) setState({ status: 'found', product })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.isNotFound) {
          setState({ status: 'not-found' })
          return
        }
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => controller.abort()
  }, [sku])

  // Only consult the external service once we know the item is genuinely
  // missing -- it is a slow scrape and irrelevant when we have a real price.
  useEffect(() => {
    if (state.status !== 'not-found' || !sku) return
    const controller = new AbortController()

    setMarketLoading(true)
    comparePrices(SHOPPING_CITY, sku, COMPARE_RESULT_COUNT, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setMarketPrice(result.averagePrice && result.averagePrice !== 'N/A' ? result.averagePrice : null)
        setMarketName(result.productName || null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setMarketPrice(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketLoading(false)
      })

    return () => controller.abort()
  }, [state.status, sku])

  const handleScan = useCallback(
    (value: string) => {
      // replace: a chain of lookups should not build up a back stack the
      // employee has to tap through to get home.
      navigate(`/lookup/${encodeURIComponent(value)}`, { replace: true })
    },
    [navigate],
  )

  return (
    <div className="lookup-page">
      {state.status === 'loading' && (
        <div className="lookup-page__center" role="status">
          <Spinner animation="border" />
          <p className="text-muted mt-3 mb-0">{t('common.loading')}</p>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger">
          {state.message}
          <div className="mt-3">
            <Button variant="outline-danger" onClick={() => navigate('/')}>
              {t('lookup.backToSearch')}
            </Button>
          </div>
        </Alert>
      )}

      {state.status === 'found' && (
        <ProductPriceCard
          product={state.product}
          onEdit={() => navigate(`/products/${state.product.id}/edit`)}
          onScanNext={() => setShowScanner(true)}
        />
      )}

      {state.status === 'not-found' && (
        <div className="lookup-page__missing">
          <Alert variant="secondary" className="lookup-page__missing-head">
            <p className="lookup-page__missing-title">{t('lookup.notInSystem')}</p>
            <p className="lookup-page__missing-sku mb-0">
              {t('common.sku')} <span dir="ltr">{sku}</span>
            </p>
          </Alert>

          <MarketPriceHint
            loading={marketLoading}
            averagePrice={marketPrice}
            productName={marketName}
          />

          <div className="lookup-page__missing-actions">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/create', { state: { prefillSku: sku, autoFill: true } })}
            >
              {t('lookup.addToSystem')}
            </Button>
            <Button variant="outline-secondary" onClick={() => setShowScanner(true)}>
              <span aria-hidden="true">📷</span> {t('lookup.scanNext')}
            </Button>
          </div>
        </div>
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
      />
    </div>
  )
}
