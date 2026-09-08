import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError, ApiTimeoutError, http } from './http'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('http', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: '1', name: 'Milk' }))
    await expect(http('/api/products/1')).resolves.toEqual({ id: '1', name: 'Milk' })
  })

  it('returns undefined for 204 No Content', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))
    await expect(http('/api/products/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('throws an ApiError carrying a numeric status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Not found', { status: 404, statusText: 'Not Found' }),
    )

    // The point of the typed error: callers check `status`, instead of
    // string-matching a message that a proxy's 404 page could also satisfy.
    const err = await http('/api/products/by-sku/123').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).isNotFound).toBe(true)
  })

  it('distinguishes a 500 from a 404', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<html>boom</html>', { status: 500, statusText: 'Internal Server Error' }),
    )
    const err = (await http('/api/products').catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(500)
    expect(err.isNotFound).toBe(false)
  })

  it('sets a JSON content type for a body, but not for FormData', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}))

    await http('/api/products', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
    })

    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}))
    const form = new FormData()
    form.append('Name', 'Milk')
    await http('/api/products', { method: 'POST', body: form })
    // Omitted so the browser can add the multipart boundary itself.
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty('Content-Type')
  })

  it('raises ApiTimeoutError when the request exceeds its budget', async () => {
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    await expect(http('/api/products', { timeoutMs: 10 })).rejects.toBeInstanceOf(ApiTimeoutError)
  })

  it('propagates a caller abort', async () => {
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const promise = http('/api/products', { signal: controller.signal })
    controller.abort()

    const err = await promise.catch((e: unknown) => e)
    // A caller abort is not a timeout; it must stay distinguishable.
    expect(err).not.toBeInstanceOf(ApiTimeoutError)
    expect((err as DOMException).name).toBe('AbortError')
  })
})
