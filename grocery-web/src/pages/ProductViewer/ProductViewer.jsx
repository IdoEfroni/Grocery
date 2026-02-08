import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { searchProducts, deleteProduct, getPhotoUrl, getBySku } from '../../api/products';
import { formatPrice } from '../../utils/formatPrice';
import { Form, InputGroup, Button } from 'react-bootstrap';
import ModalWrapper from '../../components/Modal/Modal';
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner';
import './ProductViewer.css';

const PAGE_SIZE = 12;
const DISPLAY_SIZES = [
  { value: 'large', cols: 1, labelKey: 'productViewer.displaySizeLarge' },
  { value: 'medium', cols: 2, labelKey: 'productViewer.displaySizeMedium' },
  { value: 'small', cols: 5, labelKey: 'productViewer.displaySizeSmall' },
];
const SORT_OPTIONS = [
  { value: 'relevance', labelKey: 'productViewer.sortRelevance' },
  { value: 'price_asc', labelKey: 'productViewer.sortPriceLowHigh' },
  { value: 'price_desc', labelKey: 'productViewer.sortPriceHighLow' },
  { value: 'name_asc', labelKey: 'productViewer.sortNameAZ' },
  { value: 'name_desc', labelKey: 'productViewer.sortNameZA' },
];

function sortItems(items, sortBy) {
  const list = [...items];
  switch (sortBy) {
    case 'price_asc':
      return list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case 'price_desc':
      return list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case 'name_asc':
      return list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    case 'name_desc':
      return list.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''));
    default:
      return list;
  }
}

