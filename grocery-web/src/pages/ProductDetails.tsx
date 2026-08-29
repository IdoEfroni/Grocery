import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Form, Modal, Spinner } from 'react-bootstrap'
import { useLanguage } from '../contexts/LanguageContext'
import {
  comparePrices,
  deleteProduct,
  getPhotoUrl,
  getProductById,
  updateProduct,
  type Product,
} from '../api/products'
import { COMPARE_RESULT_COUNT, SHOPPING_CITY } from '../config'
import { useProductPhoto } from '../hooks/useProductPhoto'
import CameraCapture from '../components/CameraCapture/CameraCapture'
import ProductPhotoField from '../components/ProductPhotoField/ProductPhotoField'

interface FieldErrors {
  name?: string
  price?: string
}

export default function ProductDetails() {
  const { t } = useLanguage()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [sku, setSku] = useState('')

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null)
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  const photo = useProductPhoto()
  const autoFillAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)

    getProductById(id, { signal: controller.signal })
      .then((p) => {
        if (controller.signal.aborted) return
        setProduct(p)
        setName(p.name ?? '')
        setDescription(p.description ?? '')
        setPrice(String(p.price ?? ''))
        setSku(p.sku ?? '')
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [id])

  useEffect(() => () => autoFillAbortRef.current?.abort(), [])

  const fillFromCompare = useCallback(async () => {
    const trimmed = sku.trim()
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

      // On an existing product the user asked for these values explicitly, so
      // unlike the create form they do overwrite what is already there.
      if (result.productName) setName(result.productName)
      if (result.description) setDescription(result.description)
      if (result.averagePrice && result.averagePrice !== 'N/A') {
        const parsed = Number.parseFloat(result.averagePrice)
        if (!Number.isNaN(parsed)) setPrice(String(parsed))
      }
      if (!result.productName && !result.description) {
        setAutoFillNote(t('createPage.noAutoFillData'))
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setAutoFillNote(
        t('productDetails.failedToFetch', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      if (autoFillAbortRef.current === controller) {
        autoFillAbortRef.current = null
        setIsAutoFilling(false)
      }
    }
  }, [sku, t])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || !id) return

    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = t('productDetails.nameRequired')
    const priceNum = Number(price)
    if (price.trim() === '' || Number.isNaN(priceNum) || priceNum < 0) {
      errors.price = t('productDetails.priceInvalid')
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateProduct(id, {
        name: name.trim(),
        description: description.trim() || null,
        price: priceNum,
        sku: sku.trim() || null,
        ...photo.toUpsertFields(),
      })
      setProduct(updated)
      photo.clear()
      setSavedNotice(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    setConfirmDelete(false)
    setDeleting(true)
    try {
      await deleteProduct(id)
      navigate('/view', { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" role="status" />
        <p className="text-muted mt-3 mb-0">{t('common.loading')}</p>
      </div>
    )
  }

  if (loadError) return <Alert variant="danger">{loadError}</Alert>
  if (!product) return <Alert variant="warning">{t('common.notFound')}</Alert>

  const currentPhotoUrl = product.sku ? getPhotoUrl(product.sku) : null

  return (
    <div className="product-details">
      <div className="mb-3">
        <Link to="/view">← {t('productDetails.backToList')}</Link>
      </div>

      <Card className="shadow-sm">
        <Card.Body>
          <h1 className="h4 mb-4">{t('productDetails.updateProduct')}</h1>

          {savedNotice && (
            <Alert variant="success" dismissible onClose={() => setSavedNotice(false)}>
              {t('productDetails.productUpdated')}
            </Alert>
          )}

          <Form onSubmit={handleSave} className="text-start" noValidate>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="details-sku">{t('common.sku')}</Form.Label>
              <Form.Control
                id="details-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
              />
            </Form.Group>

            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button
                type="button"
                variant="outline-primary"
                onClick={() => void fillFromCompare()}
                disabled={!sku.trim() || isAutoFilling}
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
                disabled={!sku.trim() || photo.isSearching}
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
              <Form.Label htmlFor="details-name">{t('common.name')}</Form.Label>
              <Form.Control
                id="details-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                isInvalid={Boolean(fieldErrors.name)}
              />
              <Form.Control.Feedback type="invalid">{fieldErrors.name}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label htmlFor="details-description">{t('common.description')}</Form.Label>
              <Form.Control
                id="details-description"
                as="textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label htmlFor="details-price">{t('common.price')}</Form.Label>
              <Form.Control
                id="details-price"
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

            <ProductPhotoField
              photo={photo}
              onOpenCamera={() => setShowCamera(true)}
              currentPhotoUrl={currentPhotoUrl}
            />

            {saveError && (
              <Alert variant="danger" className="mt-3" dismissible onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}

            <div className="d-flex flex-wrap gap-2 mt-4">
              <Button type="submit" variant="primary" disabled={saving || deleting}>
                {saving ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    {t('common.saving')}
                  </>
                ) : (
                  t('common.save')
                )}
              </Button>
              <Button
                type="button"
                variant="outline-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deleting}
              >
                {deleting ? t('common.deleting') : t('common.delete')}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      <Modal show={confirmDelete} onHide={() => setConfirmDelete(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {t('common.delete')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{t('productDetails.deleteConfirm', { name: product.name })}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()}>
            {t('common.delete')}
          </Button>
        </Modal.Footer>
      </Modal>

      <CameraCapture
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(file: File, objectUrl: string) => photo.setFile(file, 'camera', objectUrl)}
      />
    </div>
  )
}
