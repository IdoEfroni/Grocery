import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, InputGroup, Modal, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { NO_DISCOUNT } from '../../utils/money'
import type { CartLine } from '../../contexts/CartContext'
import './AddToCartDialog.css'

/**
 * An item on its way to the bill.
 *
 * `sku` is an empty string for an item that has no barcode -- loose bread and
 * the like, added by typing a name. Nothing merges lines by SKU, so blank ones
 * do not collide.
 */
export type PendingScan =
  | { status: 'looking'; sku: string }
  | { status: 'found'; sku: string; name: string; unitPrice: number; productId: string }
  | {
      status: 'unknown'
      sku: string
      /** Name from the price-comparison service, if it knew the barcode. */
      suggestedName: string | null
      /** External market average -- a starting point, never the shop's price. */
      suggestedPrice: number | null
      priceLoading: boolean
    }

export interface AddToCartDialogProps {
  pending: PendingScan | null
  onCancel: () => void
  onConfirm: (line: Omit<CartLine, 'id'>) => void
}

/**
 * Quantity, and for an unrecognised barcode the price too.
 *
 * A single dialog covers both outcomes because from the till's point of view it
 * is one step -- "how many, and what am I charging?" -- and splitting it would
 * put a decision between the scan and the basket.
 */
export default function AddToCartDialog({ pending, onCancel, onConfirm }: AddToCartDialogProps) {
  const { t } = useLanguage()
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [name, setName] = useState('')
  const qtyRef = useRef<HTMLInputElement | null>(null)

  // Reset whenever a new barcode arrives, and adopt the suggestion once the
  // background price lookup lands.
  useEffect(() => {
    if (!pending) return
    setQuantity('1')
    if (pending.status === 'found') {
      setName(pending.name)
      setPrice(String(pending.unitPrice))
    } else if (pending.status === 'unknown') {
      setName(pending.suggestedName ?? '')
      setPrice(pending.suggestedPrice != null ? String(pending.suggestedPrice) : '')
    }
  }, [pending])

  if (!pending) return null

  const isUnknown = pending.status === 'unknown'
  const quantityNum = Number(quantity)
  const priceNum = Number(price)
  const quantityValid = Number.isFinite(quantityNum) && quantityNum > 0
  const priceValid = Number.isFinite(priceNum) && priceNum >= 0 && price.trim() !== ''
  const canConfirm = quantityValid && priceValid && (!isUnknown || name.trim() !== '')

  const step = (delta: number) => {
    const next = Math.max((Number.isFinite(quantityNum) ? quantityNum : 0) + delta, 0)
    setQuantity(String(Number(next.toFixed(3))))
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      sku: pending.sku,
      name: name.trim(),
      unitPrice: priceNum,
      quantity: quantityNum,
      discount: NO_DISCOUNT,
      source: isUnknown ? 'manual' : 'catalog',
      productId: pending.status === 'found' ? pending.productId : undefined,
    })
  }

  return (
    <Modal
      show
      onHide={onCancel}
      centered
      onEntered={() => {
        qtyRef.current?.focus()
        qtyRef.current?.select()
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {isUnknown ? t('cart.addUnknownTitle') : t('cart.addTitle')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="add-to-cart">
        {pending.status === 'looking' && (
          <div className="text-center py-4" role="status">
            <Spinner animation="border" />
            <p className="text-muted mt-3 mb-0">{t('common.loading')}</p>
          </div>
        )}

        {pending.status !== 'looking' && (
          <>
            {/* A barcode-less item has nothing to show here, and an empty
                monospace line reads as a rendering fault. */}
            {pending.sku ? (
              <p className="add-to-cart__sku" dir="ltr">
                {pending.sku}
              </p>
            ) : (
              <p className="add-to-cart__sku add-to-cart__sku--none">
                {t('cart.noBarcodeItem')}
              </p>
            )}

            {isUnknown ? (
              <>
                <Alert variant="warning" className="add-to-cart__notice">
                  {t('cart.notInSystemNotice')}
                </Alert>

                <Form.Group className="mb-3">
                  <Form.Label htmlFor="cart-name">{t('createPage.nameLabel')}</Form.Label>
                  <Form.Control
                    id="cart-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('cart.namePlaceholder')}
                  />
                </Form.Group>
              </>
            ) : (
              <p className="add-to-cart__name">{name}</p>
            )}

            <Form.Group className="mb-3">
              <Form.Label htmlFor="cart-price">
                {isUnknown ? t('cart.priceToCharge') : t('createPage.priceLabel')}
              </Form.Label>
              <InputGroup className="add-to-cart__price">
                <InputGroup.Text aria-hidden="true">₪</InputGroup.Text>
                <Form.Control
                  id="cart-price"
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={price}
                  isInvalid={price.trim() !== '' && !priceValid}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </InputGroup>
              {/* The suggestion comes from a public comparison site, not the
                  shop. Saying so keeps it from being mistaken for a real price
                  that someone has already approved. */}
              {/* All three lines describe a barcode lookup. With no barcode none
                  was attempted, so saying "no suggestion was found" would report
                  a failure that never happened. */}
              {isUnknown && pending.sku !== '' && pending.priceLoading && (
                <Form.Text className="text-muted">{t('cart.fetchingSuggestion')}</Form.Text>
              )}
              {isUnknown &&
                pending.sku !== '' &&
                !pending.priceLoading &&
                pending.suggestedPrice != null && (
                  <Form.Text className="text-muted">{t('cart.suggestionSource')}</Form.Text>
                )}
              {isUnknown &&
                pending.sku !== '' &&
                !pending.priceLoading &&
                pending.suggestedPrice == null && (
                  <Form.Text className="text-muted">{t('cart.noSuggestion')}</Form.Text>
                )}
            </Form.Group>

            <Form.Group>
              <Form.Label htmlFor="cart-qty">{t('cart.quantity')}</Form.Label>
              <div className="add-to-cart__qty">
                <Button
                  variant="outline-secondary"
                  onClick={() => step(-1)}
                  aria-label={t('cart.decrease')}
                >
                  −
                </Button>
                <Form.Control
                  id="cart-qty"
                  ref={qtyRef}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={quantity}
                  isInvalid={!quantityValid}
                  onChange={(e) => setQuantity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canConfirm) handleConfirm()
                  }}
                />
                <Button
                  variant="outline-secondary"
                  onClick={() => step(1)}
                  aria-label={t('cart.increase')}
                >
                  +
                </Button>
              </div>
              {/* Fractional quantities are allowed on purpose: loose produce is
                  sold by weight. */}
              <Form.Text className="text-muted">{t('cart.quantityHelp')}</Form.Text>
            </Form.Group>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={!canConfirm} onClick={handleConfirm}>
          {t('cart.addToBill')}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
