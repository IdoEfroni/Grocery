const BASE = import.meta.env.VITE_API_BASE_URL;

export async function http(path, options = {}) {
  const hasBody = options && 'body' in options && options.body != null;
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} – ${text}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}
