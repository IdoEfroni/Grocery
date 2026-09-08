import { Button } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPhotoUrl, type Product } from '../../api/products'
import { formatPrice } from '../../utils/formatPrice'
import Icon from '../Icon/Icon'
import './ProductPriceCard.css'

export interface ProductPriceCardProps {
  product: Product
  onEdit: () => void
  onScanNext?: () => void
  /** When provided, the price becomes a control that opens a price-only edit. */
  onEditPrice?: () => void
}

/**
 * The answer to "how much is this?", optimised for being read at arm's length.
 *
 * This is the app's most-used screen: a new employee holding an item with a
 * customer waiting. It is read-only by default -- editing and deleting sit
 * behind explicit actions, so nobody changes a product while checking a price.
 */
export default function ProductPriceCard({
  product,
  onEdit,
  onScanNext,
  onEditPrice,
}: ProductPriceCardProps) {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'
  const priceText = formatPrice(product.price, locale)

  return (
    <div className="price-card">
      {product.sku && (
        <div className="price-card__photo">
          <img
            src={getPhotoUrl(product.sku)}
            alt=""
            loading="eager"
            onError={(e) => {
              e.currentTarget.closest('.price-card__photo')?.classList.add('is-empty')
            }}
          />
        </div>
      )}

      <h1 className="price-card__name">{product.name}</h1>

      {/* Tapping the price is the shortcut for a price round: it opens a
          price-only editor rather than the whole form. Still a real button, so
          it is keyboard reachable and announced as an action. */}
      {onEditPrice ? (
        <button
          type="button"
          className="price-card__price price-card__price--editable"
          onClick={onEditPrice}
          aria-label={t('quickPrice.editPriceAria', { price: priceText })}
        >
          {priceText}
          <Icon name="edit" className="price-card__price-icon" />
        </button>
      ) : (
        <p className="price-card__price" aria-label={t('lookup.priceIs', { price: priceText })}>
          {priceText}
        </p>
      )}

      {product.description && <p className="price-card__description">{product.description}</p>}

      {product.sku && (
        <p className="price-card__sku">
          {t('common.sku')} <span dir="ltr">{product.sku}</span>
        </p>
      )}

      <div className="price-card__actions">
        {onScanNext && (
          <Button variant="primary" size="lg" className="price-card__primary" onClick={onScanNext}>
            <Icon name="barcode" /> {t('lookup.scanNext')}
          </Button>
        )}
        <Button variant="outline-secondary" onClick={onEdit}>
          <Icon name="edit" /> {t('lookup.editProduct')}
        </Button>
      </div>
    </div>
  )
}
