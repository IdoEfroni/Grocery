import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Modal } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { useCart } from '../../contexts/CartContext'
import { ApiError } from '../../api/http'
import { comparePrices, getBySku, type Product } from '../../api/products'
import { SHOPPING_CITY } from '../../config'
import {
  discountAmountAgorot,
  fromAgorot,
  lineSubtotalAgorot,
  lineTotalAgorot,
  formatDiscount,
  type Discount,
} from '../../utils/money'
import { formatPrice } from '../../utils/formatPrice'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import Icon from '../../components/Icon/Icon'
import AddToCartDialog, { type PendingScan } from '../../components/Cart/AddToCartDialog'
import AddByName from '../../components/Cart/AddByName'
import DiscountDialog from '../../components/Cart/DiscountDialog'
import ReceiptDialog from '../../components/Cart/ReceiptDialog'
import type { CartLine } from '../../contexts/CartContext'
import './CartPage.css'

/**
 * The till: scan a customer's basket and produce a bill.
 *
 * Scanning drives everything. A known barcode goes straight to a quantity
 * prompt; an unknown one asks for a price as well, seeded in the background
 * from the price-comparison service so there is usually a figure to accept
 * rather than invent. Unknown items are flagged for registering afterwards, so
 * the gap in the catalogue is visible rather than quietly repeated at every
 * sale.
 *
 * Typing a name is the second way in, for stock that carries no barcode at all
 * -- loose bread, produce, anything repackaged in the shop. A match in the
 * catalogue is charged at the shop's own price; when nothing matches, the item
 * still reaches the bill at a price entered here and is flagged like any other
 * unregistered line.
 */
