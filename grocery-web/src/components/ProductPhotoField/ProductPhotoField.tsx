import { useId, useRef, useState } from 'react'
import { Alert, Button, Form, Image, Spinner } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import Icon from '../Icon/Icon'
import { buildImageSearchUrl, canReadClipboardImages } from '../../api/productImage'
import type { UseProductPhotoResult } from '../../hooks/useProductPhoto'
import './ProductPhotoField.css'

export interface ProductPhotoFieldProps {
  photo: UseProductPhotoResult
  onOpenCamera: () => void
  /** Existing photo URL to show when nothing new has been chosen. */
  currentPhotoUrl?: string | null
  /** Enables the barcode-based lookup and the manual search link. */
  sku?: string
  productName?: string
}

/**
 * Photo picker shared by the create and edit forms.
 *
 * Every way of getting a photo lives here in one row, rather than the lookup
 * button sitting apart from the controls it feeds.
 *
 * The lookup is best-effort. Open Food Facts only covers a minority of Israeli
 * barcodes, so a miss is the common case and is presented as "nothing found"
 * with a way forward -- a search link that opens in the phone's own browser --
 * rather than as an error. The previous behaviour showed a red failure on
 * essentially every product.
 */
export default function ProductPhotoField({
  photo,
  onOpenCamera,
  currentPhotoUrl,
  sku,
  productName,
}: ProductPhotoFieldProps) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const urlFieldId = useId()

  const skuReady = Boolean(sku?.trim())
  const canPaste = canReadClipboardImages()

  const previewSrc =
    photo.photo.kind === 'file'
      ? photo.photo.previewUrl
      : photo.photo.kind === 'url'
        ? photo.photo.url
        : (currentPhotoUrl ?? null)

  const originLabel =
    photo.photo.kind === 'file'
      ? t(`createPage.photoFrom.${photo.photo.origin}`)
      : photo.photo.kind === 'url'
        ? t('createPage.photoFrom.url')
        : null

  return (
    <Form.Group className="product-photo-field">
      <Form.Label as="p" className="fw-semibold mb-2">
        {t('createPage.photoUploadMode')}
      </Form.Label>

      <div className="product-photo-field__actions">
        <Button type="button" variant="outline-secondary" onClick={onOpenCamera}>
          <Icon name="camera" /> {t('createPage.camera')}
        </Button>
        <Button
          type="button"
          variant="outline-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="image" /> {t('createPage.fileUpload')}
        </Button>
        <Button
          type="button"
          variant="outline-secondary"
          onClick={() => void photo.searchOnline(sku ?? '')}
          disabled={!skuReady || photo.isSearching}
          title={skuReady ? undefined : t('createPage.skuRequiredForImage')}
        >
          {photo.isSearching ? (
            <>
              <Spinner animation="border" size="sm" /> {t('createPage.searching')}
            </>
          ) : (
            <>
              <Icon name="search" /> {t('createPage.findOnline')}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline-secondary"
          onClick={() => setShowUrlInput((v) => !v)}
          aria-expanded={showUrlInput}
        >
          <Icon name="link" /> {t('createPage.url')}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="d-none"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) photo.setFile(file, 'upload')
        }}
      />

      {showUrlInput && (
        <div className="product-photo-field__url">
          <Form.Label htmlFor={urlFieldId} className="visually-hidden">
            {t('createPage.photoUrl')}
          </Form.Label>
          <Form.Control
            id={urlFieldId}
            type="url"
            inputMode="url"
            value={urlDraft}
            placeholder={t('createPage.photoUrlPlaceholder')}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => photo.setUrl(urlDraft)}
          />
          <Button type="button" variant="outline-primary" onClick={() => photo.setUrl(urlDraft)}>
            {t('common.preview')}
          </Button>
        </div>
      )}

      {/* The semi-automatic path: the search happens in the phone's own
          browser, so nothing can block it and the person can see whether the
          picture is actually the right product before taking it. */}
      {photo.notFound && skuReady && (
        <Alert variant="secondary" className="product-photo-field__hint">
          <p className="mb-2">{t('createPage.noImageFoundOnline')}</p>
          <div className="product-photo-field__hint-actions">
            <Button
              variant="primary"
              href={buildImageSearchUrl(sku ?? '', productName)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="search" /> {t('createPage.searchInBrowser')}
            </Button>
            {canPaste && (
              <Button variant="outline-secondary" onClick={() => void photo.pasteFromClipboard()}>
                {t('createPage.pasteImage')}
              </Button>
            )}
          </div>
          <p className="product-photo-field__hint-help mb-0">
            {canPaste ? t('createPage.searchThenPasteHelp') : t('createPage.searchThenSaveHelp')}
          </p>
        </Alert>
      )}

      {photo.searchError && (
        <Alert variant="warning" className="mt-3 mb-0">
          {photo.searchError === 'clipboard-empty'
            ? t('createPage.clipboardEmpty')
            : photo.searchError === 'clipboard-denied'
              ? t('createPage.clipboardDenied')
              : t('createPage.failedToSearchImage', { error: photo.searchError })}
        </Alert>
      )}

      {previewSrc && (
        <figure className="product-photo-field__preview">
          <Image src={previewSrc} alt={t('createPage.imagePreview')} fluid rounded />
          <figcaption>
            {originLabel ? (
              <span className="text-muted small">{originLabel}</span>
            ) : (
              <span className="text-muted small">{t('common.current')}</span>
            )}
            {photo.photo.kind !== 'none' && (
              <Button type="button" variant="link" size="sm" onClick={photo.clear}>
                {t('createPage.removePhoto')}
              </Button>
            )}
          </figcaption>
        </figure>
      )}
    </Form.Group>
  )
}
