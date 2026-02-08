import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { createProduct, comparePrices, searchImageBySku } from '../../api/products';
import { Form, Button, Card } from 'react-bootstrap';

export default function CreatePage() {
  const { t } = useLanguage();
  const location = useLocation();
  const prefillSku = location.state?.prefillSku || '';

  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    sku: prefillSku,
  });

  const [photoMode, setPhotoMode] = useState('url');
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
      if (result.productName) setNewProduct((p) => ({ ...p, name: result.productName }));
      if (result.description) setNewProduct((p) => ({ ...p, description: result.description }));
      if (result.averagePrice && result.averagePrice !== 'N/A') {
        const priceNum = parseFloat(result.averagePrice);
        if (!Number.isNaN(priceNum)) setNewProduct((p) => ({ ...p, price: String(priceNum) }));
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
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
      }
      const { blob, contentType } = await searchImageBySku(newProduct.sku);
      const objectUrl = URL.createObjectURL(blob);
      setImagePreview(objectUrl);
      const fileExtension = contentType.split('/')[1] || 'jpg';
      const file = new File([blob], `image-${newProduct.sku}.${fileExtension}`, { type: contentType });
      setPhotoFile(file);
      setPhotoMode('file');
      setPhotoUrl('');
    } catch (e) {
      alert(t('createPage.failedToSearchImage', { error: e.message }));
    } finally {
      setLoadingImageSearch(false);
    }
  }

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
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
        photoFile,
        photoUrl: photoUrl?.trim() || null,
      });
      alert(t('createPage.createdSuccessfully', { name: created.name }));
      setNewProduct({ name: '', description: '', price: '', sku: '' });
      setPhotoUrl('');
      setPhotoFile(null);
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
      }
    } catch (e) {
      alert(e.message);
    }
  }

  function handleReset() {
    setNewProduct({ name: '', description: '', price: '', sku: '' });
    setPhotoUrl('');
    setPhotoFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  }

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Form onSubmit={handleCreateSubmit} className="text-start" style={{ maxWidth: 600 }}>
          <Form.Group className="mb-3">
            <Form.Label>{t('createPage.nameLabel')}</Form.Label>
            <Form.Control
              value={newProduct.name}
              onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>{t('createPage.descriptionLabel')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={newProduct.description}
              onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>{t('createPage.priceLabel')}</Form.Label>
            <Form.Control
              type="number"
              min={0}
              step={0.01}
              value={newProduct.price}
              onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>{t('createPage.skuLabel')}</Form.Label>
            <Form.Control
              value={newProduct.sku}
              onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))}
              placeholder={t('createPage.skuPlaceholder')}
              disabled
            />
          </Form.Group>

          <div className="mb-3">
            <Button
              type="button"
              variant="outline-primary"
              onClick={handleFillAutomatically}
              disabled={!newProduct.sku?.trim() || loadingCompare}
            >
              {loadingCompare ? t('common.loading') : t('createPage.fillAutomatically')}
            </Button>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>{t('createPage.photoUploadMode')}</Form.Label>
            <div className="d-flex gap-3">
              <Form.Check
                type="radio"
                id="photo-url"
                name="photoMode"
                label={t('createPage.url')}
                checked={photoMode === 'url'}
                onChange={() => setPhotoMode('url')}
              />
              <Form.Check
                type="radio"
                id="photo-file"
                name="photoMode"
                label={t('createPage.fileUpload')}
                checked={photoMode === 'file'}
                onChange={() => setPhotoMode('file')}
              />
            </div>
          </Form.Group>

          <div className="mb-3">
            <Button
              type="button"
              variant="outline-secondary"
              onClick={handleSearchImageFromWeb}
              disabled={!newProduct.sku?.trim() || loadingImageSearch}
            >
              {loadingImageSearch ? t('createPage.searching') : t('createPage.searchImageFromWeb')}
            </Button>
            {imagePreview && (
              <div className="mt-2">
                <Form.Label className="small fw-bold">{t('createPage.imagePreview')}</Form.Label>
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="img-thumbnail d-block"
                  style={{ maxWidth: 300, maxHeight: 300, objectFit: 'contain' }}
                />
              </div>
            )}
          </div>

          {photoMode === 'url' ? (
            <Form.Group className="mb-3">
              <Form.Label>{t('createPage.photoUrl')}</Form.Label>
              <Form.Control
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder={t('createPage.photoUrlPlaceholder')}
              />
            </Form.Group>
          ) : (
            <Form.Group className="mb-3">
              <Form.Label>{t('createPage.photoFile')}</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
            </Form.Group>
          )}

          <div className="d-flex gap-2">
            <Button type="submit" variant="primary">
              {t('createPage.createProduct')}
            </Button>
            <Button type="button" variant="outline-secondary" onClick={handleReset}>
              {t('common.reset')}
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
}
