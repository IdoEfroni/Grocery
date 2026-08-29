import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, InputGroup, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { comparePrices, createProduct } from '../../api/products'
import { COMPARE_RESULT_COUNT, SHOPPING_CITY } from '../../config'
import { useProductPhoto } from '../../hooks/useProductPhoto'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'
import CameraCapture from '../../components/CameraCapture/CameraCapture'
import ProductPhotoField from '../../components/ProductPhotoField/ProductPhotoField'

interface CreatePageState {
  prefillSku?: string
  /** Set when arriving from a scan that found no product. */
  autoFill?: boolean
}

interface FieldErrors {
  name?: string
  price?: string
  sku?: string
}

export default function CreatePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as CreatePageState

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [sku, setSku] = useState(state.prefillSku ?? '')

  const [showScanner, setShowScanner] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null)

  const photo = useProductPhoto()
  const autoFillAbortRef = useRef<AbortController | null>(null)

  const cameFromScan = Boolean(state.prefillSku)

  const fillFromCompare = useCallback(
    async (targetSku: string) => {
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

        // Only overwrite fields the user has not already filled in.
        let matched = false
        if (result.productName) {
          matched = true
          setName((current) => current || result.productName)
        }
        if (result.description) {
          setDescription((current) => current || result.description)
        }
        if (result.averagePrice && result.averagePrice !== 'N/A') {
          const parsed = Number.parseFloat(result.averagePrice)
          if (!Number.isNaN(parsed)) {
            matched = true
            setPrice((current) => current || String(parsed))
          }
        }
        if (!matched) setAutoFillNote(t('createPage.noAutoFillData'))
      } catch (err) {
        if (controller.signal.aborted) return
        setAutoFillNote(
          t('createPage.failedToFetch', { error: err instanceof Error ? err.message : String(err) }),
        )
      } finally {
        if (autoFillAbortRef.current === controller) {
          autoFillAbortRef.current = null
          setIsAutoFilling(false)
        }
      }
    },
    [t],
  )

  /**
   * When a scan found no product, the SKU is already known and both lookups
   * are certain to be wanted -- so run them on arrival instead of making the
   * user tap two more buttons.
   */
  const autoFillDoneRef = useRef(false)
  useEffect(() => {
    if (autoFillDoneRef.current) return
    if (!state.autoFill || !state.prefillSku) return
    autoFillDoneRef.current = true
    void fillFromCompare(state.prefillSku)
    void photo.searchOnline(state.prefillSku)
  }, [state.autoFill, state.prefillSku, fillFromCompare, photo])

  useEffect(() => {
    return () => autoFillAbortRef.current?.abort()
  }, [])

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = t('createPage.nameRequired')

    const priceNum = Number(price)
    if (price.trim() === '' || Number.isNaN(priceNum) || priceNum < 0) {
      errors.price = t('createPage.priceInvalid')
    }
    if (!sku.trim()) errors.sku = t('createPage.skuRequired')

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Guard against a double tap: a camera photo upload takes long enough on
    // cellular that an impatient second tap would create a duplicate product.
    if (submitting) return
    if (!validate()) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await createProduct({
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        sku: sku.trim(),
        ...photo.toUpsertFields(),
      })
      // Go to the product rather than clearing the form in place, which used
      // to strand the user with an empty SKU and no way to refill it.
      navigate(`/products/${created.id}`, { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  const skuReady = Boolean(sku.trim())

  return (
    <Card className="shadow-sm">
      <Card.Body>
        {cameFromScan && (
          <Alert variant="info" className="mb-4">
            {t('createPage.notFoundCreatePrompt', { sku: state.prefillSku ?? '' })}
          </Alert>
        )}

        <Form onSubmit={handleSubmit} className="text-start" noValidate>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="create-sku">{t('createPage.skuLabel')}</Form.Label>
            <InputGroup hasValidation>
              <Form.Control
                id="create-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
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
                <span aria-hidden="true">📷</span>
              </Button>
              <Form.Control.Feedback type="invalid">{fieldErrors.sku}</Form.Control.Feedback>
            </InputGroup>
          </Form.Group>

          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button
              type="button"
              variant="outline-primary"
              onClick={() => void fillFromCompare(sku)}
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
            <Button
              type="button"
              variant="outline-secondary"
              onClick={() => void photo.searchOnline(sku)}
              disabled={!skuReady || photo.isSearching}
            >
              {photo.isSearching ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  {t('createPage.searching')}
                </>
              ) : (
                t('createPage.searchImageFromWeb')
              )}
            </Button>
          </div>

          {autoFillNote && (
            <Alert variant="warning" dismissible onClose={() => setAutoFillNote(null)}>
              {autoFillNote}
            </Alert>
          )}

          <Form.Group className="mb-3">
            <Form.Label htmlFor="create-name">{t('createPage.nameLabel')}</Form.Label>
            <Form.Control
              id="create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              isInvalid={Boolean(fieldErrors.name)}
            />
            <Form.Control.Feedback type="invalid">{fieldErrors.name}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label htmlFor="create-description">{t('createPage.descriptionLabel')}</Form.Label>
            <Form.Control
              id="create-description"
              as="textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label htmlFor="create-price">{t('createPage.priceLabel')}</Form.Label>
            <Form.Control
              id="create-price"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              isInvalid={Boolean(fieldErrors.price)}
            />
            <Form.Control.Feedback type="invalid">{fieldErrors.price}</Form.Control.Feedback>
          </Form.Group>

          <ProductPhotoField photo={photo} onOpenCamera={() => setShowCamera(true)} />

          {submitError && (
            <Alert variant="danger" className="mt-3" dismissible onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <div className="d-flex gap-2 mt-4">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  {t('common.saving')}
                </>
              ) : (
                t('createPage.createProduct')
              )}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              disabled={submitting}
              onClick={() => {
                setName('')
                setDescription('')
                setPrice('')
                setSku('')
                setFieldErrors({})
                setSubmitError(null)
                photo.clear()
              }}
            >
              {t('common.reset')}
            </Button>
          </div>
        </Form>

        <BarcodeScanner
          isOpen={showScanner}
          onScan={(value) => {
            setSku(value)
            void fillFromCompare(value)
            void photo.searchOnline(value)
          }}
          onClose={() => setShowScanner(false)}
        />

        <CameraCapture
          isOpen={showCamera}
          onClose={() => setShowCamera(false)}
          onCapture={(file: File, objectUrl: string) => photo.setFile(file, 'camera', objectUrl)}
        />
      </Card.Body>
    </Card>
  )
}
