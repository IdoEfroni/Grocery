import { NavLink } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import Icon, { type IconName } from '../Icon/Icon'
import './BottomNav.css'

interface Destination {
  to: string
  icon: IconName
  labelKey: string
  /** Only '/' should match exactly; the others own their whole subtree. */
  end?: boolean
}

const DESTINATIONS: Destination[] = [
  { to: '/', icon: 'home', labelKey: 'navigation.browse', end: true },
  { to: '/view', icon: 'list', labelKey: 'navigation.displayItems' },
  { to: '/cart', icon: 'receipt', labelKey: 'navigation.cart' },
  { to: '/create', icon: 'plus', labelKey: 'navigation.create' },
]

/**
 * Primary navigation on phones.
 *
 * Replaces a collapsed navbar, where every destination sat behind a hamburger:
 * two taps, and nothing on screen to suggest the other screens existed. A
 * bottom bar is always visible and sits in the thumb's reach, which matters for
 * an app used one-handed while holding a product in the other.
 *
 * Icons carry visible labels rather than standing alone. An icon on its own is
 * a guessing game for someone new to the app, and new staff are the main user.
 *
 * Hidden from md upwards, where the top navbar has room to show the same links.
 */
export default function BottomNav() {
  const { t } = useLanguage()

  return (
    <nav className="bottom-nav" aria-label={t('navigation.primary')}>
      {DESTINATIONS.map(({ to, icon, labelKey, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? ' is-active' : ''}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={icon} className="bottom-nav__icon" size="1.5rem" />
              <span className="bottom-nav__label">{t(labelKey)}</span>
              {/* aria-current is what tells a screen reader which screen you
                  are on; the colour change alone would not. */}
              {isActive && <span className="visually-hidden">{t('navigation.current')}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
