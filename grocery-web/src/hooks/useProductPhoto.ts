import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findProductImageByBarcode, readImageFromClipboard } from '../api/productImage'

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
  pasteFromClipboard: () => Promise<void>
  isSearching: boolean
  searchError: string | null
  /** True after a lookup that completed but found nothing. Not a failure. */
  notFound: boolean
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
  const [notFound, setNotFound] = useState(false)

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
      setNotFound(false)
      setPhoto({ kind: 'file', file, previewUrl: url, origin })
    },
    [releaseObjectUrl],
  )

  const setUrl = useCallback(
    (url: string) => {
      releaseObjectUrl()
      setSearchError(null)
      setNotFound(false)
      setPhoto(url.trim() ? { kind: 'url', url: url.trim() } : { kind: 'none' })
    },
    [releaseObjectUrl],
  )

  const clear = useCallback(() => {
    releaseObjectUrl()
    setSearchError(null)
    setNotFound(false)
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
      setNotFound(false)
      try {
        const found = await findProductImageByBarcode(sku, { signal: controller.signal })
        if (controller.signal.aborted) return

        if (found) {
          setFile(found.file, 'web', found.previewUrl)
        } else {
          // Coverage of Israeli barcodes is thin, so this is the common path.
          // It is reported as "nothing found", not as an error, because the
          // next step is simply to search by hand or take a photo.
          setNotFound(true)
        }
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

  const pasteFromClipboard = useCallback(async () => {
    setSearchError(null)
    try {
      const file = await readImageFromClipboard()
      if (file) {
        setFile(file, 'web')
      } else {
        setSearchError('clipboard-empty')
      }
    } catch {
      // Denied permission or an unsupported browser both land here.
      setSearchError('clipboard-denied')
    }
  }, [setFile])

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
      pasteFromClipboard,
      isSearching,
      searchError,
      notFound,
      toUpsertFields,
    }),
    [photo, setFile, setUrl, clear, searchOnline, pasteFromClipboard, isSearching, searchError, notFound, toUpsertFields],
  )
}
