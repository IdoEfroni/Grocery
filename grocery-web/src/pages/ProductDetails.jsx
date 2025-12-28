// src/pages/ProductDetails.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { getProductById, updateProduct, deleteProduct } from '../api/products';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [product, setProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Local edit form state (pre-filled from product)
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    sku: '',
  });

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const p = await getProductById(id);
        setProduct(p);
        setForm({
          name: p.name ?? '',
          description: p.description ?? '',
          price: String(p.price ?? ''),
          sku: p.sku ?? '',
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

async function handleSave(e) {
  e.preventDefault();
  if (!form.name.trim()) { alert('Name is required'); return; }
  const priceNum = Number(form.price);
  if (Number.isNaN(priceNum) || priceNum < 0) { alert('Price must be >= 0'); return; }

  // ✅ confirmation popup
  const ok = confirm(`Save changes to "${product?.name || form.name}"?`);
  if (!ok) return;

  try {
    setSaving(true);
    await updateProduct(id, {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      price: priceNum,
      sku: form.sku?.trim() || null,
    });
    alert('Product updated.');
    navigate('/'); // back to list
  } catch (e) {
    alert(e.message); // shows 400/409 text from server if any
  } finally {
    setSaving(false);
  }
}

async function handleDelete() {
  if (!confirm(`Delete "${product?.name}"? This cannot be undone.`)) return;
  try {
    setDeleting(true);
    await deleteProduct(id);
    alert('Product deleted.');
    navigate('/');
  } catch (e) {
    alert(e.message);
  } finally {
    setDeleting(false);
  }
}

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (error)   return <div style={{ padding: 16, color: 'red' }}>{error}</div>;
  if (!product) return <div style={{ padding: 16 }}>Not found.</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
      <h2>Update Product</h2>

      <div style={{ marginBottom: 16 }}>
        <Link to="/">← Back to list</Link>
      </div>

      {/* Simple read-only summary */}
      <div style={{ marginBottom: 16, opacity: 0.9 }}>
        <b>Current:</b> {product.name} | SKU: {product.sku ?? '-'} | Price: {product.price?.toFixed?.(2)}
      </div>

      {/* Update form */}
      <form onSubmit={handleSave} style={{ textAlign: 'left' }}>
        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>Name *</div>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>Description</div>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>Price *</div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>
            <div style={{ marginBottom: 4 }}>SKU</div>
            <input
              value={form.sku}
              onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))}
              placeholder="Optional, must be unique"
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit">Save</button>
          <button type="button" onClick={handleDelete}>Delete</button>
          <button type="button" onClick={() => navigate('/')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
