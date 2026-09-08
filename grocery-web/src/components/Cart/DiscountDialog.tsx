import { useEffect, useState } from 'react'
import { Button, Form, InputGroup, Modal } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  discountAmountAgorot,
  fromAgorot,
  lineSubtotalAgorot,
  type Discount,
} from '../../utils/money'
import { formatPrice } from '../../utils/formatPrice'
import type { CartLine } from '../../contexts/CartContext'
import './DiscountDialog.css'

export interface DiscountDialogProps {
  line: CartLine | null
  onCancel: () => void
  onApply: (discount: Discount) => void
}

type Mode = 'percent' | 'amount'

/**
 * Per-line discount, as a percentage or a straight reduction.
 *
 * The running arithmetic is shown as the value is typed, because "take one off"
 * is ambiguous on a line of three: this makes it plain that the reduction
 * applies to the line total rather than per unit, without anyone having to read
 * a rule about it.
 */
export default function DiscountDialog({ line, onCancel, onApply }: DiscountDialogProps) {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'

  const [mode, setMode] = useState<Mode>('percent')
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!line) return
    if (line.discount.kind === 'none') {
      setMode('percent')
      setValue('')
    } else {
      setMode(line.discount.kind)
      setValue(String(line.discount.value))
    }
  }, [line])

  if (!line) return null

  const numeric = Number(value)
  const valid = value.trim() === '' || (Number.isFinite(numeric) && numeric >= 0)
  const draft: Discount =
    value.trim() === '' || !Number.isFinite(numeric) || numeric <= 0
      ? { kind: 'none' }
      : { kind: mode, value: numeric }

  const subtotal = lineSubtotalAgorot(line.unitPrice, line.quantity)
  const reduction = discountAmountAgorot(subtotal, draft)
  const after = subtotal - reduction

  return (
    <Modal show onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {t('cart.discountTitle')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="discount-dialog">
        <p className="discount-dialog__product">{line.name}</p>

        <div className="discount-dialog__modes" role="radiogroup" aria-label={t('cart.discountKind')}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'percent'}
            className={`discount-dialog__mode${mode === 'percent' ? ' is-selected' : ''}`}
            onClick={() => setMode('percent')}
          >
            {t('cart.discountPercent')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'amount'}
            className={`discount-dialog__mode${mode === 'amount' ? ' is-selected' : ''}`}
            onClick={() => setMode('amount')}
          >
            {t('cart.discountAmount')}
          </button>
        </div>

        <Form.Group className="mt-3">
          <Form.Label htmlFor="discount-value" className="visually-hidden">
            {t('cart.discountTitle')}
          </Form.Label>
          <InputGroup>
            <InputGroup.Text aria-hidden="true">{mode === 'percent' ? '%' : '₪'}</InputGroup.Text>
            <Form.Control
              id="discount-value"
              type="number"
              min={0}
              max={mode === 'percent' ? 100 : undefined}
              step={mode === 'percent' ? 1 : 0.01}
              inputMode="decimal"
              value={value}
              isInvalid={!valid}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) onApply(draft)
              }}
            />
          </InputGroup>
        </Form.Group>

        {/* The sum, spelled out. */}
        <dl className="discount-dialog__maths">
          <div>
            <dt>
              {line.quantity} × {formatPrice(line.unitPrice, locale)}
            </dt>
            <dd>{formatPrice(fromAgorot(subtotal), locale)}</dd>
          </div>
          <div className="discount-dialog__reduction">
            <dt>{t('cart.discountLabel')}</dt>
            <dd>−{formatPrice(fromAgorot(reduction), locale)}</dd>
          </div>
          <div className="discount-dialog__result">
            <dt>{t('cart.lineTotal')}</dt>
            <dd>{formatPrice(fromAgorot(after), locale)}</dd>
          </div>
        </dl>
      </Modal.Body>

      <Modal.Footer>
        {line.discount.kind !== 'none' && (
          <Button variant="outline-danger" onClick={() => onApply({ kind: 'none' })}>
            {t('cart.removeDiscount')}
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={!valid} onClick={() => onApply(draft)}>
          {t('common.save')}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
