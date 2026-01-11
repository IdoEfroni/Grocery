// src/api/products.js
import { http } from './http';

const BASE = import.meta.env.VITE_API_BASE_URL;

export function searchProducts(query = '', page = 1, pageSize = 10) {
  const q = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize) });
  return http(`/api/products?${q.toString()}`);
}

export function deleteProduct(id) {
  return http(`/api/products/${id}`, { method: 'DELETE' });
}

// add (already from previous step)
export function getBySku(sku) {
  return http(`/api/products/by-sku/${encodeURIComponent(sku)}`);
}

export function comparePrices(shoppingCity, sku, numResults = 100) {
  const q = new URLSearchParams({
    shopping_city: shoppingCity,
    sku: sku,
    num_results: String(numResults),
  });
  return http(`/api/products/compare-prices?${q.toString()}`);
}

export async function searchImageBySku(sku) {
  const res = await fetch(`${BASE}/api/products/Web-photo-by-sku/${encodeURIComponent(sku)}`);
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} – ${text}`);
  }
  
  const blob = await res.blob();
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  
  return { blob, contentType };
}

export function createProduct(dto) {
  const formData = new FormData();
  formData.append('Name', dto.name);
  formData.append('Description', dto.description || '');
  formData.append('Price', String(dto.price));
  formData.append('Sku', dto.sku || '');
  
  if (dto.photoFile) {
    formData.append('PhotoFile', dto.photoFile);
  } else if (dto.photoUrl) {
    formData.append('PhotoUrl', dto.photoUrl);
  }

  return http(`/api/products`, {
    method: 'POST',
    body: formData,
    headers: {}, // Don't set Content-Type, let browser set it with boundary
  });
}

// NEW: get by id
export function getProductById(id) {
  return http(`/api/products/${id}`);
}

// NEW: update
export function updateProduct(id, dto) {
  const formData = new FormData();
  formData.append('Name', dto.name);
  formData.append('Description', dto.description || '');
  formData.append('Price', String(dto.price));
  formData.append('Sku', dto.sku || '');
  
  if (dto.photoFile) {
    formData.append('PhotoFile', dto.photoFile);
  } else if (dto.photoUrl) {
    formData.append('PhotoUrl', dto.photoUrl);
  }

  return http(`/api/products/${id}`, {
    method: 'PUT',
    body: formData,
    headers: {}, // Don't set Content-Type, let browser set it with boundary
  });
}

export function getPhotoUrl(sku) {
  return `${BASE}/api/products/photo/${encodeURIComponent(sku)}`;
}