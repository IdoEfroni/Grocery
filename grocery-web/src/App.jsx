// src/App.jsx
import { Route, Routes } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import './App.css';
import TopTab from './components/TopTab/TopTab';
import LanguageToggle from './components/LanguageToggle/LanguageToggle';
import BrowsePage from './pages/BrowsePage/BrowsePage';
import CreatePage from './pages/CreatePage/CreatePage';
import ProductDetails from './pages/ProductDetails';

export default function App() {
  const { t, dir } = useLanguage();

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, position: 'relative' }} dir={dir}>
      <LanguageToggle />
      <h1>{t('app.title')}</h1>

      {/* Simple top nav */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #666', paddingBottom: 8 }}>
        <TopTab to="/" label={t('navigation.browse')} end />
        <TopTab to="/create" label={t('navigation.create')} />
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


