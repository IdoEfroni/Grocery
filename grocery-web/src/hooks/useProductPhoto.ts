import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchImageBySku } from '../api/products'

export type PhotoOrigin = 'upload' | 'camera' | 'web'

export type PhotoSelection =
  | { kind: 'none' }
  | { kind: 'file'; file: File; previewUrl: string; origin: PhotoOrigin }
  | { kind: 'url'; url: string }

export interface UseProductPhotoResult {
  photo: PhotoSelection
  setFile: (file: File, origin: PhotoOrigin, previewUrl?: string) => void
  setUrl: (url: string) => void
  clear: () => void
  searchOnline: (sku: string) => Promise<void>
  isSearching: boolean
  searchError: string | null
  /** The file/url pair to send to the API. */
  toUpsertFields: () => { photoFile: File | null; photoUrl: string | null }
}

/**
 * Owns product photo selection for the create and edit forms.
 *
 * Replaces a radio-button "photo mode" that could silently disagree with the
 * real state: picking an image from the web set mode to 'file', but a file
 * input cannot be populated programmatically, so the control read
 * "No file chosen" while a file was in fact staged. Modelling the selection as
 * one discriminated union makes that disagreement unrepresentable.
 */
export function useProductPhoto(): UseProductPhotoResult {
  const [photo, setPhoto] = useState<PhotoSelection>({ kind: 'none' })
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Object URLs must be revoked exactly once, and only after nothing renders
  // them. Tracking the live one in a ref keeps that independent of render.
  const objectUrlRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      releaseObjectUrl()
      abortRef.current?.abort()
    }
  }, [releaseObjectUrl])

  const setFile = useCallback(
    (file: File, origin: PhotoOrigin, previewUrl?: string) => {
      releaseObjectUrl()
      const url = previewUrl ?? URL.createObjectURL(file)
      objectUrlRef.current = url
      setSearchError(null)
      setPhoto({ kind: 'file', file, previewUrl: url, origin })
    },
    [releaseObjectUrl],
  )

  const setUrl = useCallback(
    (url: string) => {
      releaseObjectUrl()
      setSearchError(null)
      setPhoto(url.trim() ? { kind: 'url', url: url.trim() } : { kind: 'none' })
    },
    [releaseObjectUrl],
  )

  const clear = useCallback(() => {
    releaseObjectUrl()
    setSearchError(null)
    setPhoto({ kind: 'none' })
  }, [releaseObjectUrl])

  const searchOnline = useCallback(
    async (sku: string) => {
      if (!sku.trim()) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsSearching(true)
      setSearchError(null)
      try {
        const { blob, contentType } = await searchImageBySku(sku, { signal: controller.signal })
        if (controller.signal.aborted) return

        const extension = contentType.split('/')[1] || 'jpg'
        const file = new File([blob], `image-${sku}.${extension}`, { type: contentType })
        setFile(file, 'web')
      } catch (err) {
        if (controller.signal.aborted) return
        setSearchError(err instanceof Error ? err.message : String(err))
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
          setIsSearching(false)
        }
      }
    },
    [setFile],
  )

  const toUpsertFields = useCallback(() => {
    if (photo.kind === 'file') return { photoFile: photo.file, photoUrl: null }
    if (photo.kind === 'url') return { photoFile: null, photoUrl: photo.url }
    return { photoFile: null, photoUrl: null }
  }, [photo])

  // Memoised so consumers can safely put the whole object in an effect's
  // dependency array without re-running it on every render.
  return useMemo(
    () => ({
      photo,
      setFile,
      setUrl,
      clear,
      searchOnline,
      isSearching,
      searchError,
      toUpsertFields,
    }),
    [photo, setFile, setUrl, clear, searchOnline, isSearching, searchError, toUpsertFields],
  )
}
