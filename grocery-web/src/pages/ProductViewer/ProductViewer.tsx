import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, InputGroup } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPhotoUrl, searchProducts, type Product } from '../../api/products'
import { formatPrice } from '../../utils/formatPrice'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import Icon from '../../components/Icon/Icon'
import './ProductViewer.css'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 350

/**
 * Find a price by name.
 *
 * This screen exists for the case where a barcode is not usable -- loose
 * produce, a worn label, a torn package. So it is a price list, not a photo
 * gallery: one row per product, thumbnail small, price large and aligned for
 * scanning down. The previous grid rendered the price at 17px, which was the
 * smallest thing on the card people opened it to read.
 *
 * Deliberately has no delete control. Deleting belongs in the edit form, not on
 * a screen new employees use to look things up.
 */
export default function ProductViewer() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'

  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const [items, setItems] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  // Debounce typing into the committed query; previously this fired one
  // request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim())
      // A new query invalidates the page number: staying on page 3 would show
      // an empty list.
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [queryInput])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    searchProducts(query, page, PAGE_SIZE, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err: unknown) => {
        // An aborted request is a superseded one, not a failure to report.
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    // Aborting on cleanup stops a slow earlier response overwriting a faster
    // later one.
    return () => controller.abort()
  }, [query, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="price-list">
      <h1 className="page-title">{t('productViewer.findAPrice')}</h1>

      <Form
        className="price-list__search"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(queryInput.trim())
          setPage(1)
        }}
      >
        <InputGroup>
          <InputGroup.Text aria-hidden="true">
            <Icon name="search" />
          </InputGroup.Text>
          <Form.Control
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={t('browsePage.searchPlaceholder')}
            aria-label={t('browsePage.searchPlaceholder')}
            enterKeyHint="search"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => setShowScanner(true)}
            aria-label={t('browsePage.scanBarcode')}
            title={t('browsePage.scanBarcode')}
          >
            <Icon name="barcode" />
          </Button>
        </InputGroup>
      </Form>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && (
        <ul className="price-list__rows" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={`sk-${i}`} className="price-row price-row--skeleton">
              <span className="price-row__thumb" />
              <span className="price-row__body">
                <span className="price-row__skeleton-line" />
                <span className="price-row__skeleton-line price-row__skeleton-line--short" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length > 0 && (
        <ul className="price-list__rows">
          {items.map((p) => (
            <li key={p.id}>
              <Link to={`/products/${p.id}`} className="price-row">
                <span className="price-row__thumb">
                  {p.sku ? (
                    <img src={getPhotoUrl(p.sku)} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <Icon name="image" className="price-row__thumb-fallback" />
                  )}
                </span>
                <span className="price-row__body">
                  <span className="price-row__name">{p.name}</span>
                  {p.sku && (
                    <span className="price-row__sku" dir="ltr">
                      {p.sku}
                    </span>
                  )}
                </span>
                <span className="price-row__price">{formatPrice(p.price, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* An empty search used to be a dead end -- which is exactly the moment
          someone needs to add the item they are holding. */}
      {!loading && items.length === 0 && (
        <div className="price-list__empty">
          <p className="price-list__empty-title">
            {query ? t('productViewer.noMatches', { query }) : t('browsePage.noProducts')}
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/create', { state: { prefillName: query } })}
          >
            <Icon name="plus" /> {t('productViewer.addNewProduct')}
          </Button>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="price-list__pagination" aria-label={t('common.page')}>
          <Button
            variant="outline-secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('common.prev')}
          </Button>
          <span>
            {t('common.page')} {page} / {totalPages}
          </span>
          <Button
            variant="outline-secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
          </Button>
        </nav>
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(value) => navigate(`/lookup/${encodeURIComponent(value)}`)}
        onClose={() => setShowScanner(false)}
      />
    </div>
  )
}
