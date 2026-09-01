import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { comparePrices } from '../../api/products'
import { COMPARE_RESULT_COUNT, SHOPPING_CITY } from '../../config'
import { useProductPhoto } from '../../hooks/useProductPhoto'
import BarcodeScanner from '../BarcodeScanner/BarcodeScanner'
import CameraCapture from '../CameraCapture/CameraCapture'
import ProductPhotoField from '../ProductPhotoField/ProductPhotoField'
import Icon from '../Icon/Icon'
import './ProductForm.css'

export interface ProductFormValues {
  name: string
  description: string
  price: string
  sku: string
}

export interface ProductFormSubmit extends ProductFormValues {
  photoFile: File | null
  photoUrl: string | null
}

export interface ProductFormProps {
  initial?: Partial<ProductFormValues>
  /** Run the external autofill and image lookup once on mount. */
  autoFillOnMount?: boolean
  submitting: boolean
  submitLabel: string
  onSubmit: (values: ProductFormSubmit) => void
  submitError?: string | null
  onDismissError?: () => void
  currentPhotoUrl?: string | null
  /** Rendered next to the submit button (Reset on create, Delete on edit). */
  secondaryAction?: React.ReactNode
  onDirtyChange?: (dirty: boolean) => void
}

interface FieldErrors {
  name?: string
  price?: string
  sku?: string
}

const EMPTY: ProductFormValues = { name: '', description: '', price: '', sku: '' }

/**
 * The product fields shared by Create and Edit.
 *
 * These were two separate implementations that had already drifted -- Create
 * required a SKU and Edit did not, so the same product could be valid on one
 * screen and invalid on the other. One component means one set of rules.
 */
