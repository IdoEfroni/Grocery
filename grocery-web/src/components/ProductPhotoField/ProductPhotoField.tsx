import { useId, useRef, useState } from 'react'
import { Alert, Button, Form, Image } from 'react-bootstrap'
import { useLanguage } from '../../contexts/LanguageContext'
import type { UseProductPhotoResult } from '../../hooks/useProductPhoto'
import './ProductPhotoField.css'

export interface ProductPhotoFieldProps {
  photo: UseProductPhotoResult
  onOpenCamera: () => void
  /** Existing photo URL to show when nothing new has been chosen. */
  currentPhotoUrl?: string | null
}

/**
 * Photo picker shared by the create and edit forms.
 *
 * Shows one preview reflecting the single source of truth in `useProductPhoto`,
 * so the control can never claim "no file chosen" while a file is staged.
 */
export default function ProductPhotoField({
  photo,
  onOpenCamera,
  currentPhotoUrl,
}: ProductPhotoFieldProps) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const urlFieldId = useId()

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
        <Button type="button" variant="outline-secondary" onClick={() => fileInputRef.current?.click()}>
          <span aria-hidden="true">🖼️</span> {t('createPage.fileUpload')}
        </Button>
        <Button type="button" variant="outline-secondary" onClick={onOpenCamera}>
          <span aria-hidden="true">📷</span> {t('createPage.camera')}
        </Button>
        <Button
          type="button"
          variant="outline-secondary"
          onClick={() => setShowUrlInput((v) => !v)}
          aria-expanded={showUrlInput}
        >
          <span aria-hidden="true">🔗</span> {t('createPage.url')}
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

      {photo.searchError && (
        <Alert variant="warning" className="mt-3 mb-0">
          {t('createPage.failedToSearchImage', { error: photo.searchError })}
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
