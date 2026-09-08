import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export interface UseSkuLookupResult {
  /** Send a scanned or typed barcode to the price lookup screen. */
  lookup: (sku: string) => void
}

/**
 * Routes a barcode to the lookup screen.
 *
 * Fetching deliberately lives in LookupPage rather than here. The result needs
 * its own URL so a lookup can be reloaded, shared, or reached from a scan
 * chain, and keeping one owner of the request removes a class of races where a
 * slow lookup navigated somewhere the user had already moved on from.
 */
export function useSkuLookup(): UseSkuLookupResult {
  const navigate = useNavigate()

  const lookup = useCallback(
    (rawSku: string) => {
      const sku = rawSku.trim()
      if (!sku) return
      navigate(`/lookup/${encodeURIComponent(sku)}`)
    },
    [navigate],
  )

  return { lookup }
}
