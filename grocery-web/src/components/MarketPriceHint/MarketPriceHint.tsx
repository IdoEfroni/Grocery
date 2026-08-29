import { Alert, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import './MarketPriceHint.css'

export interface MarketPriceHintProps {
  loading: boolean
  /** Formatted average from the external comparison service, or null. */
  averagePrice: string | null
  productName?: string | null
}

/**
 * An external market average, shown when an item has no price in the system.
 *
 * The presentation is deliberately restrained. This number comes from a public
 * price-comparison site, not from the store, and the realistic failure mode is
 * an employee reading it out to a customer as if it were the shelf price. So it
 * is never given the large treatment used for a real price, it is always
 * labelled as external, and it carries an explicit instruction to confirm
 * before quoting.
 */
export default function MarketPriceHint({ loading, averagePrice, productName }: MarketPriceHintProps) {
  const { t } = useLanguage()

  if (loading) {
    return (
      <div className="market-hint market-hint--loading" role="status">
        <Spinner animation="border" size="sm" className="me-2" />
        {t('lookup.checkingMarketPrice')}
      </div>
    )
  }

  if (!averagePrice) {
    return <p className="text-muted mb-0">{t('lookup.noMarketPrice')}</p>
  }

  return (
    <Alert variant="warning" className="market-hint">
      <p className="market-hint__label">{t('lookup.marketAverageLabel')}</p>
      <p className="market-hint__value" dir="ltr">
        ~ ₪{averagePrice}
      </p>
      {productName && <p className="market-hint__product">{productName}</p>}
      <p className="market-hint__warning">
        <strong>{t('lookup.notStorePrice')}</strong> {t('lookup.confirmBeforeQuoting')}
      </p>
    </Alert>
  )
}
