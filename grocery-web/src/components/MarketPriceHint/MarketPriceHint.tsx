import { Alert, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import type { PriceOffer, ProductCompareResponse } from '../../api/products'
import './MarketPriceHint.css'

export interface MarketPriceHintProps {
  loading: boolean
  /** The comparison result, or null when none could be fetched. */
  market: ProductCompareResponse | null
  productName?: string | null
}

/** Where an offer can be had, e.g. "Rami Levy — Ramat HaHayal". */
function offerPlace(offer: PriceOffer) {
  return offer.storeName && offer.storeName !== offer.chain
    ? `${offer.chain} — ${offer.storeName}`
    : offer.chain
}

/**
 * An external market reference, shown when an item has no price in the system.
 *
 * The presentation is deliberately restrained. This number comes from a public
 * price-comparison site, not from the store, and the realistic failure mode is
 * an employee reading it out to a customer as if it were the shelf price. So it
 * is never given the large treatment used for a real price, it is always
 * labelled as external, and it carries an explicit instruction to confirm
 * before quoting.
 *
 * The headline figure is the median shelf price, not the mean. Chains price the
 * same item from ₪3.90 to ₪9.90 in one city, and some carry a permanently
 * inflated shelf price so a standing promotion reads as a large discount; a mean
 * follows those, a median does not. Promotional prices are shown separately for
 * the same reason -- blending them into one number would hide the tactic instead
 * of exposing it. And a bulk deal always states the quantity it needs, because
 * "₪3.00" that requires buying ten of something is not what one costs.
 */
export default function MarketPriceHint({ loading, market, productName }: MarketPriceHintProps) {
  const { t } = useLanguage()

  if (loading) {
    return (
      <div className="market-hint market-hint--loading" role="status">
        <Spinner animation="border" size="sm" className="me-2" />
        {t('lookup.checkingMarketPrice')}
      </div>
    )
  }

  if (!market || market.typicalPrice === 'N/A') {
    // A blocked scrape and a barcode nobody sells are different problems, and only
    // one of them is worth trying again in a minute.
    return (
      <p className="text-muted mb-0">
        {market?.degraded ? t('lookup.marketPriceUnavailable') : t('lookup.noMarketPrice')}
      </p>
    )
  }

  const { typicalPrice, bestSingleUnit, highestRealPrice, bestBulk, resultCount, inflatedOffers } =
    market
  const singleUnitBeatsTypical =
    bestSingleUnit !== null && Number.parseFloat(bestSingleUnit.price) < Number.parseFloat(typicalPrice)

  // Only worth showing as a range when the two ends actually differ -- when every
  // shop charges the same, repeating the number as a "highest" is just noise.
  const showHighest =
    highestRealPrice !== null &&
    bestSingleUnit !== null &&
    Number.parseFloat(highestRealPrice.price) > Number.parseFloat(bestSingleUnit.price)

  return (
    <Alert variant="warning" className="market-hint">
      <p className="market-hint__label">{t('lookup.marketTypicalLabel')}</p>
      <p className="market-hint__value" dir="ltr">
        ~ ₪{typicalPrice}
      </p>
      {productName && <p className="market-hint__product">{productName}</p>}

      <p className="market-hint__basis">{t('lookup.marketBasis', { count: String(resultCount) })}</p>

      {singleUnitBeatsTypical && bestSingleUnit && (
        <p className="market-hint__deal">
          <span className="market-hint__deal-label">{t('lookup.bestSingleUnit')}</span>{' '}
          <span dir="ltr">₪{bestSingleUnit.price}</span> — {offerPlace(bestSingleUnit)}
        </p>
      )}

      {showHighest && highestRealPrice && (
        <p className="market-hint__deal">
          <span className="market-hint__deal-label">{t('lookup.highestReal')}</span>{' '}
          <span dir="ltr">₪{highestRealPrice.price}</span> — {offerPlace(highestRealPrice)}
        </p>
      )}

      {bestBulk && (
        <p className="market-hint__deal">
          <span className="market-hint__deal-label">{t('lookup.bestBulk')}</span>{' '}
          <span dir="ltr">₪{bestBulk.price}</span>{' '}
          {t('lookup.bulkRequires', { quantity: String(bestBulk.requiredQuantity) })} —{' '}
          {offerPlace(bestBulk)}
        </p>
      )}

      {inflatedOffers.length > 0 && (
        <p className="market-hint__inflated">
          {t('lookup.inflatedWarning', { count: String(inflatedOffers.length) })}
        </p>
      )}

      <p className="market-hint__warning">
        <strong>{t('lookup.notStorePrice')}</strong> {t('lookup.confirmBeforeQuoting')}
      </p>
    </Alert>
  )
}
