import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getBySku, getPhotoUrl } from '../../api/products';
import { formatPrice } from '../../utils/formatPrice';
import { Form, InputGroup, Button, Card } from 'react-bootstrap';
import ModalWrapper from '../../components/Modal/Modal';
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner';

export default function BrowsePage() {
  const { t } = useLanguage();
  const [skuSearch, setSkuSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalSku, setModalSku] = useState('');
  const [showSkuScanner, setShowSkuScanner] = useState(false);
  const [foundProduct, setFoundProduct] = useState(null);
  const [findingBySku, setFindingBySku] = useState(false);

  const navigate = useNavigate();

  async function handleFindBySku() {
    const sku = skuSearch.trim();
    if (!sku) return;
    setFindingBySku(true);
    setFoundProduct(null);
    try {
      const p = await getBySku(sku);
      setFoundProduct(p);
    } catch (e) {
      if (String(e.message).startsWith('404')) {
        setModalSku(sku);
        setShowModal(true);
      } else {
        alert(e.message);
      }
    } finally {
      setFindingBySku(false);
    }
  }

  function goToUpdateProduct() {
    if (foundProduct) navigate(`/products/${foundProduct.id}`);
  }

  function handleSkuScan(decodedText) {
    setSkuSearch(decodedText);
    setShowSkuScanner(false);
  }

  return (
    <>
      <p className="text-muted mb-3">{t('browsePage.scanOrEnterBarcode')}</p>

      <InputGroup className="search-bar mb-4">
        <InputGroup.Text className="search-bar-icon" aria-hidden="true">
          <span role="img" aria-hidden="true">🔍</span>
        </InputGroup.Text>
        <Form.Control
          className="search-bar-input"
          value={skuSearch}
          onChange={(e) => {
            setSkuSearch(e.target.value);
            setFoundProduct(null);
          }}
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
        <Button
          variant="primary"
          className="search-bar-action"
          onClick={handleFindBySku}
          disabled={findingBySku}
        >
          {findingBySku ? t('common.loading') : t('browsePage.findBySkuButton')}
        </Button>
      </InputGroup>

      {/* Product preview when found by SKU — tap to go to update */}
      {foundProduct && (
        <Card
          className="mb-4 product-preview-card text-start shadow-sm"
          onClick={goToUpdateProduct}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              goToUpdateProduct();
            }
          }}
          aria-label={t('productViewer.viewProduct', { name: foundProduct.name })}
        >
          <Card.Body className="d-flex align-items-center gap-3 p-3">
            <div className="product-preview-card__img-wrap flex-shrink-0">
              <img
                src={getPhotoUrl(foundProduct.sku)}
                alt=""
                className="product-preview-card__img"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '';
                  e.target.classList.add('product-preview-card__img--placeholder');
                  e.target.alt = t('common.noImageAvailable');
                }}
              />
            </div>
            <div className="flex-grow-1 min-w-0 product-preview-card__text">
              <Card.Text className="product-preview-card__name mb-1">{foundProduct.name}</Card.Text>
              <div className="product-preview-card__price mb-1">{formatPrice(foundProduct.price)}</div>
              {foundProduct.sku && (
                <Card.Text className="mb-0 text-muted small">
                  {t('common.sku')} {foundProduct.sku}
                </Card.Text>
              )}
              <Card.Text className="mb-0 mt-1 small text-primary">
                {t('browsePage.tapToUpdate')}
              </Card.Text>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Modal: SKU not found -> create? */}
      {showModal && (
        <ModalWrapper onClose={() => setShowModal(false)} title={t('browsePage.noProductFound')}>
          <p className="mb-3">{t('browsePage.noProductFoundMessage', { sku: modalSku })}</p>
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              as={Link}
              to="/create"
              state={{ prefillSku: modalSku }}
              onClick={() => setShowModal(false)}
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
    </>
  );
}
