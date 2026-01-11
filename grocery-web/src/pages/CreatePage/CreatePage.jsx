import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { createProduct, comparePrices, searchImageBySku } from '../../api/products';

export default function CreatePage() {
  const { t } = useLanguage();
  const location = useLocation();
  // allow prefill from "SKU not found" modal
  const prefillSku = location.state?.prefillSku || '';

  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    sku: prefillSku,
  });

  const [photoMode, setPhotoMode] = useState('url'); // 'url' or 'file'
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [loadingImageSearch, setLoadingImageSearch] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  async function handleFillAutomatically() {
    if (!newProduct.sku?.trim()) {
      alert(t('createPage.skuRequiredForAutoFill'));
      return;
    }

    try {
      setLoadingCompare(true);
      const result = await comparePrices('Hifa', newProduct.sku, 100);
      
      // Map API response to form fields
      if (result.productName) {
        setNewProduct(p => ({ ...p, name: result.productName }));
      }
      if (result.description) {
        setNewProduct(p => ({ ...p, description: result.description }));
      }
      if (result.averagePrice && result.averagePrice !== 'N/A') {
        const priceNum = parseFloat(result.averagePrice);
        if (!Number.isNaN(priceNum)) {
          setNewProduct(p => ({ ...p, price: String(priceNum) }));
        }
      }
    } catch (e) {
      alert(t('createPage.failedToFetch', { error: e.message }));
    } finally {
      setLoadingCompare(false);
    }
  }

  async function handleSearchImageFromWeb() {
    if (!newProduct.sku?.trim()) {
      alert(t('createPage.skuRequiredForImage'));
      return;
    }

    try {
      setLoadingImageSearch(true);
      
      // Clean up previous preview if exists
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
      }

      const { blob, contentType } = await searchImageBySku(newProduct.sku);
      
      // Create object URL for preview
      const objectUrl = URL.createObjectURL(blob);
      setImagePreview(objectUrl);
      
      // Convert blob to File object
      const fileExtension = contentType.split('/')[1] || 'jpg';
      const filename = `image-${newProduct.sku}.${fileExtension}`;
      const file = new File([blob], filename, { type: contentType });
      
      // Set file and switch to file mode
      setPhotoFile(file);
      setPhotoMode('file');
      setPhotoUrl(''); // Clear URL if it was set
    } catch (e) {
      alert(t('createPage.failedToSearchImage', { error: e.message }));
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

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!newProduct.name.trim()) {
      alert(t('createPage.nameRequired'));
      return;
    }
    const priceNum = Number(newProduct.price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      alert(t('createPage.priceInvalid'));
      return;
    }

    try {
      const created = await createProduct({
        name: newProduct.name.trim(),
        description: newProduct.description?.trim() || null,
        price: priceNum,
        sku: newProduct.sku?.trim() || null,
        photoFile: photoFile,
        photoUrl: photoUrl?.trim() || null,
      });
      alert(t('createPage.createdSuccessfully', { name: created.name }));
      setNewProduct({ name: '', description: '', price: '', sku: '' });
      setPhotoUrl('');
      setPhotoFile(null);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <form onSubmit={handleCreateSubmit} style={{ textAlign: 'left', maxWidth: 600 }}>
      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>{t('createPage.nameLabel')}</div>
          <input
            value={newProduct.name}
            onChange={(e) => setNewProduct(p => ({ ...p, name: e.target.value }))}
            required
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>{t('createPage.descriptionLabel')}</div>
          <textarea
            value={newProduct.description}
            onChange={(e) => setNewProduct(p => ({ ...p, description: e.target.value }))}
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
            value={newProduct.price}
            onChange={(e) => setNewProduct(p => ({ ...p, price: e.target.value }))}
            required
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>{t('createPage.skuLabel')}</div>
          <input
            value={newProduct.sku}
            onChange={(e) => setNewProduct(p => ({ ...p, sku: e.target.value }))}
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
          disabled={!newProduct.sku?.trim() || loadingCompare}
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
          disabled={!newProduct.sku?.trim() || loadingImageSearch}
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
        <button type="submit">{t('createPage.createProduct')}</button>
        <button type="button" onClick={() => {
          setNewProduct({ name: '', description: '', price: '', sku: '' });
          setPhotoUrl('');
          setPhotoFile(null);
          if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
            setImagePreview(null);
          }
        }}>
          {t('common.reset')}
        </button>
      </div>
    </form>
  );
}

