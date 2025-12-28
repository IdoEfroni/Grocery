// src/api/products.js
import { http } from './http';

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

export function createProduct(dto) {
  return http(`/api/products`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

// NEW: get by id
export function getProductById(id) {
  return http(`/api/products/${id}`);
}

// NEW: update
export function updateProduct(id, dto) {
  return http(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(dto),
  });
}
