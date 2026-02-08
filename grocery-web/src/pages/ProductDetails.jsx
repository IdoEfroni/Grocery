// src/pages/ProductDetails.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getProductById, updateProduct, deleteProduct, comparePrices, searchImageBySku, getPhotoUrl } from '../api/products';
import { formatPrice } from '../utils/formatPrice';

export default function ProductDetails() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [product, setProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Local edit form state (pre-filled from product)
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    sku: '',
  });

  const [photoMode, setPhotoMode] = useState('url'); // 'url' or 'file'
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [loadingImageSearch, setLoadingImageSearch] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await getProductById(id);
        setProduct(p);
        setForm({
          name: p.name ?? '',
          description: p.description ?? '',
          price: String(p.price ?? ''),
          sku: p.sku ?? '',
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleFillAutomatically() {
    if (!form.sku?.trim()) {
      alert(t('productDetails.skuRequiredForAutoFill'));
      return;
    }

    try {
      setLoadingCompare(true);
      const result = await comparePrices('Hifa', form.sku, 100);
      
      // Map API response to form fields
      if (result.productName) {
        setForm(f => ({ ...f, name: result.productName }));
      }
      if (result.description) {
        setForm(f => ({ ...f, description: result.description }));
      }
      if (result.averagePrice && result.averagePrice !== 'N/A') {
        const priceNum = parseFloat(result.averagePrice);
        if (!Number.isNaN(priceNum)) {
          setForm(f => ({ ...f, price: String(priceNum) }));
        }
      }
    } catch (e) {
      alert(t('productDetails.failedToFetch', { error: e.message }));
    } finally {
      setLoadingCompare(false);
    }
  }

  async function handleSearchImageFromWeb() {
    if (!form.sku?.trim()) {
      alert(t('productDetails.skuRequiredForImage'));
      return;
    }

    try {
      setLoadingImageSearch(true);
      
      // Clean up previous preview if exists
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
      }

      const { blob, contentType } = await searchImageBySku(form.sku);
      
      // Create object URL for preview
      const objectUrl = URL.createObjectURL(blob);
      setImagePreview(objectUrl);
      
      // Convert blob to File object
      const fileExtension = contentType.split('/')[1] || 'jpg';
      const filename = `image-${form.sku}.${fileExtension}`;
      const file = new File([blob], filename, { type: contentType });
      
      // Set file and switch to file mode
      setPhotoFile(file);
      setPhotoMode('file');
      setPhotoUrl(''); // Clear URL if it was set
    } catch (e) {
      alert(t('productDetails.failedToSearchImage', { error: e.message }));
    } finally {
      setLoadingImageSearch(false);
    }
  }

  // Cleanup object URLs on unmount or when image changes
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert(t('productDetails.nameRequired'));
      return;
    }
    const priceNum = Number(form.price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      alert(t('productDetails.priceInvalid'));
      return;
    }

    // ✅ confirmation popup
    const ok = confirm(t('productDetails.saveChangesConfirm', { name: product?.name || form.name }));
    if (!ok) return;

    try {
      setSaving(true);
      await updateProduct(id, {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        price: priceNum,
        sku: form.sku?.trim() || null,
        photoFile: photoFile,
        photoUrl: photoUrl?.trim() || null,
      });
      alert(t('productDetails.productUpdated'));
      navigate('/view'); // back to product list (Display items)
    } catch (e) {
      alert(e.message); // shows 400/409 text from server if any
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('productDetails.deleteConfirm', { name: product?.name }))) return;
    try {
      setDeleting(true);
      await deleteProduct(id);
      alert(t('productDetails.productDeleted'));
      navigate('/view');
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>{t('common.loading')}</div>;
  if (error)   return <div style={{ padding: 16, color: 'red' }}>{error}</div>;
  if (!product) return <div style={{ padding: 16 }}>{t('common.notFound')}</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
      <h2>{t('productDetails.updateProduct')}</h2>

      <div style={{ marginBottom: 16 }}>
        <Link to="/view">{t('productDetails.backToList')}</Link>
      </div>

      {/* Simple read-only summary */}
      <div style={{ marginBottom: 16, opacity: 0.9 }}>
        <b>{t('common.current')}:</b> {product.name} | {t('common.sku')}: {product.sku ?? '-'} | {t('common.price')}: {formatPrice(product.price)}
      </div>

      {/* Current product image from API (GET photo/{sku}) */}
      {product.sku && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('productDetails.currentImage')}</div>
          <div style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden', display: 'inline-block', maxWidth: '100%' }}>
            <img
              src={getPhotoUrl(product.sku)}
              alt={product.name}
              style={{ maxWidth: 280, maxHeight: 280, objectFit: 'contain', display: 'block' }}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) {
                  fallback.style.display = 'flex';
                }
              }}
            />
            <div
              className="text-muted"
              style={{
                display: 'none',
                width: 280,
                height: 200,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                textAlign: 'center',
              }}
              aria-hidden="true"
            >
              {t('common.noImageAvailable')}
            </div>
          </div>
        </div>
      )}

      {/* Update form */}
      <form onSubmit={handleSave} style={{ textAlign: 'left' }}>
        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>{t('createPage.nameLabel')}</div>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>{t('createPage.descriptionLabel')}</div>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>{t('createPage.priceLabel')}</div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>{t('createPage.skuLabel')}</div>
            <input
              value={form.sku}
              onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))}
              placeholder={t('createPage.skuPlaceholder')}
              disabled
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleFillAutomatically}
            disabled={!form.sku?.trim() || loadingCompare}
            style={{ marginBottom: 12 }}
          >
            {loadingCompare ? t('common.loading') : t('createPage.fillAutomatically')}
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>{t('createPage.photoUploadMode')}</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  value="url"
                  checked={photoMode === 'url'}
                  onChange={(e) => setPhotoMode(e.target.value)}
                />
                {t('createPage.url')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  value="file"
                  checked={photoMode === 'file'}
                  onChange={(e) => setPhotoMode(e.target.value)}
                />
                {t('createPage.fileUpload')}
              </label>
            </div>
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleSearchImageFromWeb}
            disabled={!form.sku?.trim() || loadingImageSearch}
            style={{ marginBottom: 12 }}
          >
            {loadingImageSearch ? t('createPage.searching') : t('createPage.searchImageFromWeb')}
          </button>
          {imagePreview && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div style={{ marginBottom: 4, fontSize: '0.9em', fontWeight: 'bold' }}>{t('createPage.imagePreview')}</div>
              <img
                src={imagePreview}
                alt="Product preview"
                style={{ maxWidth: '300px', maxHeight: '300px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
          )}
        </div>

        {photoMode === 'url' ? (
          <div style={{ marginBottom: 12 }}>
            <label>
              <div style={{ marginBottom: 4 }}>{t('createPage.photoUrl')}</div>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder={t('createPage.photoUrlPlaceholder')}
                style={{ width: '100%' }}
              />
            </label>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label>
              <div style={{ marginBottom: 4 }}>{t('createPage.photoFile')}</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                style={{ width: '100%' }}
              />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
          <button type="button" onClick={handleDelete} disabled={deleting}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </button>
          <button type="button" onClick={() => navigate('/view')}>{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  );
}
