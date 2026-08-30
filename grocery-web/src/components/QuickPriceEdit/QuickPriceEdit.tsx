import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, InputGroup, Modal, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { updateProduct, type Product } from '../../api/products'
import { formatPrice } from '../../utils/formatPrice'
import './QuickPriceEdit.css'

export interface QuickPriceEditProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  onSaved: (updated: Product) => void
}

/**
 * Change one price, without opening the full edit form.
 *
 * Updating prices is half of what this app is for, and doing it through the
 * edit form meant six steps and a screen of fields nobody intended to touch.
 * This is the two-tap path: tap the price, type the new one, save.
 *
 * The API takes a whole product on update, so the untouched fields are sent
 * back unchanged. No photo fields are sent, which the API treats as "leave the
 * photo alone" rather than as a removal.
 */
export default function QuickPriceEdit({ product, isOpen, onClose, onSaved }: QuickPriceEditProps) {
  const { t, language } = useLanguage()
  const locale = language === 'he' ? 'he-IL' : 'en-IL'

  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen || !product) return
    setPrice(String(product.price ?? ''))
    setError(null)
    setSaving(false)
  }, [isOpen, product])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || !product) return

    const priceNum = Number(price)
    if (price.trim() === '' || Number.isNaN(priceNum) || priceNum < 0) {
      setError(t('createPage.priceInvalid'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await updateProduct(product.id, {
        name: product.name,
        description: product.description,
        price: priceNum,
        sku: product.sku,
      })
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  if (!product) return null

  const changed = Number(price) !== product.price && price.trim() !== ''

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      // Focus the field on open so the keypad is up and the value ready to
      // overwrite -- this runs many times in a row on a price round.
      onEntered={() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }}
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {t('quickPrice.title')}
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit}>
        <Modal.Body className="quick-price">
          <p className="quick-price__product">{product.name}</p>
          <p className="quick-price__current">
            {t('quickPrice.currentPrice')} <strong>{formatPrice(product.price, locale)}</strong>
          </p>

          <Form.Label htmlFor="quick-price-input" className="quick-price__label">
            {t('quickPrice.newPrice')}
          </Form.Label>
          <InputGroup className="quick-price__input">
            <InputGroup.Text aria-hidden="true">₪</InputGroup.Text>
            <Form.Control
              id="quick-price-input"
              ref={inputRef}
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              isInvalid={Boolean(error)}
              autoComplete="off"
            />
          </InputGroup>

          {error && (
            <Alert variant="danger" className="mt-3 mb-0">
              {error}
            </Alert>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !changed}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {t('common.saving')}
              </>
            ) : (
              t('quickPrice.savePrice')
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}
