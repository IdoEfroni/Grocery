import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/http'
import { getBySku } from '../api/products'

export interface UseSkuLookupResult {
  /** Look up a SKU and navigate to the product, or to a prefilled create form. */
  lookup: (sku: string) => Promise<void>
  isLooking: boolean
  error: string | null
  clearError: () => void
}

/**
 * The scan -> destination step of the core journey.
 *
 * Previously a scan only filled a text box, leaving the user to tap Find, then
 * Create, then Fill, then Search Image. Here the lookup fires immediately and
 * routes by outcome: a known SKU opens the product, an unknown one opens Create
 * already carrying the SKU so the form can start its own autofill on arrival.
 */
export function useSkuLookup(): UseSkuLookupResult {
  const navigate = useNavigate()
  const [isLooking, setIsLooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const lookup = useCallback(
    async (rawSku: string) => {
      const sku = rawSku.trim()
      if (!sku) return

      // A second scan supersedes the first; drop the in-flight request so a
      // slow response cannot navigate somewhere the user has moved on from.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsLooking(true)
      setError(null)

      try {
        const product = await getBySku(sku, { signal: controller.signal })
        if (controller.signal.aborted) return
        navigate(`/products/${product.id}`)
      } catch (err) {
        if (controller.signal.aborted) return

        if (err instanceof ApiError && err.isNotFound) {
          navigate('/create', { state: { prefillSku: sku, autoFill: true } })
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
          setIsLooking(false)
        }
      }
    },
    [navigate],
  )

  const clearError = useCallback(() => setError(null), [])

  return { lookup, isLooking, error, clearError }
}
