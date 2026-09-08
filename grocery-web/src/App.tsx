import { Route, Routes, Link, NavLink } from 'react-router-dom'
import { Container, Navbar, Nav } from 'react-bootstrap'
import { useLanguage } from './contexts/LanguageContext'
import './App.css'
import LanguageToggle from './components/LanguageToggle/LanguageToggle'
import BottomNav from './components/BottomNav/BottomNav'
import Icon, { type IconName } from './components/Icon/Icon'
import BrowsePage from './pages/BrowsePage/BrowsePage'
import CartPage from './pages/CartPage/CartPage'
import CreatePage from './pages/CreatePage/CreatePage'
import LookupPage from './pages/LookupPage/LookupPage'
import ProductPage from './pages/ProductPage/ProductPage'
import ProductDetails from './pages/ProductDetails'
import ProductViewer from './pages/ProductViewer/ProductViewer'

interface NavItem {
  to: string
  icon: IconName
  labelKey: string
  /** Only '/' matches exactly; the others own their whole subtree. */
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', icon: 'home', labelKey: 'navigation.browse', end: true },
  { to: '/view', icon: 'list', labelKey: 'navigation.displayItems' },
  { to: '/cart', icon: 'receipt', labelKey: 'navigation.cart' },
  { to: '/create', icon: 'plus', labelKey: 'navigation.create' },
]

export default function App() {
  const { t, dir } = useLanguage()

  return (
    <div dir={dir} className="app-shell">
      <Navbar bg="dark" variant="dark" className="app-shell__bar">
        <Container className="justify-content-between">
          <Navbar.Brand as={Link} to="/">
            {t('app.title')}
          </Navbar.Brand>

          {/* Links live here from md up, where there is room. Below that the
              bottom bar carries them, so there is no hamburger to open. */}
          <Nav className="app-shell__links">
            {NAV.map(({ to, icon, labelKey, end }) => (
              <Nav.Link key={to} as={NavLink} to={to} end={end}>
                <Icon name={icon} /> {t(labelKey)}
              </Nav.Link>
            ))}
          </Nav>

          <LanguageToggle />
        </Container>
      </Navbar>

      <Container className="app-shell__content">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/view" element={<ProductViewer />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/create" element={<CreatePage />} />
          {/* Price lookup by barcode -- the primary screen. */}
          <Route path="/lookup/:sku" element={<LookupPage />} />
          {/* Read-only price view; editing is a deliberate second step so
              nobody changes a product while just checking a price. */}
          <Route path="/products/:id" element={<ProductPage />} />
          <Route path="/products/:id/edit" element={<ProductDetails />} />
        </Routes>
      </Container>

      <BottomNav />
    </div>
  )
}
