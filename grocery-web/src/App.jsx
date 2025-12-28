// src/App.jsx
import { useEffect, useState } from 'react';
import './App.css';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { searchProducts, deleteProduct, getBySku, createProduct } from './api/products';
import ProductDetails from './pages/ProductDetails';

export default function App() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1>Grocery — Products</h1>

      {/* Simple top nav */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #666', paddingBottom: 8 }}>
        <TopTab to="/" label="Browse" end />
        <TopTab to="/create" label="Create" />
      </div>

      {/* Route table */}
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/products/:id" element={<ProductDetails />} />
      </Routes>
    </div>
  );
}

function TopTab({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        padding: '8px 14px',
        borderBottom: isActive ? '3px solid #646cff' : '3px solid transparent',
        textDecoration: 'none',
        color: 'inherit'
      })}
    >
      {label}
    </NavLink>
  );
}

/* -------------------- BROWSE PAGE -------------------- */
function BrowsePage() {
  const [query, setQuery] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [modalSku, setModalSku] = useState('');

  const navigate = useNavigate();

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await searchProducts(query, page, pageSize);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page]);

  async function handleFindBySku() {
    const sku = skuSearch.trim();
    if (!sku) return;
    try {
      const p = await getBySku(sku);
      // ✅ If found: go to the product "update page"
      navigate(`/products/${p.id}`);
    } catch (e) {
      if (String(e.message).startsWith('404')) {
        // Not found -> offer to create (keeps your previous behavior for “no result”)
        setModalSku(sku);
        setShowModal(true);
      } else {
        alert(e.message);
      }
    }
  }

  return (
    <>
      {/* General text search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name / SKU / description"
          style={{ flex: 1 }}
        />
        <button onClick={() => { setPage(1); load(); }}>Search</button>
      </div>

      {/* Exact SKU finder */}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px 0' }}>
        <input
          value={skuSearch}
          onChange={(e) => setSkuSearch(e.target.value)}
          placeholder="Find by exact SKU"
          style={{ flex: 1 }}
        />
        <button onClick={handleFindBySku}>Find by SKU</button>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && (
        <>
          <table width="100%" border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">SKU</th>
                <th align="right">Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.sku ?? '-'}</td>
                  <td align="right">{p.price.toFixed(2)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div className="actions">
                      {/* Make Update look/behave like a button */}
                      <Link to={`/products/${p.id}`} className="btn btn--primary">Update</Link>

                      {/* Make Delete match too */}
                      <button
                        className="btn btn--danger"
                        onClick={async () => {
                          if (confirm(`Delete "${p.name}"?`)) {
                            await deleteProduct(p.id);
                            load();
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan="4">No products</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span>
              Page {page} / {Math.max(1, Math.ceil((data.total || 0) / pageSize))}
            </span>
            <button
              disabled={page >= Math.ceil((data.total || 0) / pageSize)}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Minimal modal for "SKU not found -> create?" */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <h3 style={{ marginTop: 0 }}>No product found</h3>
          <p>No product with SKU <b>{modalSku}</b> was found. Would you like to create it?</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowModal(false)}>Cancel</button>
            <Link
              to="/create"
              state={{ prefillSku: modalSku }}
              onClick={() => setShowModal(false)}
            >
              <button>Create</button>
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}

/* -------------------- CREATE PAGE -------------------- */
import { useLocation } from 'react-router-dom';
function CreatePage() {
  const location = useLocation();
  // allow prefill from "SKU not found" modal
  const prefillSku = location.state?.prefillSku || '';

  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    sku: prefillSku,
  });

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!newProduct.name.trim()) { alert('Name is required'); return; }
    const priceNum = Number(newProduct.price);
    if (Number.isNaN(priceNum) || priceNum < 0) { alert('Price must be a number >= 0'); return; }

    try {
      const created = await createProduct({
        name: newProduct.name.trim(),
        description: newProduct.description?.trim() || null,
        price: priceNum,
        sku: newProduct.sku?.trim() || null,
      });
      alert(`Created "${created.name}" successfully.`);
      setNewProduct({ name: '', description: '', price: '', sku: '' });
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <form onSubmit={handleCreateSubmit} style={{ textAlign: 'left', maxWidth: 600 }}>
      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>Name *</div>
          <input
            value={newProduct.name}
            onChange={(e) => setNewProduct(p => ({ ...p, name: e.target.value }))}
            required
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>Description</div>
          <textarea
            value={newProduct.description}
            onChange={(e) => setNewProduct(p => ({ ...p, description: e.target.value }))}
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
            value={newProduct.price}
            onChange={(e) => setNewProduct(p => ({ ...p, price: e.target.value }))}
            required
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>SKU</div>
          <input
            value={newProduct.sku}
            onChange={(e) => setNewProduct(p => ({ ...p, sku: e.target.value }))}
            placeholder="Optional, must be unique"
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit">Create Product</button>
        <button type="button" onClick={() => setNewProduct({ name: '', description: '', price: '', sku: '' })}>
          Reset
        </button>
      </div>
    </form>
  );
}

/* -------------------- Simple Modal -------------------- */
function Modal({ children, onClose }) {
  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const modalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const modalCardStyle = {
  background: '#222',
  color: '#fff',
  padding: 16,
  borderRadius: 8,
  maxWidth: 420,
  width: '100%',
  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
};