export default function CartPage() {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'
  const cart = useCart()

  const [showScanner, setShowScanner] = useState(false)
  const [pending, setPending] = useState<PendingScan | null>(null)
  const [discountLine, setDiscountLine] = useState<CartLine | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [issuedAt, setIssuedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scanAbortRef = useRef<AbortController | null>(null)

  /**
   * How the pending item arrived. Confirming a scan returns to the scanner,
   * since a basket is many items; confirming a typed one must not, or the
   * camera opens over a cashier who is still typing.
   */
  const pendingOriginRef = useRef<'scan' | 'name'>('scan')

  const handleScan = useCallback(async (sku: string) => {
    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller

    pendingOriginRef.current = 'scan'
    setError(null)
    setPending({ status: 'looking', sku })

    try {
      const product = await getBySku(sku, { signal: controller.signal })
      if (controller.signal.aborted) return
      setPending({
        status: 'found',
        sku,
        name: product.name,
        unitPrice: product.price,
        productId: product.id,
      })
      return
    } catch (err) {
      if (controller.signal.aborted) return
      if (!(err instanceof ApiError && err.isNotFound)) {
        setError(err instanceof Error ? err.message : String(err))
        setPending(null)
        return
      }
    }

    // Not in the catalogue. Show the form immediately and fill the suggested
    // price in behind it -- the scrape takes a couple of seconds and there is a
    // customer waiting.
    setPending({
      status: 'unknown',
      sku,
      suggestedName: null,
      suggestedPrice: null,
      priceLoading: true,
    })

    try {
      const result = await comparePrices(SHOPPING_CITY, sku, { signal: controller.signal })
      if (controller.signal.aborted) return
      // The median, not the mean: a handful of branches carrying an inflated shelf
      // price would otherwise pull the suggestion above what the item really costs.
      const parsed = Number.parseFloat(result.typicalPrice)
      setPending((current) =>
        current?.status === 'unknown' && current.sku === sku
          ? {
              ...current,
              suggestedName: result.productName || null,
              suggestedPrice: Number.isFinite(parsed) && result.typicalPrice !== 'N/A' ? parsed : null,
              priceLoading: false,
            }
          : current,
      )
    } catch {
      if (controller.signal.aborted) return
      setPending((current) =>
        current?.status === 'unknown' && current.sku === sku
          ? { ...current, priceLoading: false }
          : current,
      )
    }
  }, [])

  /** A catalogue product chosen by name. Its own price applies, barcode or not. */
  const handlePickByName = useCallback((product: Product) => {
    scanAbortRef.current?.abort()
    pendingOriginRef.current = 'name'
    setError(null)
    setPending({
      status: 'found',
      sku: product.sku ?? '',
      name: product.name,
      unitPrice: product.price,
      productId: product.id,
    })
  }, [])

  /**
   * Nothing in the catalogue matched. The sale still has to go through, so the
   * item is added at a price typed at the till and flagged for registering --
   * the same treatment an unrecognised barcode gets. There is no barcode to
   * look up, so no price can be suggested.
   */
  const handleAddWithoutBarcode = useCallback((name: string) => {
    scanAbortRef.current?.abort()
    pendingOriginRef.current = 'name'
    setError(null)
    setPending({
      status: 'unknown',
      sku: '',
      suggestedName: name,
      suggestedPrice: null,
      priceLoading: false,
    })
  }, [])

  const finalise = () => {
    setIssuedAt(new Date())
    setShowReceipt(true)
  }

  const startNewBill = () => {
    cart.clear()
    setShowReceipt(false)
    setIssuedAt(null)
  }

  const isEmpty = cart.lines.length === 0

  return (
    <div className="cart-page">
      <div className="cart-page__head">
        <h1 className="page-title mb-0">{t('cart.title')}</h1>
        {!isEmpty && (
          <Button variant="link" className="cart-page__clear" onClick={() => setConfirmClear(true)}>
            {t('cart.clear')}
          </Button>
        )}
      </div>

      {/* Unregistered items stay visible at the top for the whole session, so
          the catalogue gap is dealt with rather than forgotten after the
          customer leaves. */}
      {cart.unregisteredCount > 0 && (
        <Alert variant="warning" className="cart-page__unregistered">
          <Icon name="alert" />
          <div>
            <strong>{t('cart.unregisteredTitle', { count: String(cart.unregisteredCount) })}</strong>
            <p className="mb-0">{t('cart.unregisteredHelp')}</p>
          </div>
        </Alert>
      )}

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="cart-page__add">
        <Button
          variant="primary"
          size="lg"
          className="cart-page__scan"
          onClick={() => setShowScanner(true)}
        >
          <Icon name="barcode" size="1.5rem" /> {t('cart.scanItem')}
        </Button>

        {/* Scanning stays the primary path; typing is for what has no barcode
            to scan in the first place. */}
        <AddByName onPick={handlePickByName} onAddWithoutBarcode={handleAddWithoutBarcode} />
      </div>

      {isEmpty ? (
        <p className="cart-page__empty">{t('cart.empty')}</p>
      ) : (
        <ul className="cart-lines">
          {cart.lines.map((line) => {
            const subtotal = lineSubtotalAgorot(line.unitPrice, line.quantity)
            const total = lineTotalAgorot(line.unitPrice, line.quantity, line.discount)
            const discountLabel = formatDiscount(line.discount)

            return (
              <li key={line.id} className="cart-line">
                <div className="cart-line__top">
                  <span className="cart-line__name">
                    {line.name}
                    {line.source === 'manual' && (
                      <span className="cart-line__flag" title={t('cart.notInSystemShort')}>
                        {t('cart.notInSystemShort')}
                      </span>
                    )}
                  </span>
                  <span className="cart-line__total">{formatPrice(fromAgorot(total), locale)}</span>
                </div>

                <div className="cart-line__meta">
                  <span dir="ltr">{line.sku}</span>
                  <span>
                    {line.quantity} × {formatPrice(line.unitPrice, locale)}
                  </span>
                  {discountLabel && (
                    <span className="cart-line__discount">
                      −{formatPrice(fromAgorot(discountAmountAgorot(subtotal, line.discount)), locale)}{' '}
                      ({discountLabel})
                    </span>
                  )}
                </div>

                <div className="cart-line__actions">
                  <div className="cart-line__qty">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      aria-label={t('cart.decrease')}
                      onClick={() => cart.setQuantity(line.id, Math.max(line.quantity - 1, 0))}
                    >
                      −
                    </Button>
                    <span className="cart-line__qty-value">{line.quantity}</span>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      aria-label={t('cart.increase')}
                      onClick={() => cart.setQuantity(line.id, line.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>

                  <Button variant="link" size="sm" onClick={() => setDiscountLine(line)}>
                    {t('cart.discount')}
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="cart-line__remove"
                    aria-label={t('cart.removeLine', { name: line.name })}
                    onClick={() => cart.removeLine(line.id)}
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!isEmpty && (
        <div className="cart-summary">
          <dl className="cart-summary__figures">
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{formatPrice(fromAgorot(cart.totals.subtotalAgorot), locale)}</dd>
            </div>
            {cart.totals.discountAgorot > 0 && (
              <div className="cart-summary__discount">
                <dt>{t('cart.totalDiscount')}</dt>
                <dd>−{formatPrice(fromAgorot(cart.totals.discountAgorot), locale)}</dd>
              </div>
            )}
            <div className="cart-summary__total">
              <dt>{t('cart.total')}</dt>
              <dd>{formatPrice(fromAgorot(cart.totals.totalAgorot), locale)}</dd>
            </div>
          </dl>

          <Button variant="success" size="lg" className="cart-summary__finish" onClick={finalise}>
            <Icon name="check" /> {t('cart.finalise')}
          </Button>
        </div>
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(sku) => void handleScan(sku)}
        onClose={() => setShowScanner(false)}
      />

      <AddToCartDialog
        pending={pending}
        onCancel={() => {
          scanAbortRef.current?.abort()
          setPending(null)
        }}
        onConfirm={(line) => {
          cart.addLine(line)
          setPending(null)
          // Straight back to the scanner: a basket is many items, and stopping
          // between each one is the difference between usable and not. Only for
          // scanned items though -- see pendingOriginRef.
          if (pendingOriginRef.current === 'scan') setShowScanner(true)
        }}
      />

      <DiscountDialog
        line={discountLine}
        onCancel={() => setDiscountLine(null)}
        onApply={(discount: Discount) => {
          if (discountLine) cart.setDiscount(discountLine.id, discount)
          setDiscountLine(null)
        }}
      />

      <ReceiptDialog
        show={showReceipt}
        lines={cart.lines}
        totals={cart.totals}
        issuedAt={issuedAt}
        onClose={() => setShowReceipt(false)}
        onNewBill={startNewBill}
      />

      <Modal show={confirmClear} onHide={() => setConfirmClear(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {t('cart.clear')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{t('cart.clearConfirm')}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              cart.clear()
              setConfirmClear(false)
            }}
          >
            {t('cart.clear')}
          </Button>
        </Modal.Footer>
      </Modal>

      {cart.unregisteredCount > 0 && (
        <p className="cart-page__register-link">
          <Link to="/create">{t('cart.registerNow')}</Link>
        </p>
      )}
    </div>
  )
}