export default function ProductViewer() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('relevance');
  const [displaySize, setDisplaySize] = useState('medium');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [skuSearch, setSkuSearch] = useState('');
  const [showSkuScanner, setShowSkuScanner] = useState(false);
  const [showSearchScanner, setShowSearchScanner] = useState(false);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);
  const [modalSku, setModalSku] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchProducts(query, page, PAGE_SIZE);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    load();
  }, [load]);

  const items = sortBy === 'relevance' ? data.items : sortItems(data.items, sortBy);
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));

  async function handleDelete(e, product) {
    e.stopPropagation();
    if (!confirm(t('productDetails.deleteConfirmMessage', { name: product.name }))) return;
    try {
      setDeletingId(product.id);
      await deleteProduct(product.id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleImageClick(product) {
    navigate(`/products/${product.id}`);
  }

  async function handleFindBySku() {
    const sku = skuSearch.trim();
    if (!sku) return;
    try {
      const p = await getBySku(sku);
      navigate(`/products/${p.id}`);
    } catch (e) {
      if (String(e.message).startsWith('404')) {
        setModalSku(sku);
        setShowNotFoundModal(true);
      } else {
        alert(e.message);
      }
    }
  }

  function handleSkuScan(decodedText) {
    setSkuSearch(decodedText);
    setShowSkuScanner(false);
  }

  function handleSearchScan(decodedText) {
    setQuery(decodedText);
    setPage(1);
    setShowSearchScanner(false);
  }

  return (
    <div className="product-viewer">
      <div className="product-viewer__header">
        <h1 className="product-viewer__title">
          {t('productViewer.productList')} ({data.total ?? 0})
        </h1>
        <div className="product-viewer__controls">
          <label className="product-viewer__control-label">
            <span className="visually-hidden">{t('productViewer.displaySize')}</span>
            <select
              className="product-viewer__sort form-select form-select-sm"
              value={displaySize}
              onChange={(e) => setDisplaySize(e.target.value)}
              aria-label={t('productViewer.displaySize')}
            >
              {DISPLAY_SIZES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <select
            className="product-viewer__sort form-select form-select-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label={t('productViewer.sortBy')}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="product-viewer__search-row mb-3">
        <InputGroup className="search-bar product-viewer__search mb-2">
          <InputGroup.Text className="search-bar-icon" aria-hidden="true">
            <span role="img" aria-hidden="true">🔍</span>
          </InputGroup.Text>
          <Form.Control
            className="search-bar-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('browsePage.searchPlaceholder')}
            aria-label={t('browsePage.searchPlaceholder')}
          />
          <Button
            type="button"
            variant="link"
            className="search-bar-camera"
            onClick={() => setShowSearchScanner(true)}
            title={t('browsePage.scanBarcode')}
            aria-label={t('browsePage.scanBarcode')}
          >
            <span role="img" aria-hidden="true">📷</span>
          </Button>
          <Button variant="primary" className="search-bar-action" onClick={() => { setPage(1); load(); }}>
            {t('common.search')}
          </Button>
        </InputGroup>
        <InputGroup className="search-bar mb-2">
          <InputGroup.Text className="search-bar-icon" aria-hidden="true">
            <span role="img" aria-hidden="true">🔍</span>
          </InputGroup.Text>
          <Form.Control
            className="search-bar-input"
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            placeholder={t('browsePage.findBySku')}
            aria-label={t('browsePage.findBySku')}
          />
          <Button
            type="button"
            variant="link"
            className="search-bar-camera"
            onClick={() => setShowSkuScanner(true)}
            title={t('browsePage.scanBarcode')}
            aria-label={t('browsePage.scanBarcode')}
          >
            <span role="img" aria-hidden="true">📷</span>
          </Button>
          <Button variant="outline-primary" className="search-bar-action" onClick={handleFindBySku}>
            {t('browsePage.findBySkuButton')}
          </Button>
        </InputGroup>
      </div>

      {loading && <p className="text-muted">{t('common.loading')}</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <>
          <div
            className="product-viewer__grid"
            style={{ '--grid-cols': DISPLAY_SIZES.find((d) => d.value === displaySize)?.cols ?? 2 }}
          >
            {items.map((p) => (
              <article
                key={p.id}
                className="product-card"
                role="article"
                aria-label={p.name}
              >
                <button
                  type="button"
                  className="product-card__image-wrap"
                  onClick={() => handleImageClick(p)}
                  aria-label={t('productViewer.viewProduct', { name: p.name })}
                >
                  {p.sku ? (
                    <>
                      <img
                        src={getPhotoUrl(p.sku)}
                        alt={p.name}
                        className="product-card__image"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextElementSibling?.classList.remove('d-none');
                        }}
                      />
                      <span className="product-card__no-image d-none">
                        {t('common.noImageAvailable')}
                      </span>
                    </>
                  ) : (
                    <span className="product-card__no-image">
                      {t('common.noImageAvailable')}
                    </span>
                  )}
                </button>
                <div className="product-card__body">
                  <h3 className="product-card__name">{p.name}</h3>
                  <p className="product-card__price">{formatPrice(p.price)}</p>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    className="product-card__delete w-100"
                    onClick={(e) => handleDelete(e, p)}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? t('common.deleting') : t('common.delete')}
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {items.length === 0 && (
            <p className="text-center text-muted py-5">{t('browsePage.noProducts')}</p>
          )}

          {totalPages > 1 && (
            <div className="product-viewer__pagination d-flex align-items-center gap-2 flex-wrap justify-content-center mt-4">
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((prev) => prev - 1)}
              >
                {t('common.prev')}
              </Button>
              <span className="small">
                {t('common.page')} {page} / {totalPages}
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Modal: SKU not found -> create? */}
      {showNotFoundModal && (
        <ModalWrapper onClose={() => setShowNotFoundModal(false)} title={t('browsePage.noProductFound')}>
          <p className="mb-3">{t('browsePage.noProductFoundMessage', { sku: modalSku })}</p>
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="secondary" onClick={() => setShowNotFoundModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              as={Link}
              to="/create"
              state={{ prefillSku: modalSku }}
              onClick={() => setShowNotFoundModal(false)}
            >
              {t('common.create')}
            </Button>
          </div>
        </ModalWrapper>
      )}

      <BarcodeScanner
        isOpen={showSkuScanner}
        onScan={handleSkuScan}
        onClose={() => setShowSkuScanner(false)}
      />
      <BarcodeScanner
        isOpen={showSearchScanner}
        onScan={handleSearchScan}
        onClose={() => setShowSearchScanner(false)}
      />
    </div>
  );
}
