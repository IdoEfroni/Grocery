// src/App.jsx
import { Route, Routes, Link } from 'react-router-dom';
import { useLanguage } from './contexts/LanguageContext';
import { Container, Navbar, Nav } from 'react-bootstrap';
import './App.css';
import LanguageToggle from './components/LanguageToggle/LanguageToggle';
import BrowsePage from './pages/BrowsePage/BrowsePage';
import CreatePage from './pages/CreatePage/CreatePage';
import LookupPage from './pages/LookupPage/LookupPage';
import ProductPage from './pages/ProductPage/ProductPage';
import ProductDetails from './pages/ProductDetails';
import ProductViewer from './pages/ProductViewer/ProductViewer';

export default function App() {
  const { t, dir } = useLanguage();

  return (
    <div dir={dir}>
      <Navbar bg="dark" variant="dark" expand="sm" className="mb-3">
        <Container>
          <Navbar.Brand as={Link} to="/">{t('app.title')}</Navbar.Brand>
          <Navbar.Toggle aria-controls="main-nav" />
          <Navbar.Collapse id="main-nav" className="justify-content-between">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/" end>{t('navigation.browse')}</Nav.Link>
              <Nav.Link as={Link} to="/view">{t('navigation.displayItems')}</Nav.Link>
              <Nav.Link as={Link} to="/create">{t('navigation.create')}</Nav.Link>
            </Nav>
            <LanguageToggle />
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Container className="pb-4">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/view" element={<ProductViewer />} />
          <Route path="/create" element={<CreatePage />} />
          {/* Price lookup by barcode -- the primary screen. */}
          <Route path="/lookup/:sku" element={<LookupPage />} />
          {/* Read-only price view; editing is a deliberate second step so
              nobody changes a product while just checking a price. */}
          <Route path="/products/:id" element={<ProductPage />} />
          <Route path="/products/:id/edit" element={<ProductDetails />} />
        </Routes>
      </Container>
    </div>
  );
}
