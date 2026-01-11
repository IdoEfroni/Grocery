import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { searchProducts, deleteProduct, getBySku, getPhotoUrl } from '../../api/products';
import Modal from '../../components/Modal/Modal';
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner';

export default function BrowsePage() {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [modalSku, setModalSku] = useState('');
  const [previewProduct, setPreviewProduct] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSearchScanner, setShowSearchScanner] = useState(false);
  const [showSkuScanner, setShowSkuScanner] = useState(false);

  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchProducts(query, page, pageSize);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFindBySku() {
    const sku = skuSearch.trim();
    if (!sku) return;
    try {
      const p = await getBySku(sku);
      // ✅ If found: go to the product "update page"
      navigate(`/products/${p.id}`);
    } catch (e) {
      if (String(e.message).startsWith('404')) {
        // Not found -> offer to create (keeps your previous behavior for "no result")
        setModalSku(sku);
        setShowModal(true);
      } else {
        alert(e.message);
      }
    }
  }

  function handleSearchScan(decodedText) {
    setQuery(decodedText);
    setPage(1);
    // The useEffect will automatically trigger load() when query changes
  }

  function handleSkuScan(decodedText) {
    setSkuSearch(decodedText);
    // User can then click the Find button
  }

  return (
    <>
      {/* General text search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('browsePage.searchPlaceholder')}
          style={{ flex: 1 }}
        />
        <button
          onClick={() => setShowSearchScanner(true)}
          title={t('browsePage.scanBarcode')}
          style={{
            background: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          📷
        </button>
        <button onClick={() => { setPage(1); load(); }}>{t('common.search')}</button>
      </div>

      {/* Exact SKU finder */}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px 0' }}>
        <input
          value={skuSearch}
          onChange={(e) => setSkuSearch(e.target.value)}
          placeholder={t('browsePage.findBySku')}
          style={{ flex: 1 }}
        />
        <button
          onClick={() => setShowSkuScanner(true)}
          title={t('browsePage.scanBarcode')}
          style={{
            background: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          📷
        </button>
        <button onClick={handleFindBySku}>{t('browsePage.findBySkuButton')}</button>
      </div>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && (
        <>
          <table width="100%" border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">{t('common.image')}</th>
                <th align="left">{t('common.name')}</th>
                <th align="left">{t('common.sku')}</th>
                <th align="right">{t('common.price')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(p => (
                <tr key={p.id}>
                  <td>
                    {p.sku ? (
                      <img
                        src={getPhotoUrl(p.sku)}
                        alt={p.name}
                        style={{
                          maxWidth: '50px',
                          maxHeight: '50px',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td>{p.name}</td>
                  <td>{p.sku ?? '-'}</td>
                  <td align="right">{p.price.toFixed(2)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div className="actions">
                      <button
                        className="btn btn--primary"
                        onClick={() => {
                          setPreviewProduct(p);
                          setShowPreviewModal(true);
                        }}
                        style={{ marginRight: '8px' }}
                      >
                        {t('common.preview')}
                      </button>
                      {/* Make Update look/behave like a button */}
                      <Link to={`/products/${p.id}`} className="btn btn--primary" style={{ marginRight: '8px' }}>{t('common.update')}</Link>

                      {/* Make Delete match too */}
                      <button
                        className="btn btn--danger"
                        onClick={async () => {
                          if (confirm(t('productDetails.deleteConfirmMessage', { name: p.name }))) {
                            await deleteProduct(p.id);
                            load();
                          }
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan="5">{t('browsePage.noProducts')}</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.prev')}</button>
            <span>
              {t('common.page')} {page} / {Math.max(1, Math.ceil((data.total || 0) / pageSize))}
            </span>
            <button
              disabled={page >= Math.ceil((data.total || 0) / pageSize)}
              onClick={() => setPage(p => p + 1)}
            >
              {t('common.next')}
            </button>
          </div>
        </>
      )}

      {/* Minimal modal for "SKU not found -> create?" */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <h3 style={{ marginTop: 0 }}>{t('browsePage.noProductFound')}</h3>
          <p>{t('browsePage.noProductFoundMessage', { sku: modalSku })}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
            <Link
              to="/create"
              state={{ prefillSku: modalSku }}
              onClick={() => setShowModal(false)}
            >
              <button>{t('common.create')}</button>
            </Link>
          </div>
        </Modal>
      )}

      {/* Preview modal for product details */}
      {showPreviewModal && previewProduct && (
        <Modal onClose={() => setShowPreviewModal(false)}>
          <h3 style={{ marginTop: 0 }}>{t('browsePage.productPreview')}</h3>
          <div style={{ marginBottom: '16px' }}>
            {previewProduct.sku ? (
              <img
                src={getPhotoUrl(previewProduct.sku)}
                alt={previewProduct.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '300px',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto 16px auto',
                  borderRadius: '4px'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999', marginBottom: '16px' }}>
                {t('common.noImageAvailable')}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>{t('common.name')}:</strong> {previewProduct.name}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>{t('common.sku')}:</strong> {previewProduct.sku ?? '-'}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>{t('common.price')}:</strong> ${previewProduct.price.toFixed(2)}
          </div>
          {previewProduct.description && (
            <div style={{ marginBottom: '12px' }}>
              <strong>{t('common.description')}:</strong> {previewProduct.description}
            </div>
          )}
          {previewProduct.createdAt && (
            <div style={{ marginBottom: '12px', fontSize: '0.9em', color: '#aaa' }}>
              <strong>{t('browsePage.created')}:</strong> {new Date(previewProduct.createdAt).toLocaleString()}
            </div>
          )}
          {previewProduct.updatedAt && (
            <div style={{ marginBottom: '12px', fontSize: '0.9em', color: '#aaa' }}>
              <strong>{t('browsePage.updated')}:</strong> {new Date(previewProduct.updatedAt).toLocaleString()}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '20px' }}>
            <button onClick={() => setShowPreviewModal(false)}>{t('common.close')}</button>
          </div>
        </Modal>
      )}

      {/* Barcode Scanner for Search */}
      <BarcodeScanner
        isOpen={showSearchScanner}
        onScan={handleSearchScan}
        onClose={() => setShowSearchScanner(false)}
      />

      {/* Barcode Scanner for SKU */}
      <BarcodeScanner
        isOpen={showSkuScanner}
        onScan={handleSkuScan}
        onClose={() => setShowSkuScanner(false)}
      />
    </>
  );
}

