import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { createProduct } from '../../api/products'
import ProductForm, { type ProductFormSubmit } from '../../components/ProductForm/ProductForm'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'

interface CreatePageState {
  prefillSku?: string
  /** Carried over from a name search that found nothing. */
  prefillName?: string
  /** Set when arriving from a scan that found no product. */
  autoFill?: boolean
}

export default function CreatePage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as CreatePageState

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useUnsavedChangesWarning(dirty && !submitting)

  const handleSubmit = async (values: ProductFormSubmit) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await createProduct({
        name: values.name,
        description: values.description || null,
        price: Number(values.price),
        sku: values.sku,
        photoFile: values.photoFile,
        photoUrl: values.photoUrl,
      })
      setDirty(false)
      // Land on the price view so the new price is confirmed on the screen
      // people actually read.
      navigate(`/products/${created.id}`, { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="page-narrow">
      {state.prefillSku && (
        <Alert variant="info" className="mb-4">
          {t('createPage.notFoundCreatePrompt', { sku: state.prefillSku })}
        </Alert>
      )}

      <Card>
        <Card.Body>
          <h1 className="page-title">{t('navigation.create')}</h1>
          <ProductForm
            initial={{ sku: state.prefillSku ?? '', name: state.prefillName ?? '' }}
            autoFillOnMount={Boolean(state.autoFill)}
            submitting={submitting}
            submitLabel={t('createPage.createProduct')}
            onSubmit={handleSubmit}
            submitError={submitError}
            onDismissError={() => setSubmitError(null)}
            onDirtyChange={setDirty}
            secondaryAction={
              <Button
                type="button"
                variant="outline-secondary"
                disabled={submitting}
                onClick={() => navigate(-1)}
              >
                {t('common.cancel')}
              </Button>
            }
          />
        </Card.Body>
      </Card>
    </div>
  )
}
