import { Button, Modal } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { fromAgorot, lineSubtotalAgorot, lineTotalAgorot, formatDiscount } from '../../utils/money'
import { formatPrice } from '../../utils/formatPrice'
import type { CartLine } from '../../contexts/CartContext'
import type { Totals } from '../../utils/money'
import './ReceiptDialog.css'

export interface ReceiptDialogProps {
  show: boolean
  lines: CartLine[]
  totals: Totals
  /** Fixed when the bill is finalised, so it does not tick while on screen. */
  issuedAt: Date | null
  onClose: () => void
  onNewBill: () => void
}

/**
 * The finished bill.
 *
 * Laid out as a narrow single column in the proportions of till roll, and the
 * print stylesheet sizes the page to a 58 mm roll with a 48 mm image, matching
 * the 384 dots these printers lay down at 203 dpi.
 *
 * Printing goes through `window.print()` and the operating system's print
 * pipeline rather than by driving the printer directly over Bluetooth. That is
 * a deliberate choice, not a placeholder:
 *
 * - The OS path rasterises the page, so **Hebrew prints correctly**. The
 *   ESC/POS text mode these printers expose carries no Hebrew code page, and
 *   this shop's receipts are Hebrew by default.
 * - Web Bluetooth does not exist on iOS Safari, and it cannot see Bluetooth
 *   Classic SPP at all -- which is what much of this hardware speaks.
 *
 * On Android the roll is reached through a print service (RawBT and the like);
 * on Windows through the vendor driver. Both appear as an ordinary printer in
 * the system print dialog.
 *
 * Nothing is stored server-side yet -- there is no bills endpoint -- so closing
 * this ends the record of the transaction.
 */
export default function ReceiptDialog({
  show,
  lines,
  totals,
  issuedAt,
  onClose,
  onNewBill,
}: ReceiptDialogProps) {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <Modal show={show} onHide={onClose} centered scrollable>
      <Modal.Header closeButton className="d-print-none">
        <Modal.Title as="h2" className="h5">
          {t('cart.receiptTitle')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <div className="receipt" id="receipt">
          <header className="receipt__head">
            <h3 className="receipt__shop">{t('app.title')}</h3>
            {issuedAt && (
              <p className="receipt__date">
                {issuedAt.toLocaleDateString(locale)} {issuedAt.toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </header>

          <ul className="receipt__lines">
            {lines.map((line) => {
              const subtotal = lineSubtotalAgorot(line.unitPrice, line.quantity)
              const total = lineTotalAgorot(line.unitPrice, line.quantity, line.discount)
              const discountLabel = formatDiscount(line.discount)

              return (
                <li key={line.id} className="receipt__line">
                  <div className="receipt__line-main">
                    <span className="receipt__line-name">{line.name}</span>
                    <span className="receipt__line-total">
                      {formatPrice(fromAgorot(total), locale)}
                    </span>
                  </div>
                  <div className="receipt__line-detail">
                    <span>
                      {line.quantity} × {formatPrice(line.unitPrice, locale)}
                    </span>
                    {discountLabel && (
                      <span className="receipt__line-discount">
                        {t('cart.discountLabel')} {discountLabel} (−
                        {formatPrice(fromAgorot(subtotal - total), locale)})
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <dl className="receipt__totals">
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{formatPrice(fromAgorot(totals.subtotalAgorot), locale)}</dd>
            </div>
            {totals.discountAgorot > 0 && (
              <div className="receipt__totals-discount">
                <dt>{t('cart.totalDiscount')}</dt>
                <dd>−{formatPrice(fromAgorot(totals.discountAgorot), locale)}</dd>
              </div>
            )}
            <div className="receipt__totals-final">
              <dt>{t('cart.total')}</dt>
              <dd>{formatPrice(fromAgorot(totals.totalAgorot), locale)}</dd>
            </div>
          </dl>

          <footer className="receipt__foot">
            <p>{t('cart.itemsCount', { count: String(itemCount) })}</p>
            <p>{t('cart.thankYou')}</p>
          </footer>
        </div>
      </Modal.Body>

      <Modal.Footer className="d-print-none receipt-footer">
        <p className="receipt-footer__hint">{t('cart.printHint')}</p>
        <div className="receipt-footer__actions">
          <Button variant="outline-secondary" onClick={onClose}>
            {t('cart.backToBill')}
          </Button>
          <Button variant="outline-primary" onClick={() => window.print()}>
            {t('cart.print')}
          </Button>
          <Button variant="primary" onClick={onNewBill}>
            {t('cart.newBill')}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
