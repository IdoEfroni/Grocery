import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import { getProductById, type Product } from '../../api/products'
import ProductPriceCard from '../../components/ProductPriceCard/ProductPriceCard'
import QuickPriceEdit from '../../components/QuickPriceEdit/QuickPriceEdit'
import BarcodeScanner from '../../components/BarcodeScanner/BarcodeScanner'

/**
 * Price view for a product reached by id (from the list, or after creating one).
 *
 * Renders the same card as the scan lookup, so a product looks identical
 * however it was reached and editing is always a deliberate second step.
 */
export default function ProductPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    getProductById(id, { signal: controller.signal })
      .then((p) => {
        if (!controller.signal.aborted) setProduct(p)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [id])

  if (loading) {
    return (
      <div className="page-center" role="status">
        <Spinner animation="border" />
        <p className="text-muted mt-3 mb-0">{t('common.loading')}</p>
      </div>
    )
  }

  if (error) return <Alert variant="danger">{error}</Alert>
  if (!product) return <Alert variant="warning">{t('common.notFound')}</Alert>

  return (
    <>
      <ProductPriceCard
        product={product}
        onEdit={() => navigate(`/products/${product.id}/edit`)}
        onScanNext={() => setShowScanner(true)}
        onEditPrice={() => setEditingPrice(true)}
      />

      <QuickPriceEdit
        product={product}
        isOpen={editingPrice}
        onClose={() => setEditingPrice(false)}
        onSaved={setProduct}
      />

      <BarcodeScanner
        isOpen={showScanner}
        onScan={(value) => navigate(`/lookup/${encodeURIComponent(value)}`)}
        onClose={() => setShowScanner(false)}
      />

      <div className="text-center mt-4">
        <Button variant="link" onClick={() => navigate('/view')}>
          {t('productDetails.backToList')}
        </Button>
      </div>
    </>
  )
}
