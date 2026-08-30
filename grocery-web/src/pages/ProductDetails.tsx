import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Modal, Spinner } from 'react-bootstrap'
import { useLanguage } from '../contexts/LanguageContext'
import { deleteProduct, getPhotoUrl, getProductById, updateProduct, type Product } from '../api/products'
import ProductForm, { type ProductFormSubmit } from '../components/ProductForm/ProductForm'
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning'
import Icon from '../components/Icon/Icon'

/** Edit form for an existing product. Reached deliberately from the price view. */
export default function ProductDetails() {
  const { t } = useLanguage()
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useUnsavedChangesWarning(dirty && !saving && !deleting)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)

    getProductById(id, { signal: controller.signal })
      .then((p) => {
        if (!controller.signal.aborted) setProduct(p)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [id])

  const handleSave = async (values: ProductFormSubmit) => {
    setSaving(true)
    setSaveError(null)
    try {
      await updateProduct(id, {
        name: values.name,
        description: values.description || null,
        price: Number(values.price),
        sku: values.sku || null,
        photoFile: values.photoFile,
        photoUrl: values.photoUrl,
      })
      setDirty(false)
      // Return to the price view so the new price is confirmed where it is read.
      navigate(`/products/${id}`, { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setConfirmDelete(false)
    setDeleting(true)
    try {
      await deleteProduct(id)
      setDirty(false)
      navigate('/view', { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="page-center" role="status">
        <Spinner animation="border" />
        <p className="text-muted mt-3 mb-0">{t('common.loading')}</p>
      </div>
    )
  }

  if (loadError) return <Alert variant="danger">{loadError}</Alert>
  if (!product) return <Alert variant="warning">{t('common.notFound')}</Alert>

  return (
    <div className="page-narrow">
      <Link to={`/products/${id}`} className="page-back">
        <Icon name="chevron" className="page-back__icon" /> {t('lookup.backToPrice')}
      </Link>

      <Card>
        <Card.Body>
          <h1 className="page-title">{t('productDetails.updateProduct')}</h1>
          <ProductForm
            initial={{
              name: product.name ?? '',
              description: product.description ?? '',
              price: String(product.price ?? ''),
              sku: product.sku ?? '',
            }}
            submitting={saving}
            submitLabel={t('common.save')}
            onSubmit={handleSave}
            submitError={saveError}
            onDismissError={() => setSaveError(null)}
            onDirtyChange={setDirty}
            currentPhotoUrl={product.sku ? getPhotoUrl(product.sku) : null}
            secondaryAction={
              <Button
                type="button"
                variant="outline-danger"
                className="product-form__danger"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deleting}
              >
                <Icon name="trash" /> {deleting ? t('common.deleting') : t('common.delete')}
              </Button>
            }
          />
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
    </div>
  )
}
