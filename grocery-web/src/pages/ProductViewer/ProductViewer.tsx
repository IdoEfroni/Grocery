import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { deleteProduct, getPhotoUrl, searchProducts, type Product } from '../../api/products'
import { formatPrice } from '../../utils/formatPrice'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import './ProductViewer.css'

const PAGE_SIZE = 12
const SEARCH_DEBOUNCE_MS = 350

const DENSITIES = [
  { value: 'comfortable', labelKey: 'productViewer.displaySizeLarge' },
  { value: 'cosy', labelKey: 'productViewer.displaySizeMedium' },
  { value: 'compact', labelKey: 'productViewer.displaySizeSmall' },
] as const

type Density = (typeof DENSITIES)[number]['value']

const SORT_OPTIONS = [
  { value: 'relevance', labelKey: 'productViewer.sortRelevance' },
  { value: 'price_asc', labelKey: 'productViewer.sortPriceLowHigh' },
  { value: 'price_desc', labelKey: 'productViewer.sortPriceHighLow' },
  { value: 'name_asc', labelKey: 'productViewer.sortNameAZ' },
  { value: 'name_desc', labelKey: 'productViewer.sortNameZA' },
] as const

type SortBy = (typeof SORT_OPTIONS)[number]['value']

function sortItems(items: Product[], sortBy: SortBy): Product[] {
  const list = [...items]
  switch (sortBy) {
    case 'price_asc':
      return list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    case 'price_desc':
      return list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    case 'name_asc':
      return list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    case 'name_desc':
      return list.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''))
    default:
      return list
  }
}

export default function ProductViewer() {
  const { t, language } = useLanguage()
  const navigate = useNavigate()

  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortBy>('relevance')
  const [density, setDensity] = useState<Density>('cosy')

  const [items, setItems] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  // Debounce typing into the committed query. Without this the page fired one
  // request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim())
      // A new query invalidates the current page number; staying on page 5
      // would show an empty grid.
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [queryInput])

  const [reloadToken, setReloadToken] = useState(0)

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

    // Aborting on cleanup is what stops a slow earlier response from
    // overwriting a faster later one.
    return () => controller.abort()
  }, [query, page, reloadToken])

  const visibleItems = useMemo(
    () => (sortBy === 'relevance' ? items : sortItems(items, sortBy)),
    [items, sortBy],
  )
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const confirmDelete = async () => {
    const product = pendingDelete
    if (!product) return
    setPendingDelete(null)
    setDeletingId(product.id)
    try {
      await deleteProduct(product.id)
      setReloadToken((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="product-viewer">
      <div className="product-viewer__header">
        <h1 className="product-viewer__title">
          {t('productViewer.productList')} ({total})
        </h1>
      </div>

      <Form
        className="product-viewer__search"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(queryInput.trim())
          setPage(1)
        }}
      >
        <InputGroup>
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
            <span aria-hidden="true">📷</span>
          </Button>
        </InputGroup>
      </Form>

      <div className="product-viewer__controls">
        <Form.Group className="product-viewer__control">
          <Form.Label htmlFor="product-viewer-density" className="visually-hidden">
            {t('productViewer.displaySize')}
          </Form.Label>
          <Form.Select
            id="product-viewer-density"
            value={density}
            onChange={(e) => setDensity(e.target.value as Density)}
          >
            {DENSITIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="product-viewer__control">
          <Form.Label htmlFor="product-viewer-sort" className="visually-hidden">
            {t('productViewer.sortBy')}
          </Form.Label>
          {/* Labelled as page-scoped because the API returns one page at a time
              and has no sort parameter -- sorting here genuinely only reorders
              the 12 visible items. */}
          <Form.Select
            id="product-viewer-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </Form.Select>
          {sortBy !== 'relevance' && totalPages > 1 && (
            <Form.Text className="text-muted">{t('productViewer.sortPageScopeNote')}</Form.Text>
          )}
        </Form.Group>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Skeletons keep the page height stable. Previously the grid unmounted
          on every load, collapsing the layout and resetting scroll. */}
      <div className={`product-viewer__grid product-viewer__grid--${density}`}>
        {loading
          ? Array.from({ length: PAGE_SIZE }, (_, i) => (
              <div key={`skeleton-${i}`} className="product-card product-card--skeleton" aria-hidden="true">
                <div className="product-card__image-wrap" />
                <div className="product-card__body">
                  <span className="product-card__skeleton-line" />
                  <span className="product-card__skeleton-line product-card__skeleton-line--short" />
                </div>
              </div>
            ))
          : visibleItems.map((p) => (
              <article key={p.id} className="product-card" aria-label={p.name}>
                <button
                  type="button"
                  className="product-card__image-wrap"
                  onClick={() => navigate(`/products/${p.id}`)}
                  aria-label={t('productViewer.viewProduct', { name: p.name })}
                >
                  {p.sku ? (
                    <img
                      src={getPhotoUrl(p.sku)}
                      alt=""
                      className="product-card__image"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  ) : (
                    <span className="product-card__no-image">{t('common.noImageAvailable')}</span>
                  )}
                </button>
                <div className="product-card__body">
                  <h2 className="product-card__name">{p.name}</h2>
                  <p className="product-card__price">
                    {formatPrice(p.price, language === 'he' ? 'he-IL' : 'en-IL')}
                  </p>
                  {/* Deliberately a small, right-aligned control rather than a
                      full-width button directly under the tappable image. */}
                  <div className="product-card__actions">
                    <Button
                      variant="link"
                      className="product-card__delete"
                      onClick={() => setPendingDelete(p)}
                      disabled={deletingId === p.id}
                      aria-label={t('productViewer.deleteProduct', { name: p.name })}
                    >
                      {deletingId === p.id ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <span aria-hidden="true">🗑</span>
                      )}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
      </div>

      {!loading && visibleItems.length === 0 && (
        <p className="text-center text-muted py-5">{t('browsePage.noProducts')}</p>
      )}

      {totalPages > 1 && (
        <nav className="product-viewer__pagination" aria-label={t('common.page')}>
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

      {pendingDelete && (
        <div className="product-viewer__confirm" role="alertdialog" aria-modal="true">
          <div className="product-viewer__confirm-panel">
            <p className="mb-3">
              {t('productDetails.deleteConfirmMessage', { name: pendingDelete.name })}
            </p>
            <div className="d-flex gap-2 justify-content-end">
              <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void confirmDelete()}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(value) => setQueryInput(value)}
        onClose={() => setShowScanner(false)}
      />
    </div>
  )
}
