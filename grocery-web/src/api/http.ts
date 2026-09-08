const BASE = import.meta.env.VITE_API_BASE_URL

/** Default ceiling for a single request. Store Wi-Fi is often slow, not dead. */
const DEFAULT_TIMEOUT_MS = 20_000

/**
 * A failed HTTP response, carrying its status as a number.
 *
 * Callers previously had to sniff `String(e.message).startsWith('404')` against
 * a hand-assembled string, which also matched 404s produced by a proxy or CDN
 * and turned them into "product not found". Check `err.status === 404` instead.
 */
export class ApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, statusText: string, body: string) {
    super(`${status} ${statusText}${body ? ` – ${body}` : ''}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  get isNotFound() {
    return this.status === 404
  }
}

/** The request was aborted by the caller, or timed out. */
export class ApiTimeoutError extends Error {
  constructor() {
    super('The request timed out.')
    this.name = 'ApiTimeoutError'
  }
}

export interface HttpOptions extends Omit<RequestInit, 'signal'> {
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * Combine a caller's abort signal with a timeout.
 *
 * Built by hand rather than with `AbortSignal.any` + `AbortSignal.timeout`,
 * which only reached Safari in 17.4 -- this app targets older iPhones.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

export async function http<T = unknown>(path: string, options: HttpOptions = {}): Promise<T> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options

  const hasBody = init.body != null
  const isFormData = hasBody && init.body instanceof FormData

  const headers = {
    // Content-Type is deliberately omitted for FormData so the browser can set
    // it together with the multipart boundary.
    ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers ?? {}),
  }

  const timeout = withTimeout(signal, timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, signal: timeout.signal })
  } catch (err) {
    if (timeout.didTimeOut()) throw new ApiTimeoutError()
    throw err
  } finally {
    timeout.cleanup()
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, res.statusText, body)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Raw fetch for endpoints that return binary rather than JSON. */
export async function httpBlob(
  path: string,
  options: HttpOptions = {},
): Promise<{ blob: Blob; contentType: string }> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options
  const timeout = withTimeout(signal, timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, signal: timeout.signal })
  } catch (err) {
    if (timeout.didTimeOut()) throw new ApiTimeoutError()
    throw err
  } finally {
    timeout.cleanup()
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, res.statusText, body)
  }

  return {
    blob: await res.blob(),
    contentType: res.headers.get('content-type') || 'image/jpeg',
  }
}
