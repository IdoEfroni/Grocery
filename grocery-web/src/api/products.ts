import { http, httpBlob } from './http'

const BASE = import.meta.env.VITE_API_BASE_URL

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  sku: string | null
  createdAt: string
  updatedAt: string
}

export interface PagedResult<T> {
  page: number
  pageSize: number
  total: number
  items: T[]
}

export interface ProductCompareResponse {
  productName: string
  description: string
  /** Formatted to 2dp by the API, or the literal string 'N/A'. */
  averagePrice: string
}

export interface ProductUpsert {
  name: string
  description?: string | null
  price: number
  sku?: string | null
  photoFile?: File | null
  photoUrl?: string | null
}

interface RequestOptions {
  signal?: AbortSignal
}

export function searchProducts(
  query = '',
  page = 1,
  pageSize = 10,
  options: RequestOptions = {},
): Promise<PagedResult<Product>> {
  const q = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize) })
  return http(`/api/products?${q}`, options)
}

export function getProductById(id: string, options: RequestOptions = {}): Promise<Product> {
  return http(`/api/products/${id}`, options)
}

export function getBySku(sku: string, options: RequestOptions = {}): Promise<Product> {
  return http(`/api/products/by-sku/${encodeURIComponent(sku)}`, options)
}

export function deleteProduct(id: string, options: RequestOptions = {}): Promise<void> {
  return http(`/api/products/${id}`, { ...options, method: 'DELETE' })
}

export function comparePrices(
  shoppingCity: string,
  sku: string,
  numResults = 100,
  options: RequestOptions = {},
): Promise<ProductCompareResponse> {
  const q = new URLSearchParams({
    shopping_city: shoppingCity,
    sku,
    num_results: String(numResults),
  })
  return http(`/api/products/compare-prices?${q}`, options)
}

/**
 * @deprecated The API backs this with a DuckDuckGo image scrape that no longer
 * works -- DuckDuckGo returns 403 to non-browser clients, so it fails on every
 * call after several seconds. Product photos now come from
 * `findProductImageByBarcode` in `./productImage`, which queries Open Food
 * Facts directly from the browser. Kept only so the endpoint is not silently
 * forgotten; delete it along with DuckDuckGoImageService in the API.
 */
export function searchImageBySku(sku: string, options: RequestOptions = {}) {
  return httpBlob(`/api/products/Web-photo-by-sku/${encodeURIComponent(sku)}`, options)
}

/**
 * The API binds these from a multipart form ([FromForm] ProductUpsertDto), so
 * field names must match the C# property names exactly.
 *
 * Note the API prefers PhotoFile over PhotoUrl when both are present, so only
 * one is ever sent.
 */
function toFormData(dto: ProductUpsert): FormData {
  const formData = new FormData()
  formData.append('Name', dto.name)
  formData.append('Description', dto.description || '')
  formData.append('Price', String(dto.price))
  formData.append('Sku', dto.sku || '')

  if (dto.photoFile) {
    formData.append('PhotoFile', dto.photoFile)
  } else if (dto.photoUrl) {
    formData.append('PhotoUrl', dto.photoUrl)
  }

  return formData
}

export function createProduct(
  dto: ProductUpsert,
  options: RequestOptions = {},
): Promise<Product> {
  return http('/api/products', {
    ...options,
    method: 'POST',
    body: toFormData(dto),
    // Uploading a camera photo over cellular needs more headroom than a
    // plain JSON call.
    timeoutMs: 60_000,
  })
}

export function updateProduct(
  id: string,
  dto: ProductUpsert,
  options: RequestOptions = {},
): Promise<Product> {
  return http(`/api/products/${id}`, {
    ...options,
    method: 'PUT',
    body: toFormData(dto),
    timeoutMs: 60_000,
  })
}

export function getPhotoUrl(sku: string): string {
  return `${BASE}/api/products/photo/${encodeURIComponent(sku)}`
}
