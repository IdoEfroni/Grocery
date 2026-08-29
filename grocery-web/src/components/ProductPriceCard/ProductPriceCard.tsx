import { Button } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPhotoUrl, type Product } from '../../api/products'
import { formatPrice } from '../../utils/formatPrice'
import './ProductPriceCard.css'

export interface ProductPriceCardProps {
  product: Product
  onEdit: () => void
  onScanNext?: () => void
}

/**
 * The answer to "how much is this?", optimised for being read at arm's length.
 *
 * This is the app's most-used screen: a new employee holding an item with a
 * customer waiting. It is deliberately read-only -- editing and deleting sit
 * behind an explicit action, so nobody changes a product while just checking a
 * price.
 */
export default function ProductPriceCard({ product, onEdit, onScanNext }: ProductPriceCardProps) {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'

  return (
    <div className="price-card">
      {product.sku && (
        <div className="price-card__photo">
          <img
            src={getPhotoUrl(product.sku)}
            alt=""
            onError={(e) => {
              e.currentTarget.closest('.price-card__photo')?.classList.add('is-empty')
            }}
          />
        </div>
      )}

      <h1 className="price-card__name">{product.name}</h1>

      {/* The price is the point of the screen, so it gets the visual weight.
          aria-label gives screen readers a spoken currency amount rather than
          a bare glyph and number. */}
      <p className="price-card__price" aria-label={t('lookup.priceIs', { price: formatPrice(product.price, locale) })}>
        {formatPrice(product.price, locale)}
      </p>

      {product.description && <p className="price-card__description">{product.description}</p>}

      {product.sku && (
        <p className="price-card__sku">
          {t('common.sku')} <span dir="ltr">{product.sku}</span>
        </p>
      )}

      <div className="price-card__actions">
        {onScanNext && (
          <Button variant="primary" size="lg" className="price-card__primary" onClick={onScanNext}>
            <span aria-hidden="true">📷</span> {t('lookup.scanNext')}
          </Button>
        )}
        <Button variant="outline-secondary" onClick={onEdit}>
          {t('lookup.editProduct')}
        </Button>
      </div>
    </div>
  )
}
