/**
 * Finding a product photo from a barcode.
 *
 * The API used to do this by scraping DuckDuckGo image search. That stopped
 * working: DuckDuckGo now returns 403 from its image endpoint for non-browser
 * clients, so every call failed after burning several seconds. It could not be
 * repaired with better parsing -- the token still parsed, the API refused us.
 * Google's Custom Search API is closed to new customers and shuts down in
 * January 2027, so it is not an option either.
 *
 * What replaces it is deliberately two-tier:
 *
 *  1. Open Food Facts, a barcode database, queried straight from the browser.
 *     When it has the product the photo is the real packaging shot rather than
 *     a guess from the open web. Coverage of Israeli products is patchy, so a
 *     miss is normal and not an error.
 *
 *  2. A link that opens an image search in the phone's own browser. No API, no
 *     key, nothing to block -- the search is performed by the person, who can
 *     also tell at a glance whether the picture is actually the right product.
 *
 * Both run entirely client-side; Open Food Facts serves
 * `Access-Control-Allow-Origin: *` on its API and its image CDN.
 */

/** Databases to try, in the order a grocery shop would need them. */
const OFF_HOSTS = [
  'world.openfoodfacts.org', // food
  'world.openbeautyfacts.org', // toiletries, cosmetics
  'world.openproductsfacts.org', // everything else
] as const

const LOOKUP_TIMEOUT_MS = 8000

export interface FoundProductImage {
  file: File
  /** Object URL for preview. The caller owns it and must revoke it. */
  previewUrl: string
  /** Product name from the database, when it supplied one. */
  productName: string | null
}

interface OffProduct {
  product_name?: string
  image_front_url?: string
  image_url?: string
}

function extensionFor(contentType: string): string {
  const subtype = contentType.split('/')[1]?.split(';')[0]
  return subtype === 'jpeg' ? 'jpg' : (subtype ?? 'jpg')
}

/**
 * Look a barcode up in the Open Food Facts family and return its photo as a
 * File ready to upload. Resolves to null when nothing is found, which is an
 * ordinary outcome rather than a failure.
 */
export async function findProductImageByBarcode(
  barcode: string,
  options: { signal?: AbortSignal } = {},
): Promise<FoundProductImage | null> {
  const sku = barcode.trim()
  if (!sku) return null

  for (const host of OFF_HOSTS) {
    if (options.signal?.aborted) return null

    // Each database gets its own budget so one slow host cannot stall the rest.
    const timer = new AbortController()
    const timeout = setTimeout(() => timer.abort(), LOOKUP_TIMEOUT_MS)
    const onAbort = () => timer.abort()
    options.signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const url =
        `https://${host}/api/v2/product/${encodeURIComponent(sku)}.json` +
        `?fields=product_name,image_front_url,image_url`
      const res = await fetch(url, { signal: timer.signal })
      if (!res.ok) continue

      const body = (await res.json()) as { status?: number; product?: OffProduct }
      // status 1 means the barcode is known; anything else is a miss.
      if (body.status !== 1 || !body.product) continue

      // Prefer the front-of-pack shot: it is what someone recognises on a shelf.
      const imageUrl = body.product.image_front_url || body.product.image_url
      if (!imageUrl) continue

      const imageRes = await fetch(imageUrl, { signal: timer.signal })
      if (!imageRes.ok) continue

      const blob = await imageRes.blob()
      if (!blob.type.startsWith('image/')) continue

      const file = new File([blob], `product-${sku}.${extensionFor(blob.type)}`, {
        type: blob.type,
      })
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        productName: body.product.product_name?.trim() || null,
      }
    } catch {
      // A database being down or slow should not stop the others being tried.
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }

  return null
}

/**
 * An image-search URL for the phone's own browser.
 *
 * Including the product name alongside the barcode matters: a bare barcode
 * tends to surface price-comparison pages, while the name brings back actual
 * packaging shots.
 */
export function buildImageSearchUrl(barcode: string, productName?: string | null): string {
  const parts = [productName?.trim(), barcode.trim()].filter(Boolean)
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(parts.join(' '))}`
}

/**
 * Hosts whose pages people naturally copy the address of while looking for a
 * picture. The address of a results page is an HTML document, so the API
 * rightly refuses it -- but the failure only surfaced on save, as a 400.
 */
const SEARCH_PAGE_PATTERNS = [
  /^https?:\/\/(www\.)?google\.[a-z.]+\/search/i,
  /^https?:\/\/(www\.)?bing\.com\/(images|search)/i,
  /^https?:\/\/duckduckgo\.com\/\?/i,
  /^https?:\/\/(www\.)?images\.google\./i,
  /^https?:\/\/(www\.)?ecosia\.org\/images/i,
  /^https?:\/\/(www\.)?yandex\.[a-z.]+\/images/i,
]

export type PhotoUrlIssue = 'search-page' | null

/**
 * Spot a URL that cannot possibly be a photo, before it is submitted.
 *
 * Deliberately narrow: it only flags search-results pages, which are
 * unmistakable. Guessing more broadly -- say, requiring a file extension --
 * would reject plenty of legitimate image URLs that carry none.
 */
export function diagnosePhotoUrl(url: string): PhotoUrlIssue {
  const trimmed = url.trim()
  if (!trimmed) return null
  return SEARCH_PAGE_PATTERNS.some((p) => p.test(trimmed)) ? 'search-page' : null
}

/** Whether this browser can read images out of the clipboard. */
export function canReadClipboardImages(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
}

/**
 * Pull an image off the clipboard.
 *
 * This is what makes the search link practical on a phone: copy the image in
 * the browser, come back, paste. Without it the round trip is save-to-gallery,
 * switch app, then find the file again.
 */
export async function readImageFromClipboard(): Promise<File | null> {
  if (!canReadClipboardImages()) return null

  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    return new File([blob], `pasted-${Date.now()}.${extensionFor(type)}`, { type })
  }
  return null
}