export default function ProductForm({
  initial,
  autoFillOnMount = false,
  submitting,
  submitLabel,
  onSubmit,
  submitError,
  onDismissError,
  currentPhotoUrl,
  secondaryAction,
  onDirtyChange,
}: ProductFormProps) {
  const { t } = useLanguage()
  const base = useMemo<ProductFormValues>(() => ({ ...EMPTY, ...initial }), [initial])

  const [values, setValues] = useState<ProductFormValues>(base)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [showScanner, setShowScanner] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null)

  const photo = useProductPhoto()
  const autoFillAbortRef = useRef<AbortController | null>(null)

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  // Dirty tracking drives the unsaved-changes guard in the parent.
  const isDirty =
    values.name !== base.name ||
    values.description !== base.description ||
    values.price !== base.price ||
    values.sku !== base.sku ||
    photo.photo.kind !== 'none'

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => () => autoFillAbortRef.current?.abort(), [])

  const fillFromCompare = async (targetSku: string, preferExisting: boolean) => {
    const trimmed = targetSku.trim()
    if (!trimmed) return

    autoFillAbortRef.current?.abort()
    const controller = new AbortController()
    autoFillAbortRef.current = controller

    setIsAutoFilling(true)
    setAutoFillNote(null)
    try {
      const result = await comparePrices(SHOPPING_CITY, trimmed, COMPARE_RESULT_COUNT, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      // On an automatic fill we only populate blanks; on an explicit tap the
      // user asked for these values, so they replace what is there.
      const merge = (current: string, incoming: string) =>
        preferExisting ? current || incoming : incoming || current

      let matched = false
      setValues((v) => {
        const next = { ...v }
        if (result.productName) {
          next.name = merge(v.name, result.productName)
          matched = true
        }
        if (result.description) next.description = merge(v.description, result.description)
        if (result.averagePrice && result.averagePrice !== 'N/A') {
          const parsed = Number.parseFloat(result.averagePrice)
          if (!Number.isNaN(parsed)) {
            next.price = merge(v.price, String(parsed))
            matched = true
          }
        }
        return next
      })
      if (!matched) setAutoFillNote(t('createPage.noAutoFillData'))
    } catch (err) {
      if (controller.signal.aborted) return
      setAutoFillNote(
        t('createPage.failedToFetch', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      if (autoFillAbortRef.current === controller) {
        autoFillAbortRef.current = null
        setIsAutoFilling(false)
      }
    }
  }

  const autoFilledRef = useRef(false)
  useEffect(() => {
    if (!autoFillOnMount || autoFilledRef.current || !base.sku) return
    autoFilledRef.current = true
    void fillFromCompare(base.sku, true)
    void photo.searchOnline(base.sku)
    // Intentionally runs once, keyed on the initial SKU.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFillOnMount, base.sku])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const errors: FieldErrors = {}
    if (!values.name.trim()) errors.name = t('createPage.nameRequired')
    if (!values.sku.trim()) errors.sku = t('createPage.skuRequired')
    const priceNum = Number(values.price)
    if (values.price.trim() === '' || Number.isNaN(priceNum) || priceNum < 0) {
      errors.price = t('createPage.priceInvalid')
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      price: values.price,
      sku: values.sku.trim(),
      ...photo.toUpsertFields(),
    })
  }

  const skuReady = Boolean(values.sku.trim())

  return (
    <Form onSubmit={handleSubmit} className="product-form" noValidate>
      <Form.Group className="product-form__group">
        <Form.Label htmlFor="pf-sku">{t('createPage.skuLabel')}</Form.Label>
        <InputGroup hasValidation>
          <Form.Control
            id="pf-sku"
            value={values.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder={t('createPage.skuPlaceholder')}
            isInvalid={Boolean(fieldErrors.sku)}
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button
            variant="outline-secondary"
            onClick={() => setShowScanner(true)}
            aria-label={t('browsePage.scanBarcode')}
            title={t('browsePage.scanBarcode')}
          >
            <Icon name="barcode" />
          </Button>
          <Form.Control.Feedback type="invalid">{fieldErrors.sku}</Form.Control.Feedback>
        </InputGroup>
      </Form.Group>

      <div className="product-form__assist">
        <Button
          type="button"
          variant="outline-primary"
          onClick={() => void fillFromCompare(values.sku, false)}
          disabled={!skuReady || isAutoFilling}
        >
          {isAutoFilling ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              {t('common.loading')}
            </>
          ) : (
            t('createPage.fillAutomatically')
          )}
        </Button>
      </div>

      {autoFillNote && (
        <Alert variant="warning" dismissible onClose={() => setAutoFillNote(null)}>
          {autoFillNote}
        </Alert>
      )}

      <Form.Group className="product-form__group">
        <Form.Label htmlFor="pf-name">{t('createPage.nameLabel')}</Form.Label>
        <Form.Control
          id="pf-name"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          isInvalid={Boolean(fieldErrors.name)}
        />
        <Form.Control.Feedback type="invalid">{fieldErrors.name}</Form.Control.Feedback>
      </Form.Group>

      <Form.Group className="product-form__group">
        <Form.Label htmlFor="pf-price">{t('createPage.priceLabel')}</Form.Label>
        <InputGroup hasValidation className="product-form__price">
          <InputGroup.Text aria-hidden="true">₪</InputGroup.Text>
          <Form.Control
            id="pf-price"
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={values.price}
            onChange={(e) => set('price', e.target.value)}
            isInvalid={Boolean(fieldErrors.price)}
          />
          <Form.Control.Feedback type="invalid">{fieldErrors.price}</Form.Control.Feedback>
        </InputGroup>
      </Form.Group>

      <Form.Group className="product-form__group">
        <Form.Label htmlFor="pf-description">{t('createPage.descriptionLabel')}</Form.Label>
        <Form.Control
          id="pf-description"
          as="textarea"
          rows={3}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </Form.Group>

      <ProductPhotoField
        photo={photo}
        onOpenCamera={() => setShowCamera(true)}
        currentPhotoUrl={currentPhotoUrl}
        sku={values.sku}
        productName={values.name}
      />

      {submitError && (
        <Alert variant="danger" className="mt-3" dismissible onClose={onDismissError}>
          {submitError}
        </Alert>
      )}

      <div className="product-form__actions">
        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              {t('common.saving')}
            </>
          ) : (
            submitLabel
          )}
        </Button>
        {secondaryAction}
      </div>

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(value) => {
          set('sku', value)
          void fillFromCompare(value, true)
          void photo.searchOnline(value)
        }}
        onClose={() => setShowScanner(false)}
      />

      <CameraCapture
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(file, objectUrl) => photo.setFile(file, 'camera', objectUrl)}
      />
    </Form>
  )
}
